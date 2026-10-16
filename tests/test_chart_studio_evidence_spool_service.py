"""File-spool reader tests; synthetic records only, never connect to MT5."""
import asyncio
import os
import subprocess
import threading
import time
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from chart_studio.evidence_spool_service import SpoolFileConsumer, run_spool_service
from chart_studio.evidence_api import install_evidence_routes
from test_chart_studio_evidence_spool import line, private_root, record
from test_chart_studio_evidence_models import context
from test_chart_studio_evidence_store import store as evidence_store


@pytest.fixture
def spool_root(private_root):
    root = private_root / 'spool'
    root.mkdir()
    archive = root / 'archive'
    archive.mkdir()
    if os.name == 'posix':
        root.chmod(0o700); archive.chmod(0o700)
    else:
        user = subprocess.check_output(['whoami','/user','/fo','csv','/nh'],text=True).strip().split(',')[-1].strip('"')
        script = r'''$p=$env:CHART_STUDIO_PRIVATE_ROOT;$sids=@($env:CHART_STUDIO_TEST_SID,'S-1-5-18','S-1-5-32-544');$acl=[System.Security.AccessControl.DirectorySecurity]::new();$acl.SetAccessRuleProtection($true,$false);foreach($sid in $sids){$id=[System.Security.Principal.SecurityIdentifier]::new($sid);$rule=[System.Security.AccessControl.FileSystemAccessRule]::new($id,'FullControl','ContainerInherit,ObjectInherit','None','Allow');$acl.AddAccessRule($rule)};([System.IO.DirectoryInfo]::new($p)).SetAccessControl($acl)'''
        env={**os.environ,'CHART_STUDIO_PRIVATE_ROOT':str(archive),'CHART_STUDIO_TEST_SID':user}
        subprocess.run(['powershell','-NoProfile','-NonInteractive','-Command',script],check=True,env=env)
    return root


def consumer(store, root):
    return SpoolFileConsumer(store, root, producers={'titan': 'titan_demo'}, excluded_roots=[Path.cwd()])


def write_private(path, data):
    path.write_bytes(data)
    if os.name == 'posix': path.chmod(0o600)


def test_active_file_reads_complete_lines_and_resumes_partial_tail(private_root, spool_root):
    store = evidence_store(private_root)
    active = spool_root / 'titan_demo.active.ndjson'
    first = line(record(seq=1)).encode()
    row2 = record(seq=2)
    row2['envelope']['id'] = row2['envelope']['payload']['eventId'] = 'event_2'
    row2['envelope']['payload']['correlationId'] = 'corr_2'
    second = line(row2).encode()
    write_private(active, first + second[:-3])

    result = consumer(store, spool_root).poll_once()

    assert result['titan_demo']['imported'] == 1
    assert result['titan_demo']['waitingForNewline'] is True
    assert len(store.read(context(), kind='DECISION')['records']) == 1

    with active.open('ab') as stream:
        stream.write(second[-3:])
    resumed = consumer(store, spool_root).poll_once()
    assert resumed['titan_demo']['imported'] == 1
    assert len(store.read(context(), kind='DECISION')['records']) == 2


def test_preexisting_consumers_reload_sequence_cursor_under_producer_lock(private_root, spool_root):
    store = evidence_store(private_root)
    active = spool_root / 'titan_demo.active.ndjson'
    row1, row2 = record(seq=1), record(seq=2)
    row2['envelope']['id'] = row2['envelope']['payload']['eventId'] = 'event_2'
    row2['envelope']['payload']['correlationId'] = 'corr_2'
    write_private(active, (line(row1) + line(row2)).encode())
    first_consumer = SpoolFileConsumer(store, spool_root, producers={'titan':'titan_demo'}, excluded_roots=[Path.cwd()], records_per_poll=1)
    second_consumer = SpoolFileConsumer(store, spool_root, producers={'titan':'titan_demo'}, excluded_roots=[Path.cwd()], records_per_poll=1)

    first = first_consumer.poll_once()['titan_demo']
    second = second_consumer.poll_once()['titan_demo']

    assert first['imported'] == second['imported'] == 1
    assert second['gapCount'] == 0
    assert second['gapObserved'] is False
    assert len(store.read(context(), kind='DECISION')['records']) == 2


def test_ready_segment_cannot_revert_to_active_after_partial_import(private_root, spool_root):
    store = evidence_store(private_root)
    ready = spool_root / 'titan_demo.1-2.ready.ndjson'
    row1, row2 = record(seq=1), record(seq=2)
    row2['envelope']['id'] = row2['envelope']['payload']['eventId'] = 'event_2'
    row2['envelope']['payload']['correlationId'] = 'corr_2'
    write_private(ready, (line(row1) + line(row2)).encode())
    service = SpoolFileConsumer(store, spool_root, producers={'titan':'titan_demo'}, excluded_roots=[Path.cwd()], records_per_poll=1)

    assert service.poll_once()['titan_demo']['imported'] == 1
    ready.rename(spool_root / 'titan_demo.active.ndjson')

    result = service.poll_once()['titan_demo']
    assert result['code'] == 'FILE_IDENTITY_CHANGED'
    assert result['imported'] == 0
    assert len(store.read(context(), kind='DECISION')['records']) == 1


def test_replaced_ready_segment_is_not_archived_after_import(private_root, spool_root):
    store = evidence_store(private_root)
    ready = spool_root / 'titan_demo.1-1.ready.ndjson'
    original = record(seq=1)
    replacement = record(seq=1)
    replacement['envelope']['id'] = replacement['envelope']['payload']['eventId'] = 'replacement_event'
    replacement['envelope']['payload']['correlationId'] = 'replacement_corr'
    write_private(ready, line(original).encode())
    replacement_path = spool_root / 'replacement.tmp'
    write_private(replacement_path, line(replacement).encode())
    append = store.append

    def replace_after_append(*args, **kwargs):
        result = append(*args, **kwargs)
        os.replace(replacement_path, ready)
        return result

    store.append = replace_after_append
    result = consumer(store, spool_root).poll_once()['titan_demo']

    assert result['code'] == 'FILE_IDENTITY_CHANGED'
    assert (spool_root / 'titan_demo.1-1.ready.ndjson').exists()
    assert not (spool_root / 'archive' / ready.name).exists()
    records = store.read(context(), kind='DECISION')['records']
    assert len(records) == 1 and records[0]['id'] == 'event_1'


def test_ready_segment_is_range_checked_archived_and_gap_remains_visible(private_root, spool_root):
    store = evidence_store(private_root)
    ready = spool_root / 'titan_demo.1-3.ready.ndjson'
    row1 = record(seq=1)
    row3 = record(seq=3)
    row3['envelope']['id'] = row3['envelope']['payload']['eventId'] = 'event_3'
    row3['envelope']['payload']['correlationId'] = 'corr_3'
    write_private(ready, (line(row1) + line(row3)).encode())

    service = consumer(store, spool_root)
    result = service.poll_once()['titan_demo']

    assert result['imported'] == 2
    assert result['gapCount'] == 1
    assert result['gapObserved'] is True
    assert (spool_root / 'archive' / ready.name).exists()
    assert consumer(store, spool_root).poll_once()['titan_demo']['gapCount'] == 1


def test_ready_segment_rejects_mismatched_bounds(private_root, spool_root):
    store = evidence_store(private_root)
    ready = spool_root / 'titan_demo.1-2.ready.ndjson'
    write_private(ready, line(record(seq=1)).encode())

    result = consumer(store, spool_root).poll_once()['titan_demo']

    assert result['code'] == 'SEGMENT_RANGE_INVALID'
    assert not (spool_root / 'archive' / ready.name).exists()
    assert store.read(context(), kind='DECISION')['records'] == []


def test_ready_segments_reject_overlaps_and_reversed_ranges(private_root, spool_root):
    store = evidence_store(private_root)
    write_private(spool_root / 'titan_demo.1-3.ready.ndjson', line(record(seq=1)).encode())
    write_private(spool_root / 'titan_demo.3-4.ready.ndjson', line(record(seq=3)).encode())

    result = consumer(store, spool_root).poll_once()['titan_demo']

    assert result['code'] == 'SEGMENT_RANGE_INVALID'
    (spool_root / 'titan_demo.3-4.ready.ndjson').unlink()
    write_private(spool_root / 'titan_demo.5-4.ready.ndjson', line(record(seq=1)).encode())
    reversed_result = consumer(store, spool_root).poll_once()['titan_demo']
    assert reversed_result['code'] == 'SEGMENT_RANGE_INVALID'


def test_crash_after_store_append_replays_same_record_idempotently(private_root, spool_root):
    store = evidence_store(private_root)
    active = spool_root / 'titan_demo.active.ndjson'
    write_private(active, line(record(seq=1)).encode())
    service = consumer(store, spool_root)
    save_cursor = service._save_cursor
    saves = 0

    def crash_after_append(*args):
        nonlocal saves
        saves += 1
        if saves == 2: raise OSError('simulated crash before offset acknowledgement')
        return save_cursor(*args)

    service._save_cursor = crash_after_append
    assert service.poll_once()['titan_demo']['code'] == 'SPOOL_UNAVAILABLE'
    restarted = consumer(store, spool_root)
    replay = restarted.poll_once()['titan_demo']

    assert replay['duplicates'] == 1
    assert replay['imported'] == 0
    assert len(store.read(context(), kind='DECISION')['records']) == 1


def test_crash_after_ready_archive_rename_recovers_without_duplicate(private_root, spool_root):
    store = evidence_store(private_root)
    ready = spool_root / 'titan_demo.1-1.ready.ndjson'
    write_private(ready, line(record(seq=1)).encode())
    service = consumer(store, spool_root)
    service._remove_cursor = lambda *_args: (_ for _ in ()).throw(OSError('simulated crash after archive rename'))

    assert service.poll_once()['titan_demo']['code'] == 'SPOOL_UNAVAILABLE'
    assert (spool_root / 'archive' / ready.name).exists()
    recovered = consumer(store, spool_root).poll_once()['titan_demo']

    assert recovered['code'] == 'IDLE'
    assert len(store.read(context(), kind='DECISION')['records']) == 1


def test_cursor_rejects_replaced_or_truncated_active_file(private_root, spool_root):
    store = evidence_store(private_root)
    active = spool_root / 'titan_demo.active.ndjson'
    write_private(active, line(record(seq=1)).encode())
    service = consumer(store, spool_root)
    assert service.poll_once()['titan_demo']['imported'] == 1
    write_private(active, b'')

    result = consumer(store, spool_root).poll_once()['titan_demo']

    assert result['code'] == 'FILE_IDENTITY_CHANGED'


def test_second_consumer_reports_lock_without_reading(private_root, spool_root):
    store = evidence_store(private_root)
    active = spool_root / 'titan_demo.active.ndjson'
    write_private(active, line(record(seq=1)).encode())
    first = consumer(store, spool_root)
    second = consumer(store, spool_root)

    with first.producer_lock('titan_demo'):
        result = second.poll_once()['titan_demo']

    assert result['code'] == 'CONSUMER_LOCKED'
    assert store.read(context(), kind='DECISION')['records'] == []


def test_consumer_rejects_spool_root_inside_repository(private_root):
    store = evidence_store(private_root)

    with pytest.raises(ValueError):
        SpoolFileConsumer(store, Path.cwd(), producers={'titan': 'titan_demo'}, excluded_roots=[Path.cwd()])


def test_poll_bounds_records_and_exposes_pending_work(private_root, spool_root):
    store = evidence_store(private_root)
    active = spool_root / 'titan_demo.active.ndjson'
    row1, row2 = record(seq=1), record(seq=2)
    row2['envelope']['id'] = row2['envelope']['payload']['eventId'] = 'event_2'
    row2['envelope']['payload']['correlationId'] = 'corr_2'
    write_private(active, (line(row1) + line(row2)).encode())
    service = SpoolFileConsumer(store, spool_root, producers={'titan':'titan_demo'}, excluded_roots=[Path.cwd()], records_per_poll=1)

    first = service.poll_once()['titan_demo']
    second = service.poll_once()['titan_demo']

    assert first['imported'] == 1 and first['morePending'] is True
    assert second['imported'] == 1 and second['morePending'] is False
    assert len(store.read(context(), kind='DECISION')['records']) == 2


def test_successful_append_preserves_recovered_store_loss_status(private_root, spool_root):
    store = evidence_store(private_root)
    active = spool_root / 'titan_demo.active.ndjson'
    row1, row2 = record(seq=1), record(seq=2)
    row2['envelope']['id'] = row2['envelope']['payload']['eventId'] = 'event_2'
    row2['envelope']['payload']['correlationId'] = 'corr_2'
    write_private(active, (line(row1) + line(row2)).encode())
    append = store.append

    def append_with_recovery_marker(*args, **kwargs):
        result = append(*args, **kwargs)
        return {**result, 'gapObserved': True, 'lostCount': 2}

    store.append = append_with_recovery_marker
    service = consumer(store, spool_root)
    result = service.poll_once()['titan_demo']

    assert result['storeLostCount'] == 2
    assert result['gapObserved'] is True
    idle = service.poll_once()['titan_demo']
    assert idle['code'] == 'IDLE'
    assert idle['storeLostCount'] == 2
    assert idle['gapObserved'] is True


def test_spool_shutdown_waits_for_inflight_thread_poll():
    started = threading.Event()
    release = threading.Event()

    class BlockedConsumer:
        producers = {'titan_demo': None}

        def poll_once(self):
            started.set()
            assert release.wait(2)
            return {'titan_demo': {'code': 'IDLE'}}

    async def scenario():
        app = FastAPI()
        service = asyncio.create_task(run_spool_service(app, BlockedConsumer(), interval=60))
        assert await asyncio.to_thread(started.wait, 2)
        service.cancel()
        await asyncio.sleep(.05)
        assert not service.done()
        release.set()
        with pytest.raises(asyncio.CancelledError):
            await service

    asyncio.run(scenario())


def test_spool_service_starts_and_stops_with_fastapi(private_root, spool_root, monkeypatch):
    from chart_studio import evidence_api

    store = evidence_store(private_root)
    active = spool_root / 'titan_demo.active.ndjson'
    write_private(active, line(record(seq=1)).encode())
    monkeypatch.setenv('CHART_STUDIO_EVIDENCE_SPOOL_ROOT', str(spool_root))
    monkeypatch.setattr(evidence_api, 'DEFAULT_EVIDENCE_PRODUCERS', {'titan': 'titan_demo'})
    app = FastAPI()
    install_evidence_routes(app, store=store)

    with TestClient(app):
        assert app.state.evidence_spool_task is not None
        deadline = time.monotonic() + 2
        while time.monotonic() < deadline and (
            not store.read(context(), kind='DECISION')['records']
            or app.state.evidence_spool_status.get('titan_demo', {}).get('importedTotal') != 1
        ):
            time.sleep(.02)
        assert len(store.read(context(), kind='DECISION')['records']) == 1
        assert app.state.evidence_spool_status['titan_demo']['importedTotal'] == 1

    assert app.state.evidence_spool_task is None


def test_spool_service_keeps_import_count_visible_after_idle_poll():
    second_poll = threading.Event()

    class Consumer:
        producers = {'titan_demo': ('titan', None)}

        def __init__(self):
            self.polls = 0

        def poll_once(self):
            self.polls += 1
            if self.polls == 1:
                return {'titan_demo': {'code': 'IMPORTED', 'imported': 1, 'duplicates': 2,
                                      'gapCount': 0, 'gapObserved': False, 'storeLostCount': 0}}
            second_poll.set()
            return {'titan_demo': {'code': 'IDLE', 'imported': 0, 'duplicates': 0,
                                   'gapCount': 0, 'gapObserved': False, 'storeLostCount': 0}}

    async def scenario():
        app = FastAPI()
        task = asyncio.create_task(run_spool_service(app, Consumer(), interval=.01))
        assert await asyncio.to_thread(second_poll.wait, 2)
        deadline = time.monotonic() + 2
        while time.monotonic() < deadline and app.state.evidence_spool_status.get('titan_demo', {}).get('code') != 'IDLE':
            await asyncio.sleep(.001)
        status = app.state.evidence_spool_status['titan_demo']
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        return status

    status = asyncio.run(scenario())
    assert status['imported'] == 0
    assert status['importedTotal'] == 1
    assert status['duplicatesTotal'] == 2


def test_spool_service_is_disabled_without_explicit_root(private_root, monkeypatch):
    monkeypatch.delenv('CHART_STUDIO_EVIDENCE_SPOOL_ROOT', raising=False)
    app = FastAPI()
    install_evidence_routes(app, store=evidence_store(private_root))

    assert app.state.evidence_spool_service is None
    assert app.state.evidence_spool_task is None


def test_default_producers_bind_demo_titans_and_goldm15_but_exclude_blueberry(private_root, spool_root, monkeypatch):
    from chart_studio import evidence_api

    captured = {}

    class Consumer:
        def __init__(self, store, root, *, producers, excluded_roots):
            captured.update(producers)
            self.producers = {producer: (account, None) for account, producer in producers.items()}

    monkeypatch.setattr(evidence_api, 'SpoolFileConsumer', Consumer)
    monkeypatch.setenv('CHART_STUDIO_EVIDENCE_SPOOL_ROOT', str(spool_root))
    app = FastAPI()
    install_evidence_routes(app, store=evidence_store(private_root))

    assert captured == {
        'xau5m_m5': 'titan_puprime250',
        'titan_m5': 'titan_puprime500',
        'goldm15': 'goldm15_demo',
    }
    assert not {'blueberry', 'titan', 'xau5m_500'}.intersection(captured)
    assert app.state.evidence_spool_service is not None


def test_evidence_routes_reject_dynamic_producer_mapping():
    with pytest.raises(TypeError):
        install_evidence_routes(FastAPI(), producers={'titan': 'titan_demo'})


def test_spool_service_invalid_configuration_stays_disabled(private_root, monkeypatch):
    monkeypatch.setenv('CHART_STUDIO_EVIDENCE_SPOOL_ROOT', str(private_root / 'missing'))
    app = FastAPI()
    install_evidence_routes(app, store=evidence_store(private_root))

    assert app.state.evidence_spool_service is None
    assert app.state.evidence_spool_status == {'service': {'code':'CONFIG_INVALID'}}

import copy
import json

import pytest
import os
import subprocess

from chart_studio.evidence_models import AccountContext
from chart_studio.evidence_spool import SpoolImporter
from test_chart_studio_evidence_models import envelope
from test_chart_studio_evidence_store import store as evidence_store


@pytest.fixture
def private_root(tmp_path):
    root = tmp_path / 'private'
    root.mkdir()
    if os.name == 'nt':
        sid = subprocess.check_output(['whoami', '/user', '/fo', 'csv', '/nh'], text=True).strip().split(',')[-1].strip('"')
        script = r'''$p=$env:CHART_STUDIO_PRIVATE_ROOT;$sids=@($env:CHART_STUDIO_TEST_SID,'S-1-5-18','S-1-5-32-544');$acl=[System.Security.AccessControl.DirectorySecurity]::new();$acl.SetAccessRuleProtection($true,$false);foreach($sid in $sids){$id=[System.Security.Principal.SecurityIdentifier]::new($sid);$rule=[System.Security.AccessControl.FileSystemAccessRule]::new($id,'FullControl','ContainerInherit,ObjectInherit','None','Allow');$acl.AddAccessRule($rule)};([System.IO.DirectoryInfo]::new($p)).SetAccessControl($acl)'''
        env = {**os.environ, 'CHART_STUDIO_PRIVATE_ROOT': str(root), 'CHART_STUDIO_TEST_SID': sid}
        subprocess.run(['powershell', '-NoProfile', '-NonInteractive', '-Command', script], check=True, env=env)
    else:
        root.chmod(0o700)
    return root


class Store:
    def __init__(self, result=None):
        self.calls = []
        self.result = result or {'ok': True, 'code': 'APPENDED', 'recordRef': {'type': 'DECISION', 'id': 'event_1', 'dataRevision': 1}, 'gapObserved': False, 'lostCount': 0}

    def append(self, context, record):
        self.calls.append((context, copy.deepcopy(record)))
        return self.result


def record(seq=1, account='titan', event=None):
    context = AccountContext.from_config('titan')
    return {
        'spoolVersion': 1,
        'producerId': 'titan_demo',
        'sequence': seq,
        'accountId': account,
        'terminalIdentityHash': context.terminal_identity_hash,
        'capturedAtUtc': '2026-01-02T03:04:05Z',
        'envelope': event or envelope(),
    }


def line(value):
    return json.dumps(value, separators=(',', ':')) + '\n'


def test_spool_import_validates_trusted_scope_before_store_append():
    store = Store()
    importer = SpoolImporter(store, account_id='titan', producer_id='titan_demo')

    result = importer.import_line(line(record()))

    assert result['code'] == 'APPENDED'
    assert len(store.calls) == 1
    context, normalized = store.calls[0]
    assert context.account_id == 'titan'
    assert normalized['payload']['eventId'] == 'event_1'


@pytest.mark.parametrize('mutation', [
    lambda row: row.update(accountId='goldm15'),
    lambda row: row.update(terminalIdentityHash='f' * 64),
    lambda row: row.update(producerId='other_terminal'),
    lambda row: row.update(sequence=True),
    lambda row: row.update(spoolVersion=2),
])
def test_spool_import_rejects_scope_and_shape_forgery_before_append(mutation):
    store = Store()
    importer = SpoolImporter(store, account_id='titan', producer_id='titan_demo')
    row = record()
    mutation(row)

    result = importer.import_line(line(row))

    assert result['code'] == 'INVALID_RECORD'
    assert store.calls == []


def test_spool_import_is_idempotent_and_marks_sequence_gaps():
    store = Store()
    importer = SpoolImporter(store, account_id='titan', producer_id='titan_demo')

    first = importer.import_line(line(record(seq=1)))
    duplicate = importer.import_line(line(record(seq=1)))
    gap = importer.import_line(line(record(seq=3, event=envelope(payload={**envelope()['payload'], 'eventId': 'event_3', 'correlationId': 'corr_3'}))))

    assert first['code'] == 'APPENDED'
    assert duplicate['code'] == 'DUPLICATE'
    assert gap['code'] == 'APPENDED'
    assert gap['gapCount'] == 1
    assert len(store.calls) == 2


def test_spool_import_rejects_out_of_order_after_a_gap_without_blocking_recovery():
    store = Store()
    importer = SpoolImporter(store, account_id='titan', producer_id='titan_demo')
    event_three = envelope(payload={**envelope()['payload'], 'eventId': 'event_3', 'correlationId': 'corr_3'})
    event_two = envelope(payload={**envelope()['payload'], 'eventId': 'event_2', 'correlationId': 'corr_2'})
    event_four = envelope(payload={**envelope()['payload'], 'eventId': 'event_4', 'correlationId': 'corr_4'})

    assert importer.import_line(line(record(seq=1)))['code'] == 'APPENDED'
    assert importer.import_line(line(record(seq=3, event=event_three)))['code'] == 'APPENDED'
    out_of_order = importer.import_line(line(record(seq=2, event=event_two)))
    recovered = importer.import_line(line(record(seq=4, event=event_four)))

    assert out_of_order['code'] == 'OUT_OF_ORDER'
    assert out_of_order['gapCount'] == 1
    assert recovered['code'] == 'APPENDED'
    assert recovered['gapCount'] == 1
    assert [row['payload']['eventId'] for _, row in store.calls] == ['event_1', 'event_3', 'event_4']


def test_spool_import_does_not_advance_after_store_failure():
    store = Store({'ok': False, 'code': 'STORE_UNAVAILABLE', 'recordRef': None, 'gapObserved': True, 'lostCount': 1})
    importer = SpoolImporter(store, account_id='titan', producer_id='titan_demo')

    failed = importer.import_line(line(record()))

    assert failed['code'] == 'STORE_UNAVAILABLE'
    assert importer.import_line(line(record()))['code'] == 'STORE_UNAVAILABLE'
    assert len(store.calls) == 2


def test_spool_import_contains_unexpected_store_exception():
    class BrokenStore:
        def append(self, _context, _envelope):
            raise OSError('disk unavailable')

    importer = SpoolImporter(BrokenStore(), account_id='titan', producer_id='titan_demo')

    result = importer.import_line(line(record()))

    assert result['code'] == 'STORE_UNAVAILABLE'
    assert result['ok'] is False


def test_spool_import_fails_closed_after_ambiguous_cursor_write():
    store = Store()
    importer = SpoolImporter(store, account_id='titan', producer_id='titan_demo')
    save_cursor = importer._save_cursor
    importer._save_cursor = lambda: (_ for _ in ()).throw(OSError('replace durability unknown'))

    first = importer.import_line(line(record(seq=1)))
    importer._save_cursor = save_cursor
    later = importer.import_line(line(record(seq=2)))

    assert first['code'] == 'CURSOR_UNAVAILABLE'
    assert later['code'] == 'CURSOR_UNAVAILABLE'
    assert store.calls == []


def test_spool_import_counts_initial_gap_and_propagates_store_loss():
    store = Store({'ok': True, 'code': 'APPENDED', 'recordRef': None, 'gapObserved': True, 'lostCount': 4})
    importer = SpoolImporter(store, account_id='titan', producer_id='titan_demo')

    result = importer.import_line(line(record(seq=5)))

    assert result['gapCount'] == 4
    assert result['gapObserved'] is True


def test_spool_import_persists_sequence_conflicts_across_restarts(private_root):
    store = evidence_store(private_root)
    raw = line(record(seq=1))
    assert SpoolImporter(store, account_id='titan', producer_id='titan_demo').import_line(raw)['ok']
    conflicting = record(seq=1)
    conflicting['envelope']['id'] = 'event_2'
    conflicting['envelope']['payload']['eventId'] = 'event_2'

    restarted = SpoolImporter(store, account_id='titan', producer_id='titan_demo')
    result = restarted.import_line(line(conflicting))

    assert result['code'] == 'SEQUENCE_CONFLICT'


def test_spool_pending_record_survives_restart_before_later_sequences(private_root):
    store = evidence_store(private_root)
    original_append = store.append
    store.append = lambda _context, _event: {'ok': False, 'code': 'STORE_UNAVAILABLE', 'recordRef': None, 'gapObserved': True, 'lostCount': 1}
    raw = line(record(seq=1))
    assert SpoolImporter(store, account_id='titan', producer_id='titan_demo').import_line(raw)['code'] == 'STORE_UNAVAILABLE'

    restarted = SpoolImporter(store, account_id='titan', producer_id='titan_demo')
    blocked = restarted.import_line(line(record(seq=2)))
    assert blocked['code'] == 'PENDING_RETRY'
    store.append = original_append

    assert restarted.import_line(raw)['code'] == 'APPENDED'


def test_spool_import_rejects_oversize_duplicate_keys_and_conflicting_replay():
    store = Store()
    importer = SpoolImporter(store, account_id='titan', producer_id='titan_demo')
    assert importer.import_line(line(record()))['code'] == 'APPENDED'
    conflict = record()
    conflict['capturedAtUtc'] = '2026-01-02T03:04:06Z'

    assert importer.import_line(line(conflict))['code'] == 'SEQUENCE_CONFLICT'
    assert importer.import_line('{"spoolVersion":1,"spoolVersion":1}\n')['code'] == 'INVALID_RECORD'
    assert importer.import_line('x' * 300000 + '\n')['code'] == 'INVALID_RECORD'
    deeply_nested = '{"spoolVersion":1,"producerId":"titan_demo","sequence":1,"accountId":"titan","terminalIdentityHash":"' + AccountContext.from_config('titan').terminal_identity_hash + '","capturedAtUtc":"2026-01-02T03:04:05Z","envelope":' + '[' * 1200 + 'null' + ']' * 1200 + '}\n'
    assert importer.import_line(deeply_nested)['code'] == 'INVALID_RECORD'
    assert len(store.calls) == 1


def test_spool_import_replay_is_deduplicated_by_persisted_cursor(private_root):
    store = evidence_store(private_root)
    raw = line(record())

    first = SpoolImporter(store, account_id='titan', producer_id='titan_demo').import_line(raw)
    replay = SpoolImporter(store, account_id='titan', producer_id='titan_demo').import_line(raw)

    assert first['code'] == 'APPENDED'
    assert replay['code'] == 'DUPLICATE'

import json
import sqlite3
from pathlib import Path

import pytest

from chart_studio.mutation_audit import MutationAuditStore


def test_audit_records_request_and_result_without_credentials(tmp_path):
    root = tmp_path / 'checkout'
    root.mkdir()
    path = tmp_path / 'private' / 'mutation-audit.sqlite'
    store = MutationAuditStore(path, checkout_root=root)

    request_id = store.begin_request(
        method='POST', route='/api/modify_position', account='titan',
        principal=('proxy', 'operator-secret-name', 'trade'),
    )
    store.finish_request(request_id, status_code=200, outcome='ok')

    events = store.recent(limit=10)
    assert [event['event'] for event in events] == ['REQUEST_STARTED', 'REQUEST_FINISHED']
    assert events[0]['requestId'] == events[1]['requestId'] == request_id
    assert events[0]['account'] == 'titan'
    assert events[0]['route'] == '/api/modify_position'
    assert events[1]['statusCode'] == 200
    assert events[1]['outcome'] == 'ok'
    assert 'operator-secret-name' not in json.dumps(events)
    assert b'operator-secret-name' not in path.read_bytes()


def test_audit_journal_is_append_only(tmp_path):
    root = tmp_path / 'checkout'
    root.mkdir()
    path = tmp_path / 'audit.sqlite'
    store = MutationAuditStore(path, checkout_root=root)
    request_id = store.begin_request(
        method='DELETE', route='/api/chart/v1/workspace', account='goldm15',
        principal=('local', '127.0.0.1', 'trade'),
    )
    store.finish_request(request_id, status_code=204, outcome='ok')

    with sqlite3.connect(path) as db:
        with pytest.raises(sqlite3.IntegrityError, match='append-only'):
            db.execute("UPDATE audit_events SET event='ALTERED'")
        with pytest.raises(sqlite3.IntegrityError, match='append-only'):
            db.execute("DELETE FROM audit_events")


@pytest.mark.parametrize('account', ['blueberry', 'unknown', ''])
def test_mutation_audit_never_accepts_unconfigured_account_scope(tmp_path, account):
    root = tmp_path / 'checkout'
    root.mkdir()
    store = MutationAuditStore(tmp_path / 'audit.sqlite', checkout_root=root)
    with pytest.raises(ValueError):
        store.begin_request(
            method='POST', route='/api/modify_position', account=account,
            principal=('proxy', 'user', 'trade'),
        )


def test_mutation_audit_allows_global_configuration_change_without_account(tmp_path):
    root = tmp_path / 'checkout'
    root.mkdir()
    store = MutationAuditStore(tmp_path / 'audit.sqlite', checkout_root=root)
    request_id = store.begin_request(
        method='PUT', route='/api/chart/v1/workspace', principal=('local', 'peer', 'trade'),
    )
    assert store.recent(limit=1)[0]['account'] is None
    store.finish_request(request_id, status_code=200, outcome='ok')


def test_mutation_audit_store_must_be_private_and_outside_checkout(tmp_path):
    root = tmp_path / 'checkout'
    root.mkdir()
    with pytest.raises(ValueError):
        MutationAuditStore(root / 'audit.sqlite', checkout_root=root)
    with pytest.raises(ValueError):
        MutationAuditStore(Path('relative.sqlite'), checkout_root=root)
    with pytest.raises(ValueError):
        MutationAuditStore(tmp_path / 'audit.sqlite', checkout_root=root,
                           allowed_accounts={'titan', 'blueberry'})\n
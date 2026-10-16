import concurrent.futures
import os
import sqlite3
import pytest


def commit_payload(sl='3999.00'):
    return {'account': 'titan', 'symbol': 'XAUUSD', 'ticket': '123',
            'revision': 'a' * 64, 'sl': sl}

def store_at(tmp_path):
    from chart_studio.position_commit_store import PositionCommitStore
    return PositionCommitStore(tmp_path / 'private' / 'chart-commit.sqlite3', checkout_root=tmp_path / 'checkout')


def test_store_reserves_once_replays_same_payload_and_rejects_reuse(tmp_path):
    store = store_at(tmp_path)
    first = store.reserve('trade-user', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', commit_payload())
    replay = store.reserve('trade-user', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', commit_payload())
    conflict = store.reserve('trade-user', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', commit_payload('3998.00'))
    assert first.state == 'NEW'
    assert replay.state == 'IN_FLIGHT'
    assert conflict.state == 'CONFLICT'
    assert store.reserve('other-user', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', commit_payload()).state == 'NEW'


def test_inflight_reservation_is_unknown_after_store_reopen_and_never_reissued(tmp_path):
    path = tmp_path / 'private' / 'chart-commit.sqlite3'
    from chart_studio.position_commit_store import PositionCommitStore
    store = PositionCommitStore(path, checkout_root=tmp_path / 'checkout')
    store.reserve('trade-user', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', commit_payload())
    reopened = PositionCommitStore(path, checkout_root=tmp_path / 'checkout')
    assert reopened.recover_interrupted() == 1
    assert reopened.reserve('trade-user', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', commit_payload()).state == 'UNKNOWN'


def test_reservations_are_atomic_across_threads(tmp_path):
    path = tmp_path / 'private' / 'chart-commit.sqlite3'
    def reserve(_):
        from chart_studio.position_commit_store import PositionCommitStore
        store = PositionCommitStore(path, checkout_root=tmp_path / 'checkout')
        return store.reserve('trade-user', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', commit_payload()).state
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        outcomes = list(pool.map(reserve, range(8)))
    assert outcomes.count('NEW') == 1
    assert set(outcomes) <= {'NEW', 'IN_FLIGHT'}


def test_terminal_outcome_and_append_only_secret_free_audit(tmp_path):
    store = store_at(tmp_path)
    store.reserve('trade-user', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', commit_payload())
    result = {'status': 'SAVED', 'positionRevision': 'e' * 64,
              'slPrice': '3999.00', 'tpPrice': '4010.00', 'verified': True}
    store.finish('trade-user', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', result)
    assert store.reserve('trade-user', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', commit_payload()).result == result
    with sqlite3.connect(store.path) as db:
        rows = db.execute('select event, details_json from audit_events order by id').fetchall()
        assert [row[0] for row in rows] == ['RESERVED', 'SAVED']
        assert all('password' not in row[1].lower() and 'secret' not in row[1].lower() for row in rows)
        with pytest.raises(sqlite3.IntegrityError):
            db.execute('update audit_events set event="ALTERED"')


def test_result_fields_are_allowlisted_and_cannot_store_secrets(tmp_path):
    store = store_at(tmp_path)
    store.reserve('trade-user', 'ffffffff-ffff-4fff-8fff-ffffffffffff', commit_payload())
    with pytest.raises(ValueError):
        store.finish('trade-user', 'ffffffff-ffff-4fff-8fff-ffffffffffff', {'status': 'SAVED', 'password': 'do-not-store'})
    with pytest.raises(ValueError):
        store.finish('trade-user', 'ffffffff-ffff-4fff-8fff-ffffffffffff',
                     {'status': 'UNKNOWN', 'code': 'secret=do-not-store'})
    with pytest.raises(ValueError):
        store.reserve('trade-user', 'ffffffff-ffff-4fff-8fff-ffffffffffff',
                      {'account': 'titan', 'symbol': 'XAUUSD', 'ticket': '123', 'revision': 'a' * 64,
                       'password': 'do-not-store'})


def test_store_rejects_paths_inside_checkout(tmp_path):
    from chart_studio.position_commit_store import PositionCommitStore
    checkout = tmp_path / 'checkout'
    checkout.mkdir()
    with pytest.raises(ValueError):
        PositionCommitStore(checkout / 'unsafe.sqlite3', checkout_root=checkout)




def test_private_store_permissions_are_owner_only_on_posix(tmp_path):
    if os.name == 'nt':
        pytest.skip('POSIX mode bits are not available on Windows')
    store = store_at(tmp_path)
    assert store.path.stat().st_mode & 0o777 == 0o600
    assert store.path.parent.stat().st_mode & 0o777 == 0o700

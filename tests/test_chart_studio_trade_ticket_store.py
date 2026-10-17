import concurrent.futures
import sqlite3

import pytest


KEY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
PAYLOAD = {'account': 'titan', 'symbol': 'XAUUSD', 'previewId': 'p' * 43,
           'confirmationText': 'titan XAUUSD BUY_LIMIT 0.01'}


def make_store(tmp_path):
    from chart_studio.trade_ticket_store import TradeTicketCommitStore
    return TradeTicketCommitStore(tmp_path / 'private' / 'ticket.sqlite3',
                                  checkout_root=tmp_path / 'checkout')


def test_ticket_store_reserves_once_replays_and_rejects_key_reuse(tmp_path):
    store = make_store(tmp_path)
    assert store.reserve('operator', KEY, PAYLOAD).state == 'NEW'
    assert store.reserve('operator', KEY, PAYLOAD).state == 'IN_FLIGHT'
    changed = {**PAYLOAD, 'confirmationText': 'titan XAUUSD BUY_LIMIT 0.02'}
    assert store.reserve('operator', KEY, changed).state == 'CONFLICT'


def test_ticket_store_marks_interrupted_send_unknown_after_restart(tmp_path):
    path = tmp_path / 'private' / 'ticket.sqlite3'
    store = make_store(tmp_path)
    store.reserve('operator', KEY, PAYLOAD)
    from chart_studio.trade_ticket_store import TradeTicketCommitStore
    reopened = TradeTicketCommitStore(path, checkout_root=tmp_path / 'checkout')
    assert reopened.recover_interrupted() == 1
    assert reopened.reserve('operator', KEY, PAYLOAD).state == 'UNKNOWN'


def test_ticket_store_reservation_is_atomic_across_instances(tmp_path):
    def reserve(_):
        return make_store(tmp_path).reserve('operator', KEY, PAYLOAD).state
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        values = list(pool.map(reserve, range(8)))
    assert values.count('NEW') == 1


def test_ticket_store_audit_is_append_only_and_result_is_minimal(tmp_path):
    store = make_store(tmp_path)
    store.reserve('operator', KEY, PAYLOAD)
    result = {'status': 'PLACED', 'brokerRetcode': 10008,
              'orderTicket': '12345', 'verified': True}
    store.finish('operator', KEY, result)
    assert store.reserve('operator', KEY, PAYLOAD).result == result
    with sqlite3.connect(store.path) as db:
        events = db.execute('select event from audit_events order by id').fetchall()
        assert [event[0] for event in events] == ['RESERVED', 'PLACED']
        with pytest.raises(sqlite3.IntegrityError):
            db.execute("delete from audit_events where event='PLACED'")


def test_ticket_store_rejects_secret_or_unapproved_fields(tmp_path):
    store = make_store(tmp_path)
    with pytest.raises(ValueError):
        store.reserve('operator', KEY, {**PAYLOAD, 'password': 'never-store'})
    store.reserve('operator', KEY, PAYLOAD)
    with pytest.raises(ValueError):
        store.finish('operator', KEY, {'status': 'PLACED', 'password': 'never-store'})

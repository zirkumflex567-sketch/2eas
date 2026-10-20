from pathlib import Path

from chart_studio.trade_ticket_runtime import create_trade_ticket_runtime


class Gateway:
    pass


class PreviewRegistry:
    pass


def test_trade_ticket_runtime_is_inert_by_default(tmp_path):
    runtime = create_trade_ticket_runtime(Gateway(), PreviewRegistry(), tmp_path)

    assert runtime.enabled is False
    assert runtime.guard is None
    assert runtime.store is None
    assert runtime.commit_service is None
    assert not (tmp_path / '.chartstudio' / 'trade-ticket-commit').exists()


def test_enabled_runtime_binds_guard_service_store_and_private_audit(tmp_path):
    checkout = tmp_path / 'checkout'
    checkout.mkdir()
    private = tmp_path / 'private-store'
    gateway, previews = Gateway(), PreviewRegistry()

    runtime = create_trade_ticket_runtime(
        gateway, previews, checkout, enabled=True, private_dir=private,
    )

    assert runtime.enabled is True
    assert runtime.guard.mt5 is gateway
    assert runtime.store.path == (private / 'tickets.sqlite3').resolve()
    assert runtime.store.path.is_relative_to(tmp_path)
    assert runtime.commit_service.mt5 is gateway
    assert runtime.commit_service.previews is previews
    assert runtime.commit_service.guard is runtime.guard
    assert runtime.commit_service.store is runtime.store


def test_enabled_runtime_rejects_relative_private_store_path(tmp_path):
    import pytest

    with pytest.raises(ValueError, match='must be absolute'):
        create_trade_ticket_runtime(
            Gateway(), PreviewRegistry(), tmp_path, enabled=True,
            private_dir=Path('relative-store'),
        )


def test_enabled_runtime_recovers_interrupted_idempotency_without_resending(tmp_path):
    import uuid

    from chart_studio.trade_ticket_store import TradeTicketCommitStore

    checkout = tmp_path / 'checkout'
    checkout.mkdir()
    private = tmp_path / 'private-store'
    path = private / 'tickets.sqlite3'
    store = TradeTicketCommitStore(path, checkout_root=checkout)
    principal, key = 'operator:session', str(uuid.uuid4())
    payload = {
        'account': 'titan', 'symbol': 'XAUUSD',
        'previewId': 'a' * 40, 'confirmationText': 'titan XAUUSD BUY_LIMIT 0.01',
    }
    assert store.reserve(principal, key, payload).state == 'NEW'

    runtime = create_trade_ticket_runtime(
        Gateway(), PreviewRegistry(), checkout, enabled=True, private_dir=private,
    )

    recovered = runtime.store.reserve(principal, key, payload)
    assert recovered.state == 'UNKNOWN'
    assert recovered.result == {'status': 'UNKNOWN', 'code': 'INTERRUPTED'}

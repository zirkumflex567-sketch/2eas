"""Build the optional, private new-entry runtime from one explicit gate."""
from dataclasses import dataclass
from pathlib import Path

from chart_studio.demo_entry_guard import DemoEntryGuard
from chart_studio.trade_ticket import TradeTicketCommitService
from chart_studio.trade_ticket_store import TradeTicketCommitStore


@dataclass(frozen=True)
class TradeTicketRuntime:
    enabled: bool
    guard: object | None
    store: object | None
    commit_service: object | None


def create_trade_ticket_runtime(mt5, preview_registry, checkout_root, *, enabled=False,
                                private_dir=None):
    """Keep the entry write path disabled unless explicitly enabled.

    Idempotency and append-only audit data always live outside the checkout.
    """
    if enabled is not True:
        return TradeTicketRuntime(False, None, None, None)
    if private_dir is None:
        private_dir = Path.home() / '.chartstudio' / 'trade-ticket-commit'
    private_dir = Path(private_dir).expanduser()
    if not private_dir.is_absolute():
        raise ValueError('Private trade-ticket directory must be absolute')
    store = TradeTicketCommitStore(private_dir / 'tickets.sqlite3',
                                   checkout_root=checkout_root)
    store.recover_interrupted()
    guard = DemoEntryGuard(mt5)
    service = TradeTicketCommitService(mt5, preview_registry, store, guard)
    return TradeTicketRuntime(True, guard, store, service)

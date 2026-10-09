"""Read-only journal accounting, evidenced symbol/magic ownership and UTC times."""
from collections import deque
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

BERLIN = ZoneInfo('Europe/Berlin')
# Historical recording start, NOT a rolling 'today' boundary. UTC is explicit.
CUTOFF = datetime(2026, 10, 8, 23, tzinfo=timezone.utc)
UNKNOWN_ENTRY = 'Einstiegsgrund unbekannt: kein bestätigtes EA-Entscheidungsereignis vorhanden.'
UNKNOWN_EXIT = 'Ausstiegsziel/-grund unbekannt: aus MT5-Deals nicht belegbar.'


def times(stamp):
    utc = datetime.fromtimestamp(stamp, timezone.utc)
    return dict(time_utc=utc.isoformat(), time_server=utc.strftime('%H:%M:%S'),
                time_de=utc.astimezone(BERLIN).strftime('%H:%M:%S'),
                time_berlin=utc.astimezone(BERLIN).isoformat(),
                server_time_basis='MT5 epoch interpreted as UTC', timezone='Europe/Berlin')


def owns(record, magics):
    return getattr(record, 'symbol', None)=='XAUUSD' and getattr(record, 'magic', None) in magics


def costs(record):
    return sum(float(getattr(record, key, 0.)) for key in ('commission','fee'))


def close_accounting(deals, mt5, magics):
    """FIFO matching of entry volume to exits, entry costs allocated once.

    Supports hedged position lifecycles and partial closes. Reversal/OUT_BY or
    incomplete lifecycle is explicitly unknown, never guessed as entry=exit.
    """
    inventory = deque()
    rows = {}
    unique = {int(d.ticket):d for d in deals}
    for d in sorted(unique.values(), key=lambda d:(d.time,d.ticket)):
        if getattr(d,'symbol',None)!='XAUUSD':
            continue
        if d.entry == mt5.DEAL_ENTRY_IN:
            inventory.append([float(d.volume), float(d.price), costs(d), d, owns(d,magics)])
        elif d.entry == mt5.DEAL_ENTRY_OUT:
            volume = float(d.volume)
            remaining = volume
            price_volume, entry_cost = 0., 0.
            evidenced = owns(d,magics)
            original_type = None
            ownership_magic = d.magic if owns(d, magics) else None
            while remaining > 1e-10 and inventory:
                lot = inventory[0]
                take = min(remaining,lot[0])
                # Allocate cents on each leg; final leg gets the remainder.
                allocated = lot[2] if abs(take-lot[0])<1e-10 else round(lot[2] * take / lot[0], 2)
                price_volume += take * lot[1]
                entry_cost += allocated
                evidenced = evidenced or lot[4]
                if lot[4]:
                    ownership_magic = lot[3].magic
                original_type = 'BUY' if lot[3].type==mt5.DEAL_TYPE_BUY else 'SELL'
                lot[0] -= take; lot[2] -= allocated; remaining -= take
                if lot[0] < 1e-10:
                    inventory.popleft()
            if evidenced:
                complete = remaining < 1e-10 and volume>0
                exit_net = float(d.profit)+float(d.swap)+costs(d)
                rows[d.ticket] = dict(open_price=round(price_volume/volume,2) if complete else None,
                    ownership_magic=ownership_magic,
                    type=original_type, entry_cost_usd=round(entry_cost,2) if complete else None,
                    net_profit_usd=round(exit_net+entry_cost,2) if complete else None,
                    gross_profit_usd=round(float(d.profit),2), exit_net_usd=round(exit_net,2),
                    net_complete=complete, net_unknown_reason=None if complete else 'Einstiegsvolumen/-kosten fehlen in der Positionshistorie.')
        elif owns(d, magics) and d.entry in (getattr(mt5,'DEAL_ENTRY_INOUT',2), getattr(mt5,'DEAL_ENTRY_OUT_BY',3)):
            inventory.clear()
            rows[d.ticket] = dict(open_price=None,type=None,entry_cost_usd=None,net_profit_usd=None,
                gross_profit_usd=round(float(d.profit),2),exit_net_usd=round(float(d.profit)+float(d.swap)+costs(d),2),
                net_complete=False,net_unknown_reason='Reversal/Close-by-Zuordnung nicht eindeutig belegt.')
    return rows

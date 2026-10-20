"""Small, server-side risk guard for confirmed demo pending-entry tickets."""
from decimal import Decimal, InvalidOperation

import account_gateway as gateway


_ACCOUNTS = frozenset({'titan', 'xau5m_m5', 'titan_m5', 'xau5m_500'})
_MAX_LOTS = Decimal('0.01')
_MAX_STOP_RISK = Decimal('5')
_MAX_EQUITY_FRACTION = Decimal('0.01')
SOURCE = 'NON_CHALLENGE_DEMO_ENTRY_POLICY'


def _value(source, key):
    return source.get(key) if isinstance(source, dict) else getattr(source, key, None)


def _decimal(value):
    if isinstance(value, bool) or value is None:
        return None
    try:
        parsed = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None
    return parsed if parsed.is_finite() else None


class DemoEntryGuard:
    """Allow only tiny, fully protected pending entries on verified demo accounts.

    This is an independent policy check used by both ticket preview and commit.
    The normal runtime keeps the entry-commit route disabled unless the separate
    process feature flag and all commit dependencies are explicitly present.
    """

    def __init__(self, mt5):
        self.mt5 = mt5

    def evaluate(self, *, spec, accountInfo, action, riskIncreasing, symbol, order):
        account = spec.get('id') if isinstance(spec, dict) else None
        registered = gateway.ACCOUNTS.get(account)
        if (account not in _ACCOUNTS or account == 'blueberry' or
                not isinstance(registered, dict) or registered.get('is_demo') is not True or
                registered.get('challenge_protection') is not False or
                spec.get('is_demo') is not True or spec.get('challenge_protection') is not False or
                any(spec.get(key) != registered.get(key) for key in ('login', 'server', 'terminal', 'symbol'))):
            return self._block('DEMO_ACCOUNT_REQUIRED')
        if (action != 'NEW_PENDING_ENTRY' or riskIncreasing is not True or
                symbol != registered.get('symbol') or not isinstance(order, dict) or
                order.get('symbol') != symbol):
            return self._block('ENTRY_SCOPE_INVALID')

        order_types = {
            getattr(self.mt5, 'ORDER_TYPE_BUY_LIMIT', None): ('BUY', 'ORDER_TYPE_BUY'),
            getattr(self.mt5, 'ORDER_TYPE_SELL_LIMIT', None): ('SELL', 'ORDER_TYPE_SELL'),
            getattr(self.mt5, 'ORDER_TYPE_BUY_STOP', None): ('BUY', 'ORDER_TYPE_BUY'),
            getattr(self.mt5, 'ORDER_TYPE_SELL_STOP', None): ('SELL', 'ORDER_TYPE_SELL'),
        }
        mapped = order_types.get(order.get('type')) if type(order.get('type')) is int else None
        volume = _decimal(order.get('volume'))
        entry, stop, target = (_decimal(order.get(key)) for key in ('price', 'sl', 'tp'))
        if (mapped is None or volume is None or not 0 < volume <= _MAX_LOTS or
                entry is None or stop is None or target is None or
                min(entry, stop, target) <= 0):
            return self._block('ENTRY_LIMIT_INVALID')

        currency = _value(accountInfo, 'currency')
        equity = _decimal(_value(accountInfo, 'equity'))
        free_margin = _decimal(_value(accountInfo, 'margin_free'))
        if (currency != 'USD' or equity is None or equity <= 0 or
                free_margin is None or free_margin <= 0):
            return self._block('ACCOUNT_RISK_UNKNOWN')

        side_name, calc_name = mapped
        side = getattr(self.mt5, calc_name, None)
        calc_profit = getattr(self.mt5, 'order_calc_profit', None)
        calc_margin = getattr(self.mt5, 'order_calc_margin', None)
        if type(side) is not int or not callable(calc_profit) or not callable(calc_margin):
            return self._block('BROKER_RISK_UNAVAILABLE')
        try:
            risk = _decimal(-calc_profit(side, symbol, float(volume), float(entry), float(stop)))
            reward = _decimal(calc_profit(side, symbol, float(volume), float(entry), float(target)))
            margin = _decimal(calc_margin(side, symbol, float(volume), float(entry)))
        except Exception:
            return self._block('BROKER_RISK_UNAVAILABLE')
        risk_cap = min(_MAX_STOP_RISK, equity * _MAX_EQUITY_FRACTION)
        if (risk is None or reward is None or margin is None or risk <= 0 or
                reward < risk or risk > risk_cap or margin < 0 or
                margin > free_margin / Decimal('2')):
            return self._block('ENTRY_RISK_LIMIT')
        return {
            'state': 'ALLOW', 'source': SOURCE, 'hardLock': False,
            'code': 'DEMO_ENTRY_WITHIN_LIMITS',
        }

    @staticmethod
    def _block(code):
        return {'state': 'BLOCK', 'source': SOURCE, 'hardLock': True, 'code': code}

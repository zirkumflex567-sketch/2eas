"""Fail-closed policy for explicitly confirmed demo protection edits."""

from __future__ import annotations

from decimal import Decimal, InvalidOperation

import account_gateway as gateway


class DemoPositionGuard:
    """Allow only risk-reducing stop/target edits on configured demo accounts.

    The guard intentionally has no Blueberry allowlist and does not infer a
    demo from a caller-supplied account name: account identity and policy come
    from the server-side account registry.
    """

    SOURCE = 'NON_CHALLENGE_DEMO_POLICY'

    def evaluate(self, *, spec, position, action, riskIncreasing, changes):
        if not isinstance(spec, dict) or not isinstance(position, dict):
            return self._block('IDENTITY_UNAVAILABLE')
        account_id = spec.get('id')
        registered = gateway.ACCOUNTS.get(account_id)
        if (registered is None or registered.get('is_demo') is not True or
                registered.get('challenge_protection') is not False or
                spec.get('is_demo') is not True or
                spec.get('challenge_protection') is not False or
                registered.get('login') != spec.get('login') or
                registered.get('server') != spec.get('server') or
                account_id == 'blueberry'):
            return self._block('DEMO_ACCOUNT_REQUIRED')
        if (not isinstance(changes, dict) or not changes or
                set(changes) - {'slPrice', 'tpPrice'} or
                position.get('symbol') != registered.get('symbol') or
                not position.get('ticket') or
                type(riskIncreasing) is not bool):
            return self._block('RISK_POLICY_BLOCKED')
        try:
            side = position.get('side')
            if side not in ('BUY', 'SELL'):
                return self._block('POSITION_SIDE_UNKNOWN')
            increasing = False
            for leg in ('sl', 'tp'):
                key = leg + 'Price'
                if key not in changes:
                    continue
                proposed, old = changes[key], position.get(leg)
                if proposed is None:
                    increasing |= old is not None
                    continue
                candidate = Decimal(str(proposed))
                if not candidate.is_finite() or candidate <= 0:
                    return self._block('INVALID_PROTECTION_PRICE')
                if old is not None:
                    current = Decimal(str(old))
                    if not current.is_finite() or current <= 0:
                        return self._block('INVALID_CURRENT_PROTECTION')
                    if leg == 'sl':
                        increasing |= candidate < current if side == 'BUY' else candidate > current
                    else:
                        increasing |= candidate > current if side == 'BUY' else candidate < current
            if (increasing or riskIncreasing is not False or
                    action != 'RISK_REDUCING_PROTECTION'):
                return self._block('RISK_POLICY_BLOCKED')
        except (InvalidOperation, TypeError, ValueError):
            return self._block('INVALID_PROTECTION_PRICE')
        return {'state': 'ALLOW', 'source': self.SOURCE, 'hardLock': False,
                'code': 'NON_CHALLENGE_DEMO_RISK_REDUCTION'}

    @staticmethod
    def _block(code):
        return {'state': 'BLOCK', 'source': 'NON_CHALLENGE_DEMO_POLICY',
                'hardLock': True, 'code': code}

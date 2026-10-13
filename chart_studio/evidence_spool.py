"""Strict, bounded importer for local MT5 evidence spool lines.

This module has no HTTP route and never calls MT5. The caller supplies a
configured account alias and producer identity; line contents cannot select a
different account or terminal. Durable file watching and a private service
launcher remain separate deployment work.
"""
import hashlib
import json
import os
from collections import OrderedDict
from pathlib import Path

from chart_studio import evidence_models as models
from chart_studio.evidence_store import EvidenceStore, StoreUnavailable, _physical, _private

MAX_LINE_BYTES = models.MAX_BYTES + 4096
SEEN_LIMIT = 512


def _unique_object(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise ValueError('duplicate key')
        value[key] = item
    return value


def _reject_constant(_value):
    raise ValueError('invalid constant')


class SpoolImporter:
    """Validate and append records from one preconfigured local producer.

    Use one importer instance per producer in a single process. File watching,
    multi-process locking and service lifecycle are intentionally not wired.
    """

    def __init__(self, store, *, account_id, producer_id):
        if not isinstance(store, EvidenceStore) and not callable(getattr(store, 'append', None)):
            raise ValueError('invalid store')
        self.context = models.AccountContext.from_config(account_id)
        if not isinstance(producer_id, str) or not producer_id.isascii() or not producer_id.replace('_', 'a').replace('-', 'a').isalnum() or not 1 <= len(producer_id) <= 64:
            raise ValueError('invalid producer')
        self.store = store
        self.producer_id = producer_id
        self.cursor_path = None
        if isinstance(store, EvidenceStore) and store.root and store.path:
            self.cursor_path = store.root / f'.spool-{account_id}-{producer_id}.json'
        self.last_sequence = 0
        self.gap_count = 0
        self.last_digest = None
        self.pending = False
        self._cursor_fault = False
        self._seen = OrderedDict()
        if self.cursor_path:
            self._load_cursor()

    def _load_cursor(self):
        path = self.cursor_path
        try:
            if _physical(path.parent) != self.store._root_identity:
                raise StoreUnavailable()
            _private(path.parent, True)
            if not path.exists():
                return
            _physical(path)
            _private(path, False)
            if path.stat().st_size > 4096:
                raise StoreUnavailable()
            raw = path.read_bytes()
            state = json.loads(raw, object_pairs_hook=_unique_object, parse_constant=_reject_constant)
            if (type(state) is not dict or set(state) != {'schemaVersion', 'accountId', 'terminalIdentityHash', 'producerId', 'lastSequence', 'lastDigest', 'gapCount', 'pending'} or
                    type(state['schemaVersion']) is not int or state['schemaVersion'] != 1 or
                    state['accountId'] != self.context.account_id or state['terminalIdentityHash'] != self.context.terminal_identity_hash or
                    state['producerId'] != self.producer_id or type(state['lastSequence']) is not int or not 0 <= state['lastSequence'] <= 2**31 - 1 or
                    type(state['gapCount']) is not int or not 0 <= state['gapCount'] <= 2**31 - 1 or type(state['pending']) is not bool or
                    (state['lastSequence'] == 0) != (state['lastDigest'] is None) or
                    (state['lastDigest'] is not None and (not isinstance(state['lastDigest'], str) or len(state['lastDigest']) != 64 or any(c not in '0123456789abcdef' for c in state['lastDigest'])))):
                raise StoreUnavailable()
            self.last_sequence = state['lastSequence']
            self.last_digest = state['lastDigest']
            self.gap_count = state['gapCount']
            self.pending = state['pending']
        except (OSError, ValueError, TypeError, RecursionError, StoreUnavailable) as exc:
            raise StoreUnavailable() from exc

    def _save_cursor(self):
        if not self.cursor_path:
            return
        path = self.cursor_path
        temp = path.with_name(path.name + '.tmp')
        state = {
            'schemaVersion': 1, 'accountId': self.context.account_id,
            'terminalIdentityHash': self.context.terminal_identity_hash,
            'producerId': self.producer_id, 'lastSequence': self.last_sequence,
            'lastDigest': self.last_digest, 'gapCount': self.gap_count,
            'pending': self.pending,
        }
        try:
            if _physical(path.parent) != self.store._root_identity:
                raise StoreUnavailable()
            _private(path.parent, True)
            if os.path.lexists(temp):
                _physical(temp)
                _private(temp, False)
                temp.unlink()
            if os.path.lexists(path):
                _physical(path)
                _private(path, False)
            with open(temp, 'xb') as stream:
                stream.write(json.dumps(state, sort_keys=True, separators=(',', ':')).encode('utf-8'))
                stream.flush()
                os.fsync(stream.fileno())
            if os.name == 'posix':
                os.chmod(temp, 0o600)
            _private(temp, False)
            os.replace(temp, path)
            if os.name == 'posix':
                directory = os.open(path.parent, os.O_RDONLY | getattr(os, 'O_DIRECTORY', 0))
                try:
                    os.fsync(directory)
                finally:
                    os.close(directory)
            _physical(path)
            _private(path, False)
        except (OSError, ValueError, TypeError, StoreUnavailable) as exc:
            self._cursor_fault = True
            try:
                if os.path.lexists(temp):
                    _physical(temp)
                    _private(temp, False)
                    temp.unlink()
            except (OSError, StoreUnavailable):
                pass
            raise StoreUnavailable() from exc

    def import_line(self, raw):
        """Import one complete newline-terminated JSON record, at least once."""
        if self._cursor_fault:
            return {'ok': False, 'code': 'CURSOR_UNAVAILABLE', 'gapCount': self.gap_count, 'gapObserved': self.gap_count > 0}
        try:
            if not isinstance(raw, (str, bytes)):
                raise ValueError('invalid line')
            encoded = raw.encode('utf-8') if isinstance(raw, str) else raw
            if len(encoded) > MAX_LINE_BYTES or not encoded.endswith(b'\n'):
                raise ValueError('invalid line')
            text = encoded[:-1].decode('utf-8')
            row = json.loads(text, object_pairs_hook=_unique_object, parse_constant=_reject_constant)
            if type(row) is not dict or set(row) != {'spoolVersion', 'producerId', 'sequence', 'accountId', 'terminalIdentityHash', 'capturedAtUtc', 'envelope'}:
                raise ValueError('invalid record')
            if type(row['spoolVersion']) is not int or row['spoolVersion'] != 1:
                raise ValueError('invalid version')
            sequence = row['sequence']
            if type(sequence) is not int or not 1 <= sequence <= 2**31 - 1:
                raise ValueError('invalid sequence')
            if row['producerId'] != self.producer_id or row['accountId'] != self.context.account_id:
                raise ValueError('scope mismatch')
            if row['terminalIdentityHash'] != self.context.terminal_identity_hash:
                raise ValueError('terminal mismatch')
            captured = models.utc_timestamp(row['capturedAtUtc'])
            envelope = models.validate_envelope(row['envelope'], context=self.context)
            if models.utc_microseconds(envelope['payload'].get('capturedAtUtc', envelope['payload'].get('asOfUtc'))) > models.utc_microseconds(captured):
                raise ValueError('capture time mismatch')
            normalized = {
                'spoolVersion': 1,
                'producerId': self.producer_id,
                'sequence': sequence,
                'accountId': self.context.account_id,
                'terminalIdentityHash': self.context.terminal_identity_hash,
                'capturedAtUtc': captured,
                'envelope': envelope,
            }
            digest = hashlib.sha256(models.canonical_bytes(normalized)).hexdigest()
        except (ValueError, TypeError, UnicodeError, KeyError, OverflowError, RecursionError):
            return {'ok': False, 'code': 'INVALID_RECORD', 'gapCount': self.gap_count}

        if self.pending and sequence != self.last_sequence:
            return {'ok': False, 'code': 'PENDING_RETRY', 'gapCount': self.gap_count, 'gapObserved': self.gap_count > 0}
        previous = self._seen.get(sequence)
        if previous is not None:
            if previous == digest:
                return {'ok': True, 'code': 'DUPLICATE', 'gapCount': self.gap_count}
            return {'ok': False, 'code': 'SEQUENCE_CONFLICT', 'gapCount': self.gap_count}
        if sequence == self.last_sequence and self.last_sequence:
            if digest != self.last_digest:
                return {'ok': False, 'code': 'SEQUENCE_CONFLICT', 'gapCount': self.gap_count}
            if not self.pending:
                return {'ok': True, 'code': 'DUPLICATE', 'gapCount': self.gap_count, 'gapObserved': self.gap_count > 0}
        elif sequence <= self.last_sequence:
            return {'ok': False, 'code': 'OUT_OF_ORDER', 'gapCount': self.gap_count, 'gapObserved': self.gap_count > 0}
        else:
            previous_state = (self.last_sequence, self.last_digest, self.gap_count, self.pending)
            self.gap_count = min(2**31 - 1, self.gap_count + (sequence - self.last_sequence - 1 if self.last_sequence else sequence - 1))
            self.last_sequence = sequence
            self.last_digest = digest
            self.pending = True
            try:
                self._save_cursor()
            except Exception:
                self._cursor_fault = True
                self.last_sequence, self.last_digest, self.gap_count, self.pending = previous_state
                return {'ok': False, 'code': 'CURSOR_UNAVAILABLE', 'gapCount': self.gap_count, 'gapObserved': self.gap_count > 0}

        try:
            result = self.store.append(self.context, envelope)
        except Exception:
            return {'ok': False, 'code': 'STORE_UNAVAILABLE', 'gapCount': self.gap_count,
                    'gapObserved': self.gap_count > 0, 'storeLostCount': 0}
        if not isinstance(result, dict) or result.get('ok') is not True:
            code = result.get('code', 'STORE_UNAVAILABLE') if isinstance(result, dict) else 'STORE_UNAVAILABLE'
            return {'ok': False, 'code': code, 'gapCount': self.gap_count, 'gapObserved': self.gap_count > 0 or bool(isinstance(result, dict) and result.get('gapObserved')),
                    'storeLostCount': result.get('lostCount', 0) if isinstance(result, dict) else 0}

        self.pending = False
        try:
            self._save_cursor()
        except Exception:
            # The persisted pending cursor safely retries this append; the
            # store's immutable key makes that retry idempotent after a crash.
            self._cursor_fault = True
            self.pending = True
            return {'ok': False, 'code': 'CURSOR_UNAVAILABLE', 'gapCount': self.gap_count, 'gapObserved': self.gap_count > 0}
        self._seen[sequence] = digest
        while len(self._seen) > SEEN_LIMIT:
            self._seen.popitem(last=False)
        return {'ok': True, 'code': result.get('code', 'APPENDED'), 'recordRef': result.get('recordRef'),
                'gapCount': self.gap_count, 'gapObserved': self.gap_count > 0 or bool(result.get('gapObserved')),
                'storeLostCount': result.get('lostCount', 0)}

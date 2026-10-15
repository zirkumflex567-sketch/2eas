"""Validated reset persistence with recoverable multi-target file replacement.

Each replacement is atomic. A private write-ahead journal lets the next load or
save roll an interrupted pair back to its previous state. This is not an EA
acknowledgement and does not make independent files atomically visible together.
"""
import base64
import hashlib
import json
import os
import tempfile
from datetime import date
from pathlib import Path
from typing import Annotated
from pydantic import BaseModel, ConfigDict, Field, FiniteFloat, model_validator

_JOURNAL_NAME = '.dashboard-drawdown-transaction.json'
_MAX_FILE_BYTES = 32 * 1024
_MAX_JOURNAL_BYTES = 1024 * 1024


class DrawdownConfig(BaseModel):
    model_config = ConfigDict(strict=True, extra='forbid')
    manual_reset_active: bool
    reset_balance: Annotated[FiniteFloat, Field(gt=0)]
    reset_timestamp: Annotated[int, Field(gt=0)] | None
    reset_date: str | None

    @model_validator(mode='after')
    def active_has_day(self):
        if self.manual_reset_active and (self.reset_timestamp is None or self.reset_date is None):
            raise ValueError('Aktiver Reset benötigt Zeitstempel und Risikotag.')
        if self.reset_date is not None:
            date.fromisoformat(self.reset_date)
        return self


def load(path):
    path = Path(path)
    if not path.exists():
        return dict(manual_reset_active=False, reset_balance=10000., reset_timestamp=None, reset_date=None)
    return DrawdownConfig.model_validate(json.loads(path.read_text(encoding='utf-8'))).model_dump()


def _stage(path, data):
    fd, name = tempfile.mkstemp(prefix=path.name+'.', suffix='.tmp', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
    except BaseException:
        Path(name).unlink(missing_ok=True)
        raise
    return Path(name)


def _targets(values):
    paths = [Path(value).resolve() for value in values]
    if not paths or len(paths) > 8 or len(set(paths)) != len(paths):
        raise ValueError('Ungültige Reset-Zielmenge.')
    return paths


def _journal_path(paths):
    target_key = '\0'.join(str(path) for path in paths).encode('utf-8')
    suffix = hashlib.sha256(target_key).hexdigest()[:16]
    return paths[0].with_name(_JOURNAL_NAME.replace('.json', f'-{suffix}.json'))


def _unique_object(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise ValueError('Doppelte Recovery-Schlüssel.')
        value[key] = item
    return value


def _snapshot(path):
    if not path.exists():
        return {'path': str(path), 'exists': False, 'data': None, 'sha256': None}
    data = path.read_bytes()
    if len(data) > _MAX_FILE_BYTES:
        raise ValueError('Resetdatei überschreitet die Recovery-Grenze.')
    return {
        'path': str(path), 'exists': True,
        'data': base64.b64encode(data).decode('ascii'),
        'sha256': hashlib.sha256(data).hexdigest(),
    }


def _decode_snapshot(value, expected_path):
    if (not isinstance(value, dict) or set(value) != {'path', 'exists', 'data', 'sha256'}
            or value['path'] != str(expected_path) or type(value['exists']) is not bool):
        raise ValueError('Recovery-Ziel ist ungültig.')
    if not value['exists']:
        if value['data'] is not None or value['sha256'] is not None:
            raise ValueError('Fehlender Recovery-Stand ist ungültig.')
        return None
    if not isinstance(value['data'], str) or not isinstance(value['sha256'], str):
        raise ValueError('Recovery-Inhalt fehlt.')
    data = base64.b64decode(value['data'], validate=True)
    if (len(data) > _MAX_FILE_BYTES or hashlib.sha256(data).hexdigest() != value['sha256']):
        raise ValueError('Recovery-Prüfsumme stimmt nicht.')
    return data


def _write_journal(path, document):
    encoded = json.dumps(document, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode('utf-8')
    if len(encoded) > _MAX_JOURNAL_BYTES:
        raise ValueError('Recovery-Journal überschreitet die Größenbegrenzung.')
    stage = _stage(path, encoded)
    try:
        os.replace(stage, path)
        if path.read_bytes() != encoded:
            raise OSError('Recovery-Journal-Readback stimmt nicht überein.')
    finally:
        stage.unlink(missing_ok=True)


def _read_journal(path, paths):
    try:
        raw = path.read_bytes()
        if len(raw) > _MAX_JOURNAL_BYTES:
            raise ValueError('Recovery-Journal überschreitet die Größenbegrenzung.')
        doc = json.loads(raw.decode('utf-8'), object_pairs_hook=_unique_object)
        if (not isinstance(doc, dict) or set(doc) != {'schemaVersion', 'phase', 'paths', 'before', 'after'}
                or type(doc['schemaVersion']) is not int or doc['schemaVersion'] != 1
                or doc['phase'] not in ('PREPARED', 'COMMITTED')
                or not isinstance(doc['paths'], list)
                or doc['paths'] != [str(target) for target in paths]
                or not isinstance(doc['before'], list) or not isinstance(doc['after'], list)
                or len(doc['before']) != len(paths) or len(doc['after']) != len(paths)):
            raise ValueError('Recovery-Journal ist ungültig.')
        before = [_decode_snapshot(row, target) for row, target in zip(doc['before'], paths)]
        after = [_decode_snapshot(row, target) for row, target in zip(doc['after'], paths)]
        # A valid digest proves only that the journal bytes are intact. Validate
        # every persisted config before recovery can write any target.
        for snapshot in before + after:
            if snapshot is not None:
                DrawdownConfig.model_validate(json.loads(snapshot.decode('utf-8')))
        return doc['phase'], before if doc['phase'] == 'PREPARED' else after
    except OSError:
        raise
    except Exception as exc:
        raise ValueError('Recovery-Journal ist ungültig.') from exc


def recover(targets):
    """Restore an interrupted, uncommitted reset before exposing config state."""
    paths = _targets(targets)
    journal = _journal_path(paths)
    if not journal.exists():
        return False
    phase, snapshots = _read_journal(journal, paths)
    # PREPARED rolls back; COMMITTED replays the verified new values.
    _finish(journal, paths, snapshots)
    return True


def _finish(journal, paths, snapshots):
    staged = {}
    try:
        # Stage the complete restore before replacing any member of the pair.
        for path, data in zip(paths, snapshots):
            if data is not None:
                if not path.parent.is_dir():
                    raise OSError('Reset-Zielverzeichnis fehlt.')
                staged[path] = _stage(path, data)
        for path, data in zip(paths, snapshots):
            if data is None:
                path.unlink(missing_ok=True)
            else:
                os.replace(staged[path], path)
                if path.read_bytes() != data:
                    raise OSError('Recovery-Readback stimmt nicht überein.')
        journal.unlink(missing_ok=True)
        return True
    finally:
        for stage in staged.values():
            stage.unlink(missing_ok=True)


def save(config, targets):
    validated = DrawdownConfig.model_validate(config).model_dump()
    payload = json.dumps(validated, indent=2, allow_nan=False).encode('utf-8')
    paths = _targets(targets)
    recover(paths)
    journal = _journal_path(paths)
    before = [_snapshot(path) for path in paths]
    after = [{'path': str(path), 'exists': True,
              'data': base64.b64encode(payload).decode('ascii'),
              'sha256': hashlib.sha256(payload).hexdigest()} for path in paths]
    document = {'schemaVersion': 1, 'phase': 'PREPARED',
                'paths': [str(path) for path in paths], 'before': before, 'after': after}
    staged = {}
    try:
        _write_journal(journal, document)
        for path in paths:
            staged[path] = _stage(path, payload)
        for path in paths:
            os.replace(staged[path], path)
            if load(path) != validated:
                raise OSError('Reset-Readback stimmt nicht überein.')
        document['phase'] = 'COMMITTED'
        _write_journal(journal, document)
        journal.unlink()
    except Exception as exc:
        try:
            recover(paths)
            recovery_error = None
        except Exception as recovery:
            recovery_error = recovery
        if recovery_error:
            raise OSError('Reset-Persistenz fehlgeschlagen; Recovery bleibt für den nächsten Lese-/Schreibzugriff vorgemerkt.') from recovery_error
        raise OSError('Reset-Persistenz fehlgeschlagen; Recovery gemäß Transaktionsjournal ausgeführt.') from exc
    finally:
        for stage in staged.values():
            stage.unlink(missing_ok=True)
    return validated

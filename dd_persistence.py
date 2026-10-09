"""Validated, per-file atomic reset persistence; multi-target failures are explicit.

All targets are staged before replacement. Failed commits are rolled back where
possible, with readback. Two files cannot be a crash-atomic transaction; callers
must never interpret a persistence error as an EA acknowledgement.
"""
import json
import os
import tempfile
from datetime import date
from pathlib import Path
from typing import Annotated
from pydantic import BaseModel, ConfigDict, Field, FiniteFloat, model_validator


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


def save(config, targets):
    validated = DrawdownConfig.model_validate(config).model_dump()
    payload = json.dumps(validated, indent=2, allow_nan=False).encode('utf-8')
    paths = [Path(p) for p in targets]
    before, staged, committed = {}, {}, []
    try:
        for path in paths:
            before[path] = path.read_bytes() if path.exists() else None
            staged[path] = _stage(path, payload)
        for path in paths:
            os.replace(staged[path], path)
            committed.append(path)
            if load(path) != validated:
                raise OSError('Reset-Readback stimmt nicht überein.')
    except Exception as exc:
        rollback_errors = []
        for path in reversed(committed):
            try:
                if before[path] is None:
                    path.unlink(missing_ok=True)
                else:
                    backup = _stage(path, before[path])
                    try:
                        os.replace(backup, path)
                        if path.read_bytes() != before[path]:
                            raise OSError('Rollback-Readback fehlgeschlagen.')
                    finally:
                        backup.unlink(missing_ok=True)
            except Exception:
                rollback_errors.append(path.name)
        raise OSError('Reset-Persistenz fehlgeschlagen; '+
                      ('Teilzustand/Rollback fehlgeschlagen: '+', '.join(rollback_errors)
                       if rollback_errors else 'vorheriger Zustand wiederhergestellt.')) from exc
    finally:
        for stage in staged.values():
            stage.unlink(missing_ok=True)
    return validated

"""Role-bound endpoint for the independently guarded Chart Studio commit service."""
import re
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, StrictBool, StrictStr, field_validator
from chart_studio.position_preview import PreviewLimiter


class PositionCommitRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)

    schemaVersion: Literal[1] = 1
    account: StrictStr
    symbol: StrictStr
    positionTicket: StrictStr
    expectedRevision: StrictStr
    previewId: StrictStr
    userConfirmed: StrictBool
    idempotencyKey: StrictStr

    @field_validator('account')
    @classmethod
    def account_name(cls, value):
        if not re.fullmatch(r'[a-z0-9_-]{1,32}', value):
            raise ValueError('Invalid account')
        return value

    @field_validator('symbol')
    @classmethod
    def symbol_name(cls, value):
        if not re.fullmatch(r'[A-Za-z0-9._-]{1,32}', value):
            raise ValueError('Invalid symbol')
        return value

    @field_validator('positionTicket')
    @classmethod
    def ticket(cls, value):
        if not re.fullmatch(r'[1-9][0-9]{0,19}', value):
            raise ValueError('Invalid ticket')
        return value

    @field_validator('expectedRevision')
    @classmethod
    def revision(cls, value):
        if not re.fullmatch(r'[0-9a-f]{64}', value):
            raise ValueError('Invalid revision')
        return value

    @field_validator('previewId')
    @classmethod
    def preview_token(cls, value):
        if not re.fullmatch(r'[A-Za-z0-9_-]{32,128}', value):
            raise ValueError('Invalid preview ID')
        return value

    @field_validator('idempotencyKey')
    @classmethod
    def idempotency_uuid(cls, value):
        if str(UUID(value)) != value:
            raise ValueError('Canonical UUID required')
        return value

    @field_validator('userConfirmed')
    @classmethod
    def confirmation(cls, value):
        if value is not True:
            raise ValueError('Explicit confirmation required')
        return value
    @field_validator('schemaVersion', mode='before')
    @classmethod
    def version(cls, value):
        if type(value) is not int:
            raise ValueError('Integer version required')
        return value


def install_position_commit_routes(
    app: FastAPI,
    mt5,
    *,
    enabled: bool = False,
    guard_provider=None,
    audit_store=None,
    commit_service=None,
):
    """Install the commit endpoint; only a fully injected service can enable it."""
    # Keep references explicit in app state for startup diagnostics without
    # inferring capability from environment variables or a lone Boolean flag.
    registry = getattr(app.state, 'position_preview_registry', None)
    dependencies_supplied = bool(
        guard_provider is not None and audit_store is not None
        and commit_service is not None and getattr(commit_service, 'mt5', None) is mt5
        and getattr(commit_service, 'guard', None) is guard_provider
        and getattr(commit_service, 'store', None) is audit_store
        and getattr(commit_service, 'previews', None) is registry and registry is not None
    )
    configured = enabled is True and dependencies_supplied
    app.state.position_commit_dependencies_supplied = dependencies_supplied
    app.state.position_commit_write_capable = configured
    limiter = PreviewLimiter()
    app.state.position_commit_limiter = limiter
    router = APIRouter()

    @router.post('/api/chart/v1/position/commit-stop')
    def commit_stop(payload: PositionCommitRequest, request: Request):
        identity = getattr(request.state, 'control_identity', None)
        peer = getattr(request.state, 'raw_peer', None)
        if (not isinstance(identity, tuple) or len(identity) != 3 or
                identity[2] != 'trade' or not isinstance(peer, str) or not peer):
            raise HTTPException(403, {
                'code': 'IDENTITY_REQUIRED', 'canExecute': False, 'canCommit': False,
                'guard': {'state': 'UNKNOWN', 'source': 'NONE'},
            })
        if not configured:
            raise HTTPException(503, {
                'code': 'COMMIT_DISABLED', 'canExecute': False, 'canCommit': False,
                'guard': {'state': 'UNKNOWN', 'source': 'NONE'},
            })
        with limiter.acquire(identity[:2]):
            result = commit_service.commit(payload, identity, peer)
        return JSONResponse(result, headers={'Cache-Control': 'no-store'})

    app.include_router(router)

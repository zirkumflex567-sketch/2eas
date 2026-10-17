"""Fail-closed route boundary for a separate new-entry MT5 trade ticket."""
import re
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictStr, field_validator

from chart_studio.position_preview import PreviewLimiter


TRADE_TICKET_ACCOUNTS = frozenset({'titan', 'xau5m_m5', 'titan_m5', 'xau5m_500'})
TRADE_TICKET_PATH = '/api/chart/v1/trade-ticket/commit'


class TradeTicketCommitRequest(BaseModel):
    """Commit accepts only a server proposal reference, never order parameters."""

    model_config = ConfigDict(extra='forbid', strict=True)

    schemaVersion: Literal[1] = 1
    account: StrictStr
    symbol: StrictStr
    previewId: StrictStr
    userConfirmed: StrictBool
    confirmationText: Annotated[StrictStr, Field(min_length=1, max_length=256)]
    idempotencyKey: StrictStr

    @field_validator('schemaVersion', mode='before')
    @classmethod
    def strict_schema_version(cls, value):
        if type(value) is not int:
            raise ValueError('Integer schema version required')
        return value

    @field_validator('account')
    @classmethod
    def demo_account(cls, value):
        if value not in TRADE_TICKET_ACCOUNTS:
            raise ValueError('Authorized demo account required')
        return value

    @field_validator('symbol')
    @classmethod
    def symbol_name(cls, value):
        if not re.fullmatch(r'[A-Za-z0-9._-]{1,32}', value):
            raise ValueError('Invalid symbol')
        return value

    @field_validator('previewId')
    @classmethod
    def preview_token(cls, value):
        if not re.fullmatch(r'[A-Za-z0-9_-]{32,128}', value):
            raise ValueError('Invalid preview ID')
        return value

    @field_validator('userConfirmed')
    @classmethod
    def require_confirmation(cls, value):
        if value is not True:
            raise ValueError('Explicit confirmation required')
        return value

    @field_validator('confirmationText')
    @classmethod
    def typed_confirmation(cls, value):
        if not value.strip() or value != value.strip():
            raise ValueError('Typed confirmation required')
        return value

    @field_validator('idempotencyKey')
    @classmethod
    def canonical_idempotency_uuid(cls, value):
        if str(UUID(value)) != value:
            raise ValueError('Canonical UUID required')
        return value


def install_trade_ticket_routes(
    app: FastAPI,
    mt5,
    *,
    enabled: bool = False,
    preview_registry=None,
    guard_provider=None,
    audit_store=None,
    commit_service=None,
):
    """Install the distinct entry-ticket commit path, disabled by default."""
    configured = bool(
        enabled is True and preview_registry is not None and guard_provider is not None
        and audit_store is not None and commit_service is not None
        and getattr(commit_service, 'mt5', None) is mt5
        and getattr(commit_service, 'previews', None) is preview_registry
        and getattr(commit_service, 'guard', None) is guard_provider
        and getattr(commit_service, 'store', None) is audit_store
    )
    app.state.trade_ticket_dependencies_supplied = configured
    app.state.trade_ticket_write_capable = configured
    limiter = PreviewLimiter()
    app.state.trade_ticket_limiter = limiter

    router = APIRouter()

    @router.post(TRADE_TICKET_PATH)
    def commit_trade_ticket(payload: TradeTicketCommitRequest, request: Request):
        identity = getattr(request.state, 'control_identity', None)
        peer = getattr(request.state, 'raw_peer', None)
        if (not isinstance(identity, tuple) or len(identity) != 3 or
                any(not isinstance(part, str) or not part.strip() for part in identity) or
                identity[2] != 'trade' or not isinstance(peer, str) or not peer.strip()):
            raise HTTPException(403, {
                'code': 'IDENTITY_REQUIRED', 'status': 'DISABLED', 'canCommit': False,
                'guard': {'state': 'UNKNOWN', 'source': 'NONE'},
            })
        if not configured:
            raise HTTPException(503, {
                'code': 'TRADE_TICKET_DISABLED', 'status': 'DISABLED', 'canCommit': False,
                'guard': {'state': 'UNKNOWN', 'source': 'NONE'},
            })
        with limiter.acquire(identity[:2]):
            result = commit_service.commit(payload, identity, peer)
        return JSONResponse(result, headers={'Cache-Control': 'no-store'})

    app.include_router(router)

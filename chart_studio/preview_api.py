"""Actual position stop calculations; preview IDs are never trade permission."""
import re
import time
from datetime import datetime, timezone
from decimal import Decimal, localcontext
from typing import Literal
from uuid import UUID
from fastapi import APIRouter, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, StrictStr, field_validator, model_validator
import account_gateway as gateway
from broker_telemetry import TelemetryAPIRoute
from chart_studio import broker_reads as reads
from chart_studio.position_preview import (
    PolicyError, number, actual_number, canonical, mt5_float, geometry,
    scope_hash, PreviewRegistry, PreviewLimiter,
)

class Candidate(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    slPrice: StrictStr | None = None
    tpPrice: StrictStr | None = None
    @field_validator('slPrice', 'tpPrice')
    @classmethod
    def price(cls, value):
        if value is not None: number(value)
        return value
    @model_validator(mode='after')
    def supplied(self):
        if not self.model_fields_set: raise ValueError('At least one leg required')
        return self

class PreviewRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    schemaVersion: Literal[1] = 1
    account: StrictStr
    symbol: StrictStr
    positionTicket: StrictStr
    expectedRevision: StrictStr
    candidate: Candidate
    clientRequestId: StrictStr
    @field_validator('account')
    @classmethod
    def account_name(cls,value):
        if not re.fullmatch(r'[a-z0-9_-]{1,32}',value): raise ValueError('Invalid account')
        return value
    @field_validator('symbol')
    @classmethod
    def symbol_name(cls,value): return reads.broker_symbol(value)
    @field_validator('positionTicket')
    @classmethod
    def ticket(cls,value):
        if not re.fullmatch(r'[1-9][0-9]{0,19}',value): raise ValueError('Invalid ticket')
        return value
    @field_validator('expectedRevision')
    @classmethod
    def revision(cls,value):
        if not re.fullmatch(r'[0-9a-f]{64}',value): raise ValueError('Invalid revision')
        return value
    @field_validator('clientRequestId')
    @classmethod
    def request_id(cls,value):
        if str(UUID(value)) != value: raise ValueError('Canonical UUID required')
        return value
    @field_validator('schemaVersion', mode='before')
    @classmethod
    def version(cls,value):
        if type(value) is not int: raise ValueError('Integer version required')
        return value

def failure(status, code, **fields):
    return HTTPException(status, {'code':code, 'canExecute':False,'canCommit':False,
                                'guard':{'state':'UNKNOWN','source':'NONE'}, **fields})

class PreviewRoute(TelemetryAPIRoute):
    def get_route_handler(self):
        original = super().get_route_handler()
        async def handle(request):
            try: return await original(request)
            except RequestValidationError:
                return JSONResponse({'detail':failure(422,'INVALID_REQUEST').detail},status_code=422,
                                    headers={'Cache-Control':'no-store'})
        return handle

def utc(seconds): return datetime.fromtimestamp(seconds,timezone.utc).isoformat().replace('+00:00','Z')

def install_preview_routes(app, mt5, *, now=None, monotonic=None, guard_provider=None,
                           commit_enabled=False):
    clock = now or time.time
    mono = monotonic or time.monotonic
    registry, limiter = PreviewRegistry(monotonic=mono), PreviewLimiter(monotonic=mono)
    app.state.position_preview_registry = registry
    app.state.position_preview_limiter = limiter

    def snapshot(spec, payload):
        book = reads.positions_read(mt5,spec,payload.symbol,now=clock())
        selected = [p for p in book['positions'] if p['ticket']==payload.positionTicket]
        if len(selected)!=1:
            if not selected: raise failure(404,'POSITION_NOT_FOUND')
            raise failure(503,'BROKER_DATA_UNAVAILABLE')
        observed=clock()
        model=reads.quote_model(mt5.symbol_info_tick(payload.symbol),spec,symbol=payload.symbol,now=observed)
        age=observed*1000-model['quoteTimeUtcMs']
        future_tolerance_ms = int(round(reads.QUOTE_FUTURE_TOLERANCE_SECONDS * 1000))
        if not -future_tolerance_ms<=age<=5000: raise failure(503,'QUOTE_NOT_FRESH')
        actual_number(Decimal(model['bid']))
        actual_number(Decimal(model['ask']))
        model.update(ageMs=age,minimumAgeMs=-future_tolerance_ms,maximumAgeMs=5000,
                     allowedFutureSkewMs=future_tolerance_ms,observedServerUtc=utc(observed))
        return selected[0],model

    router = APIRouter(route_class=PreviewRoute)

    @router.post('/api/chart/v1/position/preview-stop')
    def preview(payload: PreviewRequest, request: Request):
        identity=getattr(request.state,'control_identity',None)
        peer=getattr(request.state,'raw_peer',None)
        if (not isinstance(identity,tuple) or len(identity)!=3 or
                identity[2] not in ('read','layout','trade') or not isinstance(peer,str) or not peer):
            raise failure(403,'IDENTITY_REQUIRED')
        # Quota follows authentication subject across peer and role changes.
        # Full identity, role and raw peer still bind every registry snapshot.
        principal=identity[:2]
        try:
            with localcontext() as context:
                context.prec = 64
                with limiter.acquire(principal):
                    with gateway.traced_session(mt5,payload.account) as spec:
                        gateway.verify_identity(mt5,spec)
                        position,initial_quote=snapshot(spec,payload)
                        if position['revision']!=payload.expectedRevision:
                            raise failure(409,'POSITION_CHANGED',currentRevision=position['revision'])
                        metadata=reads.require_symbol(mt5,payload.symbol)
                        if type(getattr(metadata,'trade_mode',None)) is not int or metadata.trade_mode not in range(5):
                            raise failure(503,'TRADE_MODE_UNKNOWN')
                        reads.symbol_model(metadata,spec)
                        attrs=('point','trade_tick_size','volume_step','volume_min','volume_max',
                               'trade_stops_level','trade_freeze_level','trade_mode','order_mode',
                               'trade_contract_size','trade_calc_mode','currency_base',
                               'currency_profit','currency_margin','trade_tick_value',
                               'trade_tick_value_profit','trade_tick_value_loss')
                        metadata_snapshot=tuple(getattr(metadata,a,None) for a in attrs)
                        candidate=payload.candidate.model_dump(exclude_unset=True)
                        final,reasons,step=geometry(position,candidate,metadata,initial_quote)
                        volume=actual_number(Decimal(position['volume']),maximum=Decimal('1e9'))
                        volume_step=actual_number(metadata.volume_step,maximum=Decimal('1e9'))
                        if volume % volume_step: raise PolicyError('NUMERIC_POLICY_UNSUPPORTED')
                        opening=actual_number(Decimal(position['priceOpen']))
                        money={}
                        def verify_money_currency():
                            current=reads.text(reads.required(gateway.verify_identity(mt5,spec),'currency'))
                            if current != position['currency']:
                                raise failure(409,'ACCOUNT_CURRENCY_CHANGED')
                        verify_money_currency()
                        for leg,price in final.items():
                            if price is None: money[leg]=None; continue
                            target=number(price)
                            result=mt5.order_calc_profit(0 if position['side']=='BUY' else 1,payload.symbol,
                                mt5_float(volume,volume_step),mt5_float(opening,step),mt5_float(target,step))
                            if isinstance(result,bool) or not isinstance(result,(int,float,Decimal)) or not Decimal(str(result)).is_finite():
                                raise failure(503,'PROFIT_UNAVAILABLE')
                            money[leg]=canonical(Decimal(str(result)))
                        verify_money_currency()
                        final_position,final_quote=snapshot(spec,payload)
                        if final_position['currency'] != position['currency']:
                            raise failure(409,'ACCOUNT_CURRENCY_CHANGED')
                        if final_position['revision']!=position['revision']:
                            raise failure(409,'POSITION_CHANGED',currentRevision=final_position['revision'])
                        final_metadata=reads.require_symbol(mt5,payload.symbol)
                        if type(getattr(final_metadata,'trade_mode',None)) is not int or final_metadata.trade_mode not in range(5):
                            raise failure(503,'TRADE_MODE_UNKNOWN')
                        reads.symbol_model(final_metadata,spec)
                        final,reasons,step=geometry(final_position,candidate,final_metadata,final_quote)
                        # Metadata correction during calculation invalidates that calculation.
                        if metadata_snapshot != tuple(getattr(final_metadata,a,None) for a in attrs):
                            raise failure(409,'SYMBOL_CHANGED')
                        verify_money_currency()
                        asof=clock()
                        with localcontext() as ctx:
                            ctx.prec=64
                            rr=(canonical(Decimal(money['tp'])/-Decimal(money['sl']))
                                if money['sl'] is not None and money['tp'] is not None and
                                Decimal(money['sl'])<0<Decimal(money['tp']) else None)
                        guard={'state':'UNKNOWN','source':'NONE'}
                        can_commit=False
                        if identity[2]=='trade' and guard_provider is not None and not reasons:
                            increasing=False
                            changed=False
                            for leg in ('sl','tp'):
                                proposed,old=final[leg],final_position[leg]
                                changed = changed or (proposed is None) != (old is None) or (
                                    proposed is not None and old is not None and Decimal(proposed) != Decimal(old))
                                if proposed is None:
                                    increasing=increasing or old is not None
                                elif old is not None:
                                    if leg=='sl':
                                        increasing=increasing or (Decimal(proposed)<Decimal(old) if final_position['side']=='BUY' else Decimal(proposed)>Decimal(old))
                                    else:
                                        increasing=increasing or (Decimal(proposed)>Decimal(old) if final_position['side']=='BUY' else Decimal(proposed)<Decimal(old))
                            try:
                                decision=guard_provider.evaluate(
                                    spec=spec,position=final_position,
                                    action='RISK_INCREASING_PROTECTION' if increasing else 'RISK_REDUCING_PROTECTION',
                                    riskIncreasing=increasing,
                                    changes={'slPrice':final['sl'],'tpPrice':final['tp']})
                                if isinstance(decision,dict) and decision.get('state') in ('ALLOW','BLOCK') and isinstance(decision.get('source'),str):
                                    guard={'state':decision['state'],'source':decision['source']}
                                    can_commit=(commit_enabled is True and changed and decision['state']=='ALLOW' and
                                                decision.get('hardLock') is False and
                                                final_quote.get('ageMs', 0) >= -1000)
                            except Exception:
                                pass
                        result={'schemaVersion':1,'clientRequestId':payload.clientRequestId,
                            'positionTicket':payload.positionTicket,'positionRevision':position['revision'],
                            'account':spec['id'],'symbol':payload.symbol,'brokerPreview':{'slPrice':final['sl'],'tpPrice':final['tp']},
                            'quote':final_quote,'initialQuote':initial_quote,
                            'pnlAtSl':({'amount':money['sl'],'currency':position['currency'],
                                        'kind':'estimatedGross'} if money['sl'] is not None else None),
                            'pnlAtTp':({'amount':money['tp'],'currency':position['currency'],
                                        'kind':'estimatedGross'} if money['tp'] is not None else None),
                            'ratioRiskReward':rr,
                            'ratioRiskRewardState':'AVAILABLE' if rr is not None else 'UNAVAILABLE',
                            'quoteTimeUtc':utc(final_quote['quoteTimeUtcMs']/1000),
                            'valid':not reasons,
                            'geometry':{'state':'VALID' if not reasons else 'INVALID','reasons':reasons,
                                        'tradeMode':final_metadata.trade_mode},
                            'marketSession':{'state':'UNKNOWN','source':'NONE'},
                            'guard':guard,'canExecute':False,'canCommit':can_commit,
                            'asOfServerUtc':utc(asof),'expiresAtUtc':utc(asof+10),
                            'warnings':['GROSS_EXCLUDES_FEES_SWAP_GAPS_SLIPPAGE','MARKET_SESSION_UNKNOWN',
                                        'GUARD_'+guard['state'],'CALCULATION_IS_NOT_PERMISSION',
                                        'CONSERVATIVE_EXISTING_FREEZE_POLICY']}
                        scope=scope_hash(identity,peer,spec,payload.symbol,payload.positionTicket,position['revision'])
                        return JSONResponse(registry.put(scope,result),headers={'Cache-Control':'no-store'})
        except HTTPException as exc:
            if isinstance(exc.detail,dict) and 'canCommit' in exc.detail:
                raise
            raise failure(exc.status_code,'RATE_LIMITED' if exc.status_code==429 else
                          'IDENTITY_MISMATCH' if exc.status_code==409 else 'BROKER_DATA_UNAVAILABLE') from exc
        except PolicyError as exc: raise failure(503,exc.code) from exc
        except Exception as exc: raise failure(503,'BROKER_DATA_UNAVAILABLE') from exc

    app.include_router(router)

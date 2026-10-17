"""Synthetic evidence boundary tests: no broker sessions or historical claims."""
import copy
import importlib
import json
import hashlib
from decimal import getcontext
import pytest

H = 'a' * 64
T = '2026-01-02T03:04:05Z'

def api():
    assert importlib.util.find_spec('chart_studio.evidence_models'), 'evidence models boundary is missing'
    return importlib.import_module('chart_studio.evidence_models')

def context():
    return api().AccountContext.from_config('titan')

def decision():
    return dict(eventId='event_1', accountId='titan', terminalIdentityHash=context().terminal_identity_hash,
                symbol='XAUUSD', strategyId='test_strategy', strategyVersion='v1', parameterSetHash=H,
                decisionTimeUtc=T, evaluatedBarCloseUtc=T, timeframe='M5', barIsClosed=True,
                featureVector=[dict(id='atr',value=1.2,unit='price',timeframe='M5')],
                predicates=[dict(ruleId='atr_rule',observedValue=1.2,comparator='GT',threshold=1,
                                 outcome='PASS',reasonCode='OK')],stage='SIGNAL',outcome='PASS',
                dataProvenance='recorded',dataRevision=1,capturedAtUtc=T,correlationId='corr_1')

def execution_decision():
    value=decision();value.update(stage='ORDER_ATTEMPT',outcome='PASS',orderAttemptId='attempt_1',brokerTicket='91',
        orderAttempt=dict(orderAttemptId='attempt_1',brokerTicket='91',side='BUY',intendedPrice='100',requestedVolume='0.2',
          requestTimeUtc='2026-01-02T03:04:05Z',quoteSnapshot=dict(symbol='XAUUSD',bid='99.9',ask='100.1',tickSize='0.1',
            tickValuePerLot='1',currency='USD',quoteTimeUtc='2026-01-02T03:04:04Z',source='MT5_VERIFIED',canExecute=False)))
    return value

def envelope(payload=None, kind='DECISION'):
    p = decision() if payload is None else payload
    identity = {'DECISION':'eventId','LIFECYCLE':'id','SNAPSHOT':'snapshotId'}[kind]
    return dict(schemaVersion=1,type=kind,id=p[identity],accountId='titan',brokerServer=context().broker_server,
                terminalIdentityHash=context().terminal_identity_hash,dataRevision=1,provenance='RECORDED',
                supersedes=None,payload=p)

def validate(e):
    return api().validate_envelope(e, context=context())

def reject(e):
    with pytest.raises(ValueError): validate(e)

def snapshot():
    return dict(snapshotId='snap_1',accountId='titan',positionIdentifier='1',dealTicket='2',captureType='ENTRY',
                asOfUtc=T,chartView=dict(symbol='XAUUSD',timeframe='M5',fromUtc=T,toUtc=T,
                seriesType='CANDLE',priceScale='NORMAL'),marketDataRef=None,indicatorInstanceRevisions=[],
                decisionEventIds=[dict(type='DECISION',id='event_1',dataRevision=1)],renderStatus='DATA_ONLY',
                renderAssetRef=None,createdAtUtc=T)

def frozen_market_data():
    rows=[dict(timeUtc='2026-01-02T02:45:00.000000Z',open='1',high='2',low='1',close='2',tickVolume=3,spread=1,realVolume=0)]
    digest=hashlib.sha256(api().canonical_bytes(rows)).hexdigest()
    return dict(source='MT5_COMPLETED_BARS',bars=rows,sha256=digest)

def lifecycle():
    return dict(id='life_1',accountId='titan',positionIdentifier='1',eventType='ENTRY',source='MT5_DEAL',
                asOfUtc=T,price='001.2300',volume='0.01',actor='UNKNOWN',dataQuality='OBSERVED')

def test_envelope_rejects_extra_secret_and_duplicate_keys():
    assert validate(envelope())['schemaVersion'] == 1
    for place in ('root','payload'):
        e=envelope(); (e if place=='root' else e['payload'])['password']='hidden'; reject(e)
    raw=json.dumps(envelope()).replace('"schemaVersion": 1','"schemaVersion": 1, "schemaVersion": 1')
    with pytest.raises(ValueError): api().parse_envelope(raw,context=context())

def test_decimal_and_utc_boundaries():
    m=api(); precision=getcontext().prec
    assert m.decimal_string('-000.1200',signed=True)=='-0.12'
    assert m.decimal_string('-0.000',signed=True)=='0'
    for v in ['0','-1','1e2','NaN',True,1.2,'1.0000000000001','1000000000001']:
        with pytest.raises(ValueError): m.decimal_string(v)
    assert getcontext().prec==precision
    assert m.utc_timestamp(T)=='2026-01-02T03:04:05.000000Z'
    assert m.utc_microseconds(T)==m.utc_microseconds('2026-01-02T03:04:05+00:00')
    for v in [True,'2026-02-30T00:00:00Z','2026-01-01T00:00:00','2026-01-01T01:00:00+01:00','2026-01-01T00:00:00.0000001Z']:
        with pytest.raises(ValueError): m.utc_timestamp(v)

@pytest.mark.parametrize('field,value', [('barIsClosed',1),('dataRevision',True),('timeframe','H2'),('featureVector',[dict(id='x',value=float('nan'),unit='x',timeframe='M5')])])
def test_decision_strict_values(field,value):
    e=envelope();e['payload'][field]=value;reject(e)

def test_execution_attempt_reference_is_strict_and_quote_precedes_request():
    payload=execution_decision();validated=validate(envelope(payload))['payload']
    assert validated['orderAttempt']['quoteSnapshot']['source']=='MT5_VERIFIED'
    for field,value in [('stage','SIGNAL'),('orderAttemptId','different'),('brokerTicket','92')]:
        bad=execution_decision();bad[field]=value;reject(envelope(bad))
    for field,value in [('side','LONG'),('intendedPrice','NaN'),('requestedVolume','0'),('requestTimeUtc','2026-01-02T03:04:03Z')]:
        bad=execution_decision();bad['orderAttempt'][field]=value;reject(envelope(bad))
    for field,value in [('source','RECONSTRUCTED'),('canExecute',True),('ask','99'),('quoteTimeUtc','2026-01-02T03:04:06Z'),('symbol','EURUSD')]:
        bad=execution_decision();bad['orderAttempt']['quoteSnapshot'][field]=value;reject(envelope(bad))

def test_same_second_quote_is_serialized_at_request_precision():
    e=execution_decision()
    e['orderAttempt']['quoteSnapshot']['quoteTimeUtc']='2026-01-02T03:04:05Z'
    validate(envelope(e))

def test_execution_quote_broker_epoch_requires_explicit_consistent_offset():
    e=execution_decision()
    quote=e['orderAttempt']['quoteSnapshot']
    quote['brokerTimeEpochMs']=api().utc_microseconds(quote['quoteTimeUtc'])//1000+10800*1000
    quote['brokerUtcOffsetSeconds']=10800
    validated=validate(envelope(e))['payload']['orderAttempt']['quoteSnapshot']
    assert validated['brokerTimeEpochMs']==quote['brokerTimeEpochMs']
    assert validated['brokerUtcOffsetSeconds']==10800
    for removed in ('brokerTimeEpochMs','brokerUtcOffsetSeconds'):
        bad=execution_decision()
        bad['orderAttempt']['quoteSnapshot'].update(quote)
        del bad['orderAttempt']['quoteSnapshot'][removed]
        reject(envelope(bad))
    bad=execution_decision()
    bad['orderAttempt']['quoteSnapshot'].update(quote,brokerUtcOffsetSeconds=7200)
    reject(envelope(bad))

def test_typed_guard_chart_view_limits():
    e=envelope();e['payload']['guardSnapshot']=dict(state='UNKNOWN',sourceRevision=None,checks=[])
    validate(e)
    e['payload']['guardSnapshot']['sourceRevision']=H;reject(e)
    e=envelope();e['payload']['featureVector']*=129;reject(e)
    e=envelope(snapshot(),'SNAPSHOT');e['payload']['chartView']['notes']='anything';reject(e)

def test_snapshot_freezes_bounded_market_bars_and_checks_digest():
    e=envelope(snapshot(),'SNAPSHOT'); p=e['payload']; p['decisionEventIds']=[]
    p['marketData']=frozen_market_data()
    p['chartView']['fromUtc']=p['chartView']['toUtc']=p['marketData']['bars'][0]['timeUtc']
    p['marketDataRef']=dict(id='market_1',sourceType='MARKET_BAR',accountId='titan',brokerServer=context().broker_server,
        symbol='XAUUSD',eventTimeUtc=p['marketData']['bars'][0]['timeUtc'],recordedAtUtc=T,sourceRevision=p['marketData']['sha256'],confidenceKind='OBSERVED')
    validate(e)
    e['payload']['marketData']['bars'][0]['close']='1.5'; reject(e)
    e=envelope(snapshot(),'SNAPSHOT');e['payload']['decisionEventIds']=[];e['payload']['marketData']=frozen_market_data()
    e['payload']['marketData']['bars']*=151
    e['payload']['marketData']['sha256']=hashlib.sha256(api().canonical_bytes(e['payload']['marketData']['bars'])).hexdigest()
    reject(e)

def test_snapshot_market_bars_must_be_closed_at_asof_including_calendar_months():
    m=api()
    assert m.market_bar_close_microseconds('2026-02-01T00:00:00Z','MN1') == m.utc_microseconds('2026-03-01T00:00:00Z')
    assert m.market_bar_close_microseconds('2026-03-01T00:00:00Z','MN1') == m.utc_microseconds('2026-04-01T00:00:00Z')
    assert m.market_bar_close_microseconds('2026-01-01T00:00:00Z','MN1') == m.utc_microseconds('2026-02-01T00:00:00Z')
    e=envelope(snapshot(),'SNAPSHOT');p=e['payload'];p['decisionEventIds']=[];p['marketData']=frozen_market_data()
    p['chartView']['fromUtc']=p['chartView']['toUtc']=p['marketData']['bars'][0]['timeUtc']
    p['marketData']['bars'][0]['timeUtc']='2026-01-02T03:00:00.000000Z'
    p['chartView']['fromUtc']=p['chartView']['toUtc']=p['marketData']['bars'][0]['timeUtc']
    p['marketData']['sha256']=hashlib.sha256(m.canonical_bytes(p['marketData']['bars'])).hexdigest()
    p['marketDataRef']=dict(id='market_1',sourceType='MARKET_BAR',accountId='titan',brokerServer=context().broker_server,
        symbol='XAUUSD',eventTimeUtc=p['chartView']['toUtc'],recordedAtUtc=T,sourceRevision=p['marketData']['sha256'],confidenceKind='OBSERVED')
    p['chartView']['timeframe']='M15'
    with pytest.raises(ValueError):validate(e)
    e=envelope(snapshot(),'SNAPSHOT');e['payload']['chartView']['toUtc']='2026-03-01T00:00:00Z';reject(e)

def test_canonical_hash_and_exact_roundtrip():
    m=api();e=validate(envelope());raw=m.canonical_bytes(e)
    assert m.parse_envelope(raw,context=context())==e
    assert m.envelope_hash(e,context=context())==hashlib.sha256(raw).hexdigest()
    reordered=dict(reversed(list(e.items())))
    assert m.canonical_bytes(reordered)==raw
    e['supersedes']=dict(type='DECISION',id='previous',dataRevision=1)
    assert m.envelope_hash(e,context=context())!=hashlib.sha256(raw).hexdigest()
    assert context().terminal_identity_hash==m.scoped_identity_hash('titan','53087839',context().broker_server,r'C:\Program Files\PU Prime MT5 Terminal\terminal64.exe')

def test_snapshot_reference_shape_and_asof():
    validate(envelope(snapshot(),'SNAPSHOT'))
    e=envelope(snapshot(),'SNAPSHOT');e['payload']['decisionEventIds'][0]['type']='LIFECYCLE';reject(e)
    e=envelope(snapshot(),'SNAPSHOT');e['payload']['createdAtUtc']='2025-01-01T00:00:00Z';reject(e)
    e=envelope(snapshot(),'SNAPSHOT');e['payload']['marketDataRef']=dict(id='ref',sourceType='MARKET_BAR',accountId='goldm15',brokerServer=context().broker_server,symbol='XAUUSD',eventTimeUtc=T,recordedAtUtc=T,sourceRevision=H,confidenceKind='OBSERVED');reject(e)

def test_identity_lookahead_and_correction_shape():
    for field,value in [('accountId','goldm15'),('terminalIdentityHash',H),('id','other'),('schemaVersion',2),('dataRevision',2),('provenance','RECONSTRUCTED')]:
        e=envelope();e[field]=value;reject(e)
    e=envelope();e['payload']['evaluatedBarCloseUtc']='2027-01-01T00:00:00Z';reject(e)
    e=envelope();e['supersedes']=dict(type='DECISION',id='x',dataRevision=True);reject(e)

def test_lifecycle_seal_verify_and_strict_zero():
    m=api();p=m.seal_lifecycle(lifecycle(),context=context())
    assert p['price']=='1.23'
    assert m.verify_lifecycle(p,context=context())==p
    validate(envelope(p,'LIFECYCLE'))
    p['actor']='EA'
    with pytest.raises(ValueError):m.verify_lifecycle(p,context=context())
    p=lifecycle();p['slAfter']='0'
    with pytest.raises(ValueError):m.seal_lifecycle(p,context=context())

def test_input_resource_bounds():
    m=api(); deep=0
    for _ in range(10):deep=[deep]
    for value in [deep, [None]*2049, {'x':'a'*131073}]:
        with pytest.raises(ValueError):m.parse_envelope(json.dumps(value),context=context())

@pytest.mark.parametrize('mutate',[
    lambda e:e['payload']['featureVector'].append(e['payload']['featureVector'][0]),
    lambda e:e['payload']['predicates'].append(e['payload']['predicates'][0]),
    lambda e:e['payload'].update(sourceQuoteTimeUtc='2027-01-01T00:00:00Z'),
    lambda e:e['payload'].update(capturedAtUtc='2025-01-01T00:00:00Z'),
    lambda e:e['payload'].update(brokerTicket='0'),
    lambda e:e['payload'].update(eventId='é'),
    lambda e:e['payload'].update(guardSnapshot=dict(state='RECORDED',sourceRevision=H,checks=[dict(id='g',outcome='PASS',value='1e2',limit=None)])),
    lambda e:e.update(supersedes=dict(type='DECISION',id='x',dataRevision=1,terminal='secret')),
])
def test_nested_allowlists_and_precision(mutate):
    e=envelope();mutate(e);reject(e)

@pytest.mark.parametrize('field,value', [('positionIdentifier',1),('positionIdentifier','01'),('positionIdentifier','1'*21),('price',0),('volume','0'),('actor','guessed'),('revision','A'*64),('slAfter','-1')])
def test_lifecycle_invalid_fields(field,value):
    p=api().seal_lifecycle(lifecycle(),context=context());p[field]=value
    with pytest.raises(ValueError):api().verify_lifecycle(p,context=context())

def test_evidence_and_snapshot_temporal_identity():
    ref=dict(id='ref',sourceType='MARKET_BAR',accountId='titan',brokerServer=context().broker_server,symbol='XAUUSD',eventTimeUtc=T,recordedAtUtc=T,sourceRevision=H,confidenceKind='OBSERVED')
    assert api().evidence_ref(ref,context=context())['eventTimeUtc'].endswith('.000000Z')
    for field,value in [('brokerServer','other'),('recordedAtUtc','2025-01-01T00:00:00Z'),('sourceRevision','f'*63),('confidenceKind','ASSUMED')]:
        bad=dict(ref);bad[field]=value
        with pytest.raises(ValueError):api().evidence_ref(bad,context=context())
    for field,value in [('symbol','EURUSD'),('eventTimeUtc','2027-01-01T00:00:00Z'),('sourceType','RECONSTRUCTED')]:
        e=envelope(snapshot(),'SNAPSHOT');e['payload']['marketDataRef']={**ref,field:value};reject(e)
    e=envelope(snapshot(),'SNAPSHOT');e['payload']['captureType']='BACKFILL';reject(e)
    e['provenance']='RECONSTRUCTED';validate(e)

def test_metadata_optional_absence_and_null_stops():
    m=api();e=validate(envelope())
    assert 'guardSnapshot' not in e['payload']
    assert m.event_metadata(e,context=context())==dict(type='DECISION',id='event_1',dataRevision=1,eventTimeUtc=m.utc_timestamp(T),eventTimeUs=m.utc_microseconds(T))
    p=lifecycle();p['slAfter']=None
    assert m.seal_lifecycle(p,context=context())['slAfter'] is None
    assert m.scoped_identity_hash('titan','1','fake',r'C:\Temp\a\..\terminal.exe')==m.scoped_identity_hash('titan','1','fake',r'c:\temp\terminal.exe')


def test_money_validation_does_not_depend_on_decimal_context():
    from decimal import localcontext
    with localcontext() as ctx:
        ctx.prec=2
        with pytest.raises(ValueError):api().decimal_string('1000000000000.01',signed=True)

def test_resource_boundaries_at_and_above():
    m=api()
    deep=None
    for _ in range(8):deep=[deep]
    m.canonical_bytes(deep)
    with pytest.raises(ValueError):m.canonical_bytes([deep])
    m.canonical_bytes([None]*2048)
    with pytest.raises(ValueError):m.canonical_bytes([None]*2049)
    assert len(m.canonical_bytes('a'*131070))==131072
    with pytest.raises(ValueError):m.canonical_bytes('a'*131071)
    e=envelope();e['payload']['featureVector']=[dict(id=f'f{i}',value=None,unit='x',timeframe='M1') for i in range(128)]
    validate(e)
    e['payload']['featureVector'].append(dict(id='f128',value=None,unit='x',timeframe='M1'));reject(e)
    e=envelope(snapshot(),'SNAPSHOT');e['payload']['decisionEventIds']=[dict(type='DECISION',id=f'e{i}',dataRevision=1) for i in range(256)]
    validate(e)
    e['payload']['decisionEventIds'].append(dict(type='DECISION',id='e256',dataRevision=1));reject(e)
    checks=[dict(id=f'c{i}',outcome='UNKNOWN',value=None,limit=None) for i in range(32)]
    e=envelope();e['payload']['guardSnapshot']=dict(state='UNKNOWN',sourceRevision=None,checks=checks);validate(e)
    checks.append(dict(checks[0]));reject(e)


def test_duplicate_nested_json_keys_and_nonfinite():
    raw=json.dumps(envelope()).replace('"eventId": "event_1"','"eventId": "event_1", "eventId": "event_1"')
    with pytest.raises(ValueError):api().parse_envelope(raw,context=context())
    for value in [float('inf'),float('-inf'),float('nan'),True,10**12+1]:
        e=envelope();e['payload']['predicates'][0]['threshold']=value;reject(e)
    e=envelope();e['payload']['guardSnapshot']=dict(state='UNKNOWN',sourceRevision=None,checks=[dict(id='x',outcome='UNKNOWN',value=None,limit=None)]*2);reject(e)


@pytest.mark.parametrize('kind', ['DECISION','LIFECYCLE','SNAPSHOT'])
def test_all_mandatory_fields_and_outer_identity(kind):
    p={'DECISION':decision,'LIFECYCLE':lambda:api().seal_lifecycle(lifecycle(),context=context()),'SNAPSHOT':snapshot}[kind]()
    e=envelope(p,kind)
    for key in e:
        bad=copy.deepcopy(e);del bad[key];reject(bad)
    optional={'DECISION':set(),'LIFECYCLE':{'price','volume'},'SNAPSHOT':set()}[kind]
    for key in p.keys()-optional:
        bad=copy.deepcopy(e);del bad['payload'][key];reject(bad)
    for field,value in [('accountId','unknown'),('brokerServer','unknown'),('terminalIdentityHash',H),('id','different'),('dataRevision',0),('schemaVersion',True)]:
        bad=copy.deepcopy(e);bad[field]=value;reject(bad)
    bad=copy.deepcopy(e);bad['payload']['accountId']='goldm15';reject(bad)


def test_trusted_context_requires_explicit_account_and_never_selected(monkeypatch):
    import account_gateway
    monkeypatch.setattr(account_gateway,'selected',lambda:pytest.fail('implicit selected account used'))
    assert context().account_id=='titan'
    other=api().AccountContext.from_config('goldm15')
    assert other.terminal_identity_hash!=context().terminal_identity_hash
    with pytest.raises(ValueError):api().AccountContext.from_config('unknown')
    with pytest.raises(ValueError):api().validate_envelope(envelope(),context={'account_id':'titan'})


def test_snapshot_render_and_lifecycle_provenance():
    e=envelope(snapshot(),'SNAPSHOT');e['payload']['renderAssetRef']='file.png';reject(e)
    p=lifecycle();p['dataQuality']='RECONSTRUCTED';e=envelope(api().seal_lifecycle(p,context=context()),'LIFECYCLE');reject(e)
    e['provenance']='RECONSTRUCTED';validate(e)
    e=envelope();e['payload']['dataProvenance']='reconstructed';reject(e)
    e['provenance']='RECONSTRUCTED';validate(e)
    e['payload']['dataRevision']=2;reject(e)

def test_adversarial_shapes_raise_validation_errors():
    e=envelope();e['payload']['featureVector'][0]['value']=10**1000;reject(e)
    for invalid in [None,[],True]:
        with pytest.raises(ValueError):api().lifecycle_hash(invalid,context=context())
    with pytest.raises(ValueError):api().AccountContext.from_config([])


def test_direct_context_rejects_arbitrary_terminal_identity():
    m=api();configured=context()
    with pytest.raises(ValueError):
        m.AccountContext(configured.account_id,configured.broker_server,'f'*64)
    assert m.AccountContext(configured.account_id,configured.broker_server,configured.terminal_identity_hash)==configured


def test_oversized_scalars_reject_before_costly_operations(monkeypatch):
    m=api()
    def costly(*args,**kwargs):
        pytest.fail('oversized input reached costly operation')
    with monkeypatch.context() as patch:
        patch.setattr(m.json,'dumps',costly)
        for value in ['x'*131073,{'x'*131073:None},['x'*70000,'y'*70000]]:
            with pytest.raises(ValueError):m.canonical_bytes(value)
    with monkeypatch.context() as patch:
        patch.setattr(m.re,'fullmatch',costly)
        with pytest.raises(ValueError):m.decimal_string('1'*33)
    class EncodingTrap(str):
        def encode(self,*args,**kwargs):
            pytest.fail('oversized raw text reached encoding')
    with pytest.raises(ValueError):m.parse_envelope(EncodingTrap('x'*131073),context=context())


def test_multibyte_canonical_exact_byte_boundary():
    m=api()
    assert len(m.canonical_bytes('é'*65535))==131072
    with pytest.raises(ValueError):m.canonical_bytes('é'*65536)

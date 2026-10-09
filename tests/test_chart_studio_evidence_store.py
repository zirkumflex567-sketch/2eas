"""Synthetic store tests; no terminal or broker calls."""
import importlib
import importlib.util
import copy
import os
import sqlite3
import subprocess
import time
from pathlib import Path
import pytest
from test_chart_studio_evidence_models import context, envelope, snapshot

def api():
    assert importlib.util.find_spec('chart_studio.evidence_store'), 'trusted evidence store is missing'
    return importlib.import_module('chart_studio.evidence_store')

@pytest.fixture
def private_root(tmp_path):
    root=tmp_path/'private';root.mkdir()
    if os.name=='nt':
        user=subprocess.check_output(['whoami','/user','/fo','csv','/nh'],text=True).strip().split(',')[-1].strip('"')
        subprocess.run(['icacls',str(root),'/inheritance:r','/grant:r',f'*{user}:(OI)(CI)F','*S-1-5-18:(OI)(CI)F','*S-1-5-32-544:(OI)(CI)F'],check=True,capture_output=True)
    else:root.chmod(0o700)
    return root

def store(root):return api().EvidenceStore(root,db_path=root/'evidence.sqlite',excluded_roots=[Path.cwd()])

def test_unconfigured_and_get_never_create(private_root):
    s=api().EvidenceStore(None)
    assert s.read(context(),kind='DECISION')['availability']=='NOT_RECORDED'
    s=store(private_root)
    assert s.read(context(),kind='DECISION')['storeState']=='NOT_INITIALIZED'
    assert list(private_root.iterdir())==[]

def test_idempotence_conflict_correction_and_hash(private_root):
    s=store(private_root);e=envelope()
    assert s.append(context(),e)['code']=='APPENDED'
    assert s.append(context(),e)['code']=='IDEMPOTENT'
    changed=copy.deepcopy(e);changed['payload']['outcome']='BLOCK'
    assert s.append(context(),changed)['code']=='CONFLICT'
    changed['dataRevision']=changed['payload']['dataRevision']=2
    changed['supersedes']={'type':'DECISION','id':e['id'],'dataRevision':1}
    assert s.append(context(),changed)['code']=='APPENDED'
    assert len(s.read(context(),kind='DECISION')['records'])==2
    with sqlite3.connect(s.path) as db:db.execute("UPDATE records SET sha256='bad'")
    with pytest.raises(api().StoreUnavailable):s.read(context(),kind='DECISION')

def test_references_rollback_and_loss_lifetime(private_root):
    s=store(private_root);snap=envelope(snapshot(),'SNAPSHOT')
    assert s.append(context(),snap)['code']=='CONFLICT'
    assert s.read(context(),kind='SNAPSHOT')['records']==[]
    assert s.append(context(),envelope())['ok']
    assert s.append(context(),snap)['ok']
    assert s.read(context(),kind='DECISION')['gaps']['knownLossSinceStart']==1
    assert store(private_root).read(context(),kind='DECISION')['gaps']['knownLossSinceStart']==0

def test_replacement_wal_and_capacity_busy(private_root):
    s=store(private_root);assert s.append(context(),envelope())['ok']
    other=store(private_root)
    s.record_limit=1
    e=envelope();e['id']=e['payload']['eventId']='event_2'
    assert s.append(context(),e)['code']=='RECORDING_CAPACITY'
    db=sqlite3.connect(s.path);db.execute('BEGIN IMMEDIATE')
    start=time.monotonic();assert other.append(context(),e)['code']=='STORE_UNAVAILABLE'
    assert time.monotonic()-start<0.5
    db.rollback();db.close()
    Path(str(s.path)+'-wal').write_bytes(b'x')
    with pytest.raises(api().StoreUnavailable):s.read(context(),kind='DECISION')
    Path(str(s.path)+'-wal').unlink()
    s.path.rename(private_root/'old.sqlite');s.path.write_bytes(b'bad')
    with pytest.raises(api().StoreUnavailable):s.read(context(),kind='DECISION')

def test_physical_exclusions(private_root,tmp_path):
    with pytest.raises(api().StoreUnavailable):api().EvidenceStore(Path.cwd(),excluded_roots=[Path.cwd()])
    s=store(private_root);assert s.append(context(),envelope())['ok']
    os.link(s.path,private_root/'link.sqlite')
    with pytest.raises(api().StoreUnavailable):s.read(context(),kind='DECISION')

def client(s, *, security=True, peer='testclient'):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from dashboard_security import install_control_security
    assert importlib.util.find_spec('chart_studio.evidence_api'), 'evidence read API is missing'
    from chart_studio.evidence_api import install_evidence_routes
    app=FastAPI()
    if security:install_control_security(app)
    install_evidence_routes(app,store=s)
    return TestClient(app,client=(peer,1234))

RANGE={'account':'titan','fromUtc':'2026-01-01T00:00:00Z','toUtc':'2026-01-03T00:00:00Z'}

def test_identity_account_and_detail_scope(private_root,monkeypatch):
    s=store(private_root);assert s.append(context(),envelope())['ok']
    c=client(s)
    for params,status in [({},422),({'account':'?bad'},422),({'account':'unknown'},400)]:
        response=c.get('/api/chart/v1/decisions',params=params)
        assert response.status_code==status
        assert response.headers['cache-control']=='no-store'
        assert response.json()['detail']['canExecute'] is False
    assert client(s,security=False).get('/api/chart/v1/decisions',params=RANGE).status_code==403
    assert c.get('/api/chart/v1/decisions/event_1',params={'account':'goldm15'}).status_code==404
    response=c.get('/api/chart/v1/decisions/event_1',params={'account':'titan'})
    assert response.json()['latestRevision']==1
    for role in ('read','layout','trade'):
        monkeypatch.setenv('DASHBOARD_PROXY_SECRET','x'*32)
        monkeypatch.setenv('DASHBOARD_PROXY_USERS','{"operator":"'+role+'"}')
        remote=client(s,peer='127.0.0.1')
        assert remote.get('/api/chart/v1/decisions',params=RANGE,headers={'x-dashboard-proxy-secret':'x'*32,'x-dashboard-user':'operator'}).status_code==200
    monkeypatch.setenv('DASHBOARD_CONTROL_TOKEN','token')
    assert client(s,peer='203.0.113.2').get('/api/chart/v1/decisions',params=RANGE,headers={'authorization':'Bearer token'}).status_code==200

def test_cursor_pin_tamper_scope_restart_and_corrections(private_root):
    s=store(private_root)
    for i in range(3):
        e=envelope();e['id']=e['payload']['eventId']=f'event_{i}';assert s.append(context(),e)['ok']
    c=client(s);params={**RANGE,'limit':1}
    first=c.get('/api/chart/v1/decisions',params=params).json()
    cursor=first['nextCursor'];assert cursor
    correction=envelope();correction['id']=correction['payload']['eventId']='event_0'
    correction['dataRevision']=correction['payload']['dataRevision']=2
    correction['supersedes']={'type':'DECISION','id':'event_0','dataRevision':1}
    assert s.append(context(),correction)['ok']
    second=c.get('/api/chart/v1/decisions',params={**params,'cursor':cursor}).json()
    assert second['records'][0]['id']=='event_1'
    for changed in ({'cursor':cursor+'x'},{'cursor':cursor,'account':'goldm15'},{'cursor':cursor,'symbol':'EURUSD'}):
        assert c.get('/api/chart/v1/decisions',params={**params,**changed}).status_code==410
    assert client(s).get('/api/chart/v1/decisions',params={**params,'cursor':cursor}).status_code==410
    assert c.get('/api/chart/v1/decisions/event_0',params={'account':'titan','revision':1}).json()['record']['dataRevision']==1
    assert c.get('/api/chart/v1/decisions/event_0',params={'account':'titan'}).json()['latestRevision']==2

def test_diskfull_rolls_back_record_and_refs(private_root,monkeypatch):
    s=store(private_root);assert s.append(context(),envelope())['ok']
    real=s._connect
    class FullConnection:
        def __init__(self,db):self.db=db
        def __getattr__(self,key):return getattr(self.db,key)
        def executemany(self,*args):raise sqlite3.OperationalError('database or disk is full')
    monkeypatch.setattr(s,'_connect',lambda *a,**kw:FullConnection(real(*a,**kw)))
    assert s.append(context(),envelope(snapshot(),'SNAPSHOT'))['code']=='STORE_UNAVAILABLE'
    with sqlite3.connect(s.path) as db:
        assert db.execute('SELECT COUNT(*) FROM records').fetchone()[0]==1
        assert db.execute('SELECT COUNT(*) FROM refs').fetchone()[0]==0

def test_empty_schema_unconfigured_http_no_files(private_root,monkeypatch):
    c=client(store(private_root))
    assert c.get('/api/chart/v1/decisions',params=RANGE).json()['storeState']=='NOT_INITIALIZED'
    assert list(private_root.iterdir())==[]
    c=client(api().EvidenceStore(None))
    assert c.get('/api/chart/v1/snapshots',params=RANGE).json()['availability']=='NOT_RECORDED'
    s=store(private_root);assert s.append(context(),envelope(snapshot(),'SNAPSHOT'))['code']=='CONFLICT'
    assert s.read(context(),kind='DECISION')['availability']=='NOT_RECORDED'
    with sqlite3.connect(s.path) as db:db.execute('DROP INDEX records_scope_order')
    response=client(s).get('/api/chart/v1/decisions',params=RANGE)
    assert response.status_code==503
    assert response.json()['detail']['code']=='STORE_UNAVAILABLE'

def test_acl_insecure_root_and_reparse(private_root,tmp_path):
    insecure=tmp_path/'open';insecure.mkdir()
    if os.name=='nt':
        subprocess.run(['icacls',str(insecure),'/grant','*S-1-1-0:(OI)(CI)R'],check=True,capture_output=True)
    else:insecure.chmod(0o755)
    with pytest.raises(api().StoreUnavailable):store(insecure)
    link=tmp_path/'junction'
    if os.name=='nt':
        subprocess.run(['cmd','/c','mklink','/J',str(link),str(private_root)],check=True,capture_output=True)
    else:link.symlink_to(private_root,target_is_directory=True)
    with pytest.raises(api().StoreUnavailable):store(link)

def test_loss_saturates_known_accounts_only(private_root):
    s=store(private_root);s._loss['titan']=2**31-1
    e=envelope();e['unknown']='bad'
    assert s.append(context(),e)['lostCount']==2**31-1
    assert s.append(None,e)['lostCount']==0
    assert set(s._loss)=={'titan'}

def test_cursor_expiry_peer_role_and_ranges(private_root):
    s=store(private_root)
    for i in range(2):
        e=envelope();e['id']=e['payload']['eventId']=f'e_{i}';assert s.append(context(),e)['ok']
    c=client(s);p={**RANGE,'limit':1};token=c.get('/api/chart/v1/decisions',params=p).json()['nextCursor']
    c.app.state.evidence_cursors.clock=lambda:time.time()+901
    assert c.get('/api/chart/v1/decisions',params={**p,'cursor':token}).status_code==410
    for change in ({'fromUtc':'2026-01-01T00:00:00'},{'toUtc':'2026-03-01T00:00:00Z'},{'limit':201},{'strategyId':'bad space'}):
        assert c.get('/api/chart/v1/decisions',params={**RANGE,**change}).status_code==422

@pytest.fixture(autouse=True)
def forbid_all_mt5_methods(monkeypatch):
    import MetaTrader5 as mt5
    def forbidden(*args,**kwargs):pytest.fail('ALL MT5 calls forbidden in evidence tests')
    for name in dir(mt5):
        if not name.startswith('_') and callable(getattr(mt5,name)):
            monkeypatch.setattr(mt5,name,forbidden)

def test_actual_app_evidence_installer_disabled(monkeypatch):
    monkeypatch.delenv('CHART_STUDIO_EVIDENCE_ROOT',raising=False)
    import app
    from fastapi.testclient import TestClient
    c=TestClient(app.app)
    response=c.get('/api/chart/v1/decisions',params=RANGE)
    assert response.status_code==200
    assert response.json()['availability']=='NOT_RECORDED'
    assert c.get('/api/chart/v1/capabilities').json()['features']['immutableEvidenceReads'] is True

def test_synthetic_benchmark_1000_events_100_record_pages(private_root,monkeypatch):
    import json
    s=store(private_root)
    wall=time.monotonic();append_ms=[];cold=[];warm=[];peak=0
    real=s._connect
    class MeasuredConnection:
        def __init__(self,db):self.db=db
        def __getattr__(self,key):return getattr(self.db,key)
        def commit(self):
            nonlocal peak
            peak=max(peak,sum(p.stat().st_size for p in private_root.iterdir() if p.is_file()))
            self.db.commit()
    monkeypatch.setattr(s,'_connect',lambda *a,**kw:MeasuredConnection(real(*a,**kw)))
    for i in range(1000):
        e=envelope();e['id']=e['payload']['eventId']=f'bench_{i:04}'
        t=time.monotonic();result=s.append(context(),e);append_ms.append((time.monotonic()-t)*1000)
        assert result['ok'],result
        peak=max(peak,sum(p.stat().st_size for p in private_root.iterdir() if p.is_file()))
    for timings in (cold,warm):
        last=None;pin=None
        reader=store(private_root) if timings is cold else s
        while True:
            t=time.monotonic();page=reader.read(context(),kind='DECISION',limit=100,pinned=pin,last=last)
            timings.append((time.monotonic()-t)*1000)
            assert len(page['records'])<=100
            pin=page['pinnedMaxSeq'];last=page['last']
            if not page['hasMore']:break
    elapsed=time.monotonic()-wall
    if os.name=='nt':
        import ctypes
        from ctypes import wintypes as w
        class Counters(ctypes.Structure):
            _fields_=[('cb',w.DWORD),('faults',w.DWORD)]+[(name,ctypes.c_size_t) for name in ('peakWorkingSet','workingSet','quotaPeakPaged','quotaPaged','quotaPeakNonPaged','quotaNonPaged','pagefile','peakPagefile','private')]
        kernel=ctypes.WinDLL('kernel32');kernel.GetCurrentProcess.restype=w.HANDLE
        psapi=ctypes.WinDLL('psapi');psapi.GetProcessMemoryInfo.argtypes=[w.HANDLE,ctypes.POINTER(Counters),w.DWORD]
        counters=Counters();counters.cb=ctypes.sizeof(counters)
        assert psapi.GetProcessMemoryInfo(kernel.GetCurrentProcess(),ctypes.byref(counters),counters.cb)
        memory=counters.peakWorkingSet
    else:
        import resource
        memory=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss*1024
    def percentiles(values):
        ordered=sorted(values)
        return {f'p{p}Ms':ordered[min(len(ordered)-1,int(len(ordered)*p/100))] for p in (50,95,99)}
    result={'syntheticOnly':True,'productionLatencyClaim':False,'events':1000,'pageRecords':100,
            'coldDefinition':'first read pass with fresh store; OS cache not flushed',
            'warmDefinition':'second read pass; every request still opens a fresh SQLite connection',
            'memoryMeasurement':'whole-process lifetime OS peak working set, not incremental evidence allocations',
            'cold':percentiles(cold),'warm':percentiles(warm),'append':percentiles(append_ms),
            'wallSeconds':elapsed,'dbJournalPeakBytes':peak,'peakProcessWorkingSetBytes':memory,'platform':os.name}
    destination=Path('output/platform');destination.mkdir(parents=True,exist_ok=True)
    (destination/'evidence-synthetic-benchmark.json').write_text(json.dumps(result,indent=2))
    assert elapsed<30,result

def test_explicit_db_and_partial_configuration(private_root,monkeypatch):
    from fastapi import FastAPI
    from chart_studio.evidence_api import install_evidence_routes
    monkeypatch.setenv('CHART_STUDIO_EVIDENCE_ROOT',str(private_root))
    monkeypatch.delenv('CHART_STUDIO_EVIDENCE_DB',raising=False)
    app=FastAPI();install_evidence_routes(app)
    assert app.state.evidence_store.root is None
    assert list(private_root.iterdir())==[]
    for bad in (private_root/'sub'/'data.sqlite',private_root/'data.db',private_root.parent/'else.sqlite'):
        with pytest.raises(api().StoreUnavailable):api().EvidenceStore(private_root,db_path=bad)

def test_cursor_generation_replacement(private_root):
    s=store(private_root)
    for i in range(2):
        e=envelope();e['id']=e['payload']['eventId']=f'e_{i}';assert s.append(context(),e)['ok']
    c=client(s);p={**RANGE,'limit':1};token=c.get('/api/chart/v1/decisions',params=p).json()['nextCursor']
    import uuid
    with sqlite3.connect(s.path) as db:db.execute('UPDATE metadata SET generation=?',(str(uuid.uuid4()),))
    assert c.get('/api/chart/v1/decisions',params={**p,'cursor':token}).status_code==410

def test_two_process_transactional_capacity(private_root):
    import concurrent.futures
    import sys
    s=store(private_root)
    assert s.append(context(),envelope(snapshot(),'SNAPSHOT'))['code']=='CONFLICT' # initialize empty
    script='''
import json,sys
from pathlib import Path
sys.path.insert(0,'tests')
from test_chart_studio_evidence_models import context,envelope
from chart_studio.evidence_store import EvidenceStore
s=EvidenceStore(sys.argv[1],db_path=Path(sys.argv[1])/'evidence.sqlite');s.record_limit=1
e=envelope();e['id']=e['payload']['eventId']=sys.argv[2]
print(json.dumps(s.append(context(),e)))
'''
    def run(name):
        result=subprocess.run([sys.executable,'-c',script,str(private_root),name],text=True,capture_output=True,check=True)
        import json
        return json.loads(result.stdout)['code']
    with concurrent.futures.ThreadPoolExecutor(2) as pool:
        codes=list(pool.map(run,['process_a','process_b']))
    assert sorted(codes)==['APPENDED','RECORDING_CAPACITY']
    with sqlite3.connect(s.path) as db:assert db.execute('SELECT COUNT(*) FROM records').fetchone()[0]==1

def test_missing_reference_integrity_fails_closed(private_root):
    s=store(private_root);assert s.append(context(),envelope())['ok']
    assert s.append(context(),envelope(snapshot(),'SNAPSHOT'))['ok']
    with sqlite3.connect(s.path) as db:db.execute('DELETE FROM refs')
    with pytest.raises(api().StoreUnavailable):s.read(context(),kind='SNAPSHOT')

def test_cursor_actual_role_peer_channel_bindings(private_root,monkeypatch):
    from fastapi.testclient import TestClient
    s=store(private_root)
    for i in range(2):
        e=envelope();e['id']=e['payload']['eventId']=f'e_{i}';assert s.append(context(),e)['ok']
    c=client(s,peer='127.0.0.1');p={**RANGE,'limit':1}
    token=c.get('/api/chart/v1/decisions',params=p).json()['nextCursor']
    different_peer=TestClient(c.app,client=('127.0.0.2',111))
    assert different_peer.get('/api/chart/v1/decisions',params={**p,'cursor':token}).status_code==410
    monkeypatch.setenv('DASHBOARD_PROXY_SECRET','x'*32)
    monkeypatch.setenv('DASHBOARD_PROXY_USERS','{"operator":"read"}')
    headers={'x-dashboard-proxy-secret':'x'*32,'x-dashboard-user':'operator'}
    assert c.get('/api/chart/v1/decisions',params={**p,'cursor':token},headers=headers).status_code==410
    proxy_token=c.get('/api/chart/v1/decisions',params=p,headers=headers).json()['nextCursor']
    monkeypatch.setenv('DASHBOARD_PROXY_USERS','{"operator":"trade"}')
    assert c.get('/api/chart/v1/decisions',params={**p,'cursor':proxy_token},headers=headers).status_code==410

def test_page_two_mib_bound(private_root):
    from chart_studio.evidence_models import canonical_bytes
    s=store(private_root)
    for i in range(50):
        e=envelope();e['id']=e['payload']['eventId']=f'large_{i:03}'
        e['payload']['featureVector']=[dict(id=f'f{j:03}'+'x'*60,value=1,unit='u'*64,timeframe='M5') for j in range(128)]
        e['payload']['predicates']=[dict(ruleId=f'r{j:03}'+'x'*60,observedValue=1,comparator='GT',threshold=0,outcome='PASS',reasonCode='r'*64) for j in range(128)]
        assert s.append(context(),e)['ok']
    page=s.read(context(),kind='DECISION',limit=200)
    assert 0<len(page['records'])<50
    assert sum(len(canonical_bytes(e)) for e in page['records'])<=2*1024*1024
    assert page['hasMore']
    next_page=s.read(context(),kind='DECISION',limit=200,pinned=page['pinnedMaxSeq'],last=page['last'])
    assert len(page['records'])+len(next_page['records'])==50

def test_errors_keep_known_loss_and_method_safety(private_root):
    s=store(private_root);e=envelope();e['bad']='bad';assert not s.append(context(),e)['ok']
    c=client(s)
    response=c.get('/api/chart/v1/decisions',params={**RANGE,'limit':201})
    assert response.json()['detail']['gaps']['knownLossSinceStart']==1
    response=c.post('/api/chart/v1/decisions',params=RANGE,json=envelope())
    assert response.status_code==405
    assert response.json()['detail']['canExecute'] is False
    assert response.headers['cache-control']=='no-store'

def test_other_process_busy_budget(private_root):
    import sys
    s=store(private_root);assert s.append(context(),envelope())['ok']
    script="import sqlite3,sys,time; db=sqlite3.connect(sys.argv[1]);db.execute('BEGIN IMMEDIATE');print('READY',flush=True);time.sleep(1);db.rollback();db.close()"
    process=subprocess.Popen([sys.executable,'-c',script,str(s.path)],stdout=subprocess.PIPE,text=True)
    try:
        assert process.stdout.readline().strip()=='READY'
        e=envelope();e['id']=e['payload']['eventId']='other_event'
        started=time.monotonic();assert s.append(context(),e)['code']=='STORE_UNAVAILABLE'
        assert time.monotonic()-started<=0.5
    finally:process.wait(timeout=5)
    assert s.append(context(),e)['code']=='APPENDED'

def test_public_schema_and_empty_account_provenance(private_root):
    c=client(store(private_root))
    response=c.get('/api/chart/v1/decisions',params=RANGE)
    assert response.json()['schemaVersion']==1
    assert response.json()['accountId']=='titan'
    assert response.json()['terminalIdentityHash']==context().terminal_identity_hash
    assert c.get('/api/chart/v1/decisions').json()['schemaVersion']==1

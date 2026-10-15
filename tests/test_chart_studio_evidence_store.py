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
        # Replace the inherited temp-directory ACL wholesale. Some hosted
        # Windows runners add an explicit runner/service trustee that remains
        # after icacls /inheritance:r and correctly makes the store fail closed.
        script = r'''$p=$env:CHART_STUDIO_PRIVATE_ROOT;$sids=@($env:CHART_STUDIO_TEST_SID,'S-1-5-18','S-1-5-32-544');$acl=[System.Security.AccessControl.DirectorySecurity]::new();$acl.SetAccessRuleProtection($true,$false);foreach($sid in $sids){$id=[System.Security.Principal.SecurityIdentifier]::new($sid);$rule=[System.Security.AccessControl.FileSystemAccessRule]::new($id,'FullControl','ContainerInherit,ObjectInherit','None','Allow');$acl.AddAccessRule($rule)};([System.IO.DirectoryInfo]::new($p)).SetAccessControl($acl)'''
        env={**os.environ,'CHART_STUDIO_PRIVATE_ROOT':str(root),'CHART_STUDIO_TEST_SID':user}
        subprocess.run(['powershell','-NoProfile','-NonInteractive','-Command',script],check=True,env=env)
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

def test_repeated_mt5_deal_with_new_capture_time_keeps_first_immutable_record(private_root):
    capture=importlib.import_module('chart_studio.broker_lifecycle_capture')
    row={'account':'titan','login':'53087839','server':'ICMarketsEU-Demo','source':'MT5_VERIFIED',
         'canExecute':False,'symbol':'XAUUSD','ticket':'8712345','orderTicket':'8712344',
         'positionIdentifier':'8712300','type':'BUY','status':'EXECUTED','entry':'IN',
         'fillTime':{'rawBrokerEpochMs':1792098900000,'utcEpochMs':1792088100000,
                     'brokerUtcOffsetSeconds':10800,'offsetSource':'ACCOUNT_CONFIG'},
         'price':'4153.92','volume':'0.1','commission':'-0.25','fee':'0','swap':'0','profit':'-1.35'}
    s=store(private_root)
    first=capture.capture_deals(s,context(),[row],'2026-10-15T18:16:00Z')
    redelivery=capture.capture_deals(s,context(),[row],'2026-10-15T18:17:00Z')
    assert first['code']=='OK' and first['appended']==1 and first['rejected']==0
    assert redelivery['code']=='OK' and redelivery['duplicates']==1 and redelivery['rejected']==0
    assert s.gaps('titan')['knownLossSinceStart']==0
    changed=capture.capture_deals(s,context(),[{**row,'price':'4154.00'}],'2026-10-15T18:18:00Z')
    assert changed['code']=='CAPTURE_INCOMPLETE' and changed['rejected']==1 and changed['storeLostCount']==0, changed
    saved=s.read(context(),kind='LIFECYCLE',record_id='mt5_deal_8712345')['records']
    assert len(saved)==1
    assert saved[0]['payload']['capturedAtUtc']=='2026-10-15T18:16:00.000000Z'
    assert saved[0]['payload']['price']=='4153.92'

def test_trusted_append_skips_redundant_full_validation(private_root,monkeypatch):
    s=store(private_root);calls=0;health_checks=0;verify=s._verify_contents;quick_check=s._quick_check
    def counted(db):
        nonlocal calls
        calls+=1
        return verify(db)
    def checked(db):
        nonlocal health_checks
        health_checks+=1
        return quick_check(db)
    monkeypatch.setattr(s,'_verify_contents',counted)
    monkeypatch.setattr(s,'_quick_check',checked)
    first=envelope();second=envelope();second['id']=second['payload']['eventId']='trusted_second'
    assert s.append(context(),first)['ok']
    assert s.append(context(),second)['ok']
    assert calls==1
    assert health_checks==1
    with sqlite3.connect(s.path) as db:db.execute("UPDATE records SET sha256='bad'")
    third=envelope();third['id']=third['payload']['eventId']='tamper_probe'
    assert s.append(context(),third)['code']=='STORE_UNAVAILABLE'
    assert health_checks==2

def test_references_rollback_and_loss_lifetime(private_root):
    s=store(private_root);snap=envelope(snapshot(),'SNAPSHOT')
    assert s.append(context(),snap)['code']=='CONFLICT'
    assert s.read(context(),kind='SNAPSHOT')['records']==[]
    assert s.append(context(),envelope())['ok']
    assert s.append(context(),snap)['ok']
    assert s.read(context(),kind='DECISION')['gaps']['knownLossSinceStart']==1
    assert store(private_root).read(context(),kind='DECISION')['gaps']['knownLossSinceStart']==0

@pytest.mark.parametrize('bad_value', [sqlite3.Binary(b'bad'), 'bad'])
def test_append_snapshot_corrupt_reference_time_is_unavailable(private_root, bad_value):
    s = store(private_root)
    assert s.append(context(), envelope())['code'] == 'APPENDED'
    with sqlite3.connect(s.path) as db:
        db.execute('UPDATE records SET event_us=? WHERE kind=?', (bad_value, 'DECISION'))

    result = s.append(context(), envelope(snapshot(), 'SNAPSHOT'))
    assert result == {'ok': False, 'code': 'STORE_UNAVAILABLE', 'recordRef': None,
                      'gapObserved': True, 'lostCount': 1}
    with sqlite3.connect(s.path) as db:
        assert db.execute('SELECT COUNT(*) FROM records').fetchone()[0] == 1
        assert db.execute('SELECT COUNT(*) FROM refs').fetchone()[0] == 0


@pytest.mark.parametrize('column,bad_value', [
    ('revision', sqlite3.Binary(b'bad')),
    ('revision', 'bad'),
    ('event_us', sqlite3.Binary(b'bad')),
    ('event_us', 'bad'),
])
def test_append_correction_corrupt_latest_metadata_is_unavailable(private_root, column, bad_value):
    s = store(private_root)
    assert s.append(context(), envelope())['code'] == 'APPENDED'
    with sqlite3.connect(s.path) as db:
        db.execute(f'UPDATE records SET {column}=? WHERE kind=?', (bad_value, 'DECISION'))

    correction = envelope()
    correction['dataRevision'] = correction['payload']['dataRevision'] = 2
    correction['supersedes'] = {'type': 'DECISION', 'id': correction['id'], 'dataRevision': 1}
    result = s.append(context(), correction)
    assert result == {'ok': False, 'code': 'STORE_UNAVAILABLE', 'recordRef': None,
                      'gapObserved': True, 'lostCount': 1}
    with sqlite3.connect(s.path) as db:
        assert db.execute('SELECT COUNT(*) FROM records').fetchone()[0] == 1
        assert db.execute('SELECT COUNT(*) FROM refs').fetchone()[0] == 0


@pytest.mark.parametrize('idempotent', [False, True])
def test_append_verifies_unrelated_existing_records(private_root, idempotent):
    s = store(private_root)
    first = envelope()
    assert s.append(context(), first)['code'] == 'APPENDED'
    second = envelope()
    second['id'] = second['payload']['eventId'] = 'event_2'
    assert s.append(context(), second)['code'] == 'APPENDED'
    with sqlite3.connect(s.path) as db:
        db.execute("UPDATE records SET sha256='bad' WHERE id=?", (first['id'],))

    candidate = second if idempotent else envelope()
    if not idempotent:
        candidate['id'] = candidate['payload']['eventId'] = 'event_3'
    result = s.append(context(), candidate)
    assert result == {'ok': False, 'code': 'STORE_UNAVAILABLE', 'recordRef': None,
                      'gapObserved': True, 'lostCount': 1}
    with sqlite3.connect(s.path) as db:
        assert db.execute('SELECT COUNT(*) FROM records').fetchone()[0] == 2
        assert db.execute('SELECT COUNT(*) FROM refs').fetchone()[0] == 0


def test_append_verifies_unrelated_reference_edges(private_root):
    s = store(private_root)
    assert s.append(context(), envelope())['code'] == 'APPENDED'
    assert s.append(context(), envelope(snapshot(), 'SNAPSHOT'))['code'] == 'APPENDED'
    with sqlite3.connect(s.path) as db:
        db.execute('DELETE FROM refs')

    candidate = envelope()
    candidate['id'] = candidate['payload']['eventId'] = 'event_2'
    result = s.append(context(), candidate)
    assert result['code'] == 'STORE_UNAVAILABLE'
    assert result['lostCount'] == 1
    with sqlite3.connect(s.path) as db:
        assert db.execute('SELECT COUNT(*) FROM records').fetchone()[0] == 2
        assert db.execute('SELECT COUNT(*) FROM refs').fetchone()[0] == 0


def test_append_detects_direct_byte_edit_to_unrelated_hash(private_root):
    s = store(private_root)
    assert s.append(context(), envelope())['code'] == 'APPENDED'
    with sqlite3.connect(s.path) as db:
        original_hash = db.execute('SELECT sha256 FROM records WHERE id=?', ('event_1',)).fetchone()[0]
    before = s.path.stat()
    with s.path.open('r+b') as handle:
        offset = handle.read().find(original_hash.encode('ascii'))
        assert offset >= 0
        handle.seek(offset)
        handle.write(b'0' if original_hash[0] != '0' else b'1')
        handle.flush()
        os.fsync(handle.fileno())
    assert s.path.stat().st_mtime_ns != before.st_mtime_ns
    with sqlite3.connect(s.path) as db:
        assert db.execute('SELECT sha256 FROM records WHERE id=?', ('event_1',)).fetchone()[0] != original_hash

    candidate = envelope()
    candidate['id'] = candidate['payload']['eventId'] = 'event_2'
    result = s.append(context(), candidate)
    assert result == {'ok': False, 'code': 'STORE_UNAVAILABLE', 'recordRef': None,
                      'gapObserved': True, 'lostCount': 1}
    with sqlite3.connect(s.path) as db:
        assert db.execute('SELECT COUNT(*) FROM records').fetchone()[0] == 1
        assert db.execute('SELECT COUNT(*) FROM refs').fetchone()[0] == 0


def test_append_detects_external_commit_after_rollback(private_root):
    s = store(private_root)
    assert s.append(context(), envelope())['code'] == 'APPENDED'
    missing = envelope(snapshot(), 'SNAPSHOT')
    missing['payload']['decisionEventIds'][0]['id'] = 'missing'
    assert s.append(context(), missing)['code'] == 'CONFLICT'
    with sqlite3.connect(s.path) as db:
        db.execute("UPDATE records SET sha256='bad' WHERE kind='DECISION'")

    candidate = envelope()
    candidate['id'] = candidate['payload']['eventId'] = 'event_2'
    result = s.append(context(), candidate)
    assert result['code'] == 'STORE_UNAVAILABLE'
    assert result['lostCount'] == 2
    with sqlite3.connect(s.path) as db:
        assert db.execute('SELECT COUNT(*) FROM records').fetchone()[0] == 1


def test_append_accepts_verified_external_store_commit(private_root):
    s = store(private_root)
    assert s.append(context(), envelope())['code'] == 'APPENDED'
    other = store(private_root)
    second = envelope()
    second['id'] = second['payload']['eventId'] = 'event_2'
    assert other.append(context(), second)['code'] == 'APPENDED'
    third = envelope()
    third['id'] = third['payload']['eventId'] = 'event_3'
    assert s.append(context(), third)['code'] == 'APPENDED'
    assert len(s.read(context(), kind='DECISION')['records']) == 3


def _dangling_symlink(path):
    try:
        os.symlink(path.with_name('missing-target'), path)
    except (OSError, NotImplementedError) as exc:
        if os.name != 'nt':
            pytest.skip(f'File symlinks unavailable: {exc}')
        target = path.with_name(path.name + '-target')
        target.mkdir()
        subprocess.run(['cmd', '/c', 'mklink', '/J', str(path), str(target)],
                       check=True, capture_output=True)
        target.rmdir()
    assert os.path.lexists(path) and not path.exists()


def test_dangling_store_path_fails_closed(private_root, monkeypatch):
    s = store(private_root)
    _dangling_symlink(s.path)
    with pytest.raises(api().StoreUnavailable):
        s.read(context(), kind='DECISION')
    response = client(s).get('/api/chart/v1/decisions', params=RANGE)
    assert response.status_code == 503
    assert response.json()['detail']['code'] == 'STORE_UNAVAILABLE'
    with pytest.raises(api().StoreUnavailable):
        store(private_root)
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from chart_studio.evidence_api import install_evidence_routes
    from dashboard_security import install_control_security
    monkeypatch.setenv('CHART_STUDIO_EVIDENCE_ROOT', str(private_root))
    monkeypatch.setenv('CHART_STUDIO_EVIDENCE_DB', str(s.path))
    app = FastAPI()
    install_control_security(app)
    install_evidence_routes(app)
    response = TestClient(app).get('/api/chart/v1/decisions', params=RANGE)
    assert response.status_code == 503
    assert response.json()['detail']['code'] == 'STORE_UNAVAILABLE'


@pytest.mark.parametrize('suffix', ['-wal', '-shm', '-journal'])
def test_dangling_store_sidecar_fails_closed(private_root, suffix):
    s = store(private_root)
    assert s.append(context(), envelope())['code'] == 'APPENDED'
    _dangling_symlink(Path(str(s.path) + suffix))
    with pytest.raises(api().StoreUnavailable):
        s.read(context(), kind='DECISION')


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
    # Windows keeps the monitored SQLite file open, so release it to exercise replacement detection.
    s._close_monitor()
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
    reader=store(private_root)
    for timings in (cold,warm):
        last=None;pin=None
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
            'warmDefinition':'second read pass reuses the verified store object; every request opens a fresh SQLite connection',
            'memoryMeasurement':'whole-process lifetime OS peak working set, not incremental evidence allocations',
            'cold':percentiles(cold),'warm':percentiles(warm),'append':percentiles(append_ms),
            'wallSeconds':elapsed,'dbJournalPeakBytes':peak,'peakProcessWorkingSetBytes':memory,'platform':os.name}
    destination=Path('output/platform');destination.mkdir(parents=True,exist_ok=True)
    (destination/'evidence-synthetic-benchmark.json').write_text(json.dumps(result,indent=2))
    # Hosted Windows runner load varies sharply; keep only a hang guard there.
    # Retain the tighter POSIX budget and report measured percentiles rather
    # than treating shared-runner latency as a production guarantee.
    budget=600 if os.name=='nt' else 30
    assert elapsed<budget,result

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
    s.record_limit=1
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
    # Under hosted Windows I/O contention, the losing process may exhaust its
    # bounded busy budget before it can observe the committed capacity row.
    assert codes.count('APPENDED')==1
    assert all(code in {'APPENDED','RECORDING_CAPACITY','STORE_UNAVAILABLE'} for code in codes)
    with sqlite3.connect(s.path) as db:assert db.execute('SELECT COUNT(*) FROM records').fetchone()[0]==1
    retry=envelope();retry['id']=retry['payload']['eventId']='capacity_retry'
    assert s.append(context(),retry)['code']=='RECORDING_CAPACITY'

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
        # The provider deadline is 450 ms; leave 150 ms for Windows CI thread
        # scheduling so host contention does not masquerade as a lock timeout.
        assert time.monotonic()-started<=0.65
    finally:process.wait(timeout=5)
    assert s.append(context(),e)['code']=='APPENDED'

def test_public_schema_and_empty_account_provenance(private_root):
    c=client(store(private_root))
    response=c.get('/api/chart/v1/decisions',params=RANGE)
    assert response.json()['schemaVersion']==1
    assert response.json()['accountId']=='titan'
    assert response.json()['terminalIdentityHash']==context().terminal_identity_hash
    assert c.get('/api/chart/v1/decisions').json()['schemaVersion']==1

@pytest.mark.parametrize('column,value',[('event_us',0),('symbol','OTHER'),('account','goldm15'),('terminal','b'*64),('kind','LIFECYCLE'),('id','hidden_id'),('revision',9),('strategy','OTHER'),('position_id','9')])
@pytest.mark.parametrize('warm',[False,True])
def test_hidden_index_metadata_corruption_503(private_root,column,value,warm):
    s=store(private_root);assert s.append(context(),envelope())['ok']
    c=client(s)
    if warm:assert c.get('/api/chart/v1/decisions',params=RANGE).status_code==200
    with sqlite3.connect(s.path) as db:db.execute('UPDATE records SET '+column+'=?',(value,))
    response=c.get('/api/chart/v1/decisions',params={**RANGE,'symbol':'XAUUSD','strategyId':'test_strategy'})
    assert response.status_code==503,response.text
    assert response.json()['detail']['code']=='STORE_UNAVAILABLE'

@pytest.mark.parametrize('damage',['hash','provenance','refs'])
@pytest.mark.parametrize('warm',[False,True])
def test_excluded_row_corruption_503(private_root,damage,warm):
    from chart_studio.evidence_models import canonical_bytes
    import json
    s=store(private_root);assert s.append(context(),envelope())['ok']
    assert s.append(context(),envelope(snapshot(),'SNAPSHOT'))['ok']
    c=client(s)
    if warm:assert c.get('/api/chart/v1/decisions',params=RANGE).status_code==200
    with sqlite3.connect(s.path) as db:
        if damage=='hash':db.execute("UPDATE records SET sha256='bad' WHERE kind='DECISION'")
        elif damage=='provenance':
            raw=db.execute("SELECT canonical_json FROM records WHERE kind='DECISION'").fetchone()[0]
            record=json.loads(raw);record['provenance']='RECONSTRUCTED';record['payload']['dataProvenance']='reconstructed'
            db.execute("UPDATE records SET canonical_json=? WHERE kind='DECISION'",(canonical_bytes(record),))
        else:db.execute('DELETE FROM refs')
    # Neither the corrupted decision nor the snapshot is selected by this range.
    response=c.get('/api/chart/v1/decisions',params={**RANGE,'fromUtc':'2026-01-01T00:00:00Z','toUtc':'2026-01-01T01:00:00Z'})
    assert response.status_code==503,response.text
    # A fresh process/store must also fail rather than trusting the former cache.
    assert client(store(private_root)).get('/api/chart/v1/decisions',params={**RANGE,'symbol':'EURUSD'}).status_code==503

def test_availability_is_validated_page_provenance(private_root):
    s=store(private_root)
    assert s.append(context(),envelope())['ok']
    e=envelope();e['id']=e['payload']['eventId']='reconstructed_other'
    e['provenance']='RECONSTRUCTED';e['payload']['dataProvenance']='reconstructed';e['payload']['symbol']='OTHER'
    assert s.append(context(),e)['ok']
    c=client(s)
    assert c.get('/api/chart/v1/decisions',params={**RANGE,'symbol':'EURUSD'}).json()['availability']=='NOT_RECORDED'
    assert c.get('/api/chart/v1/decisions',params={**RANGE,'symbol':'XAUUSD'}).json()['availability']=='RECORDED'
    assert c.get('/api/chart/v1/decisions',params={**RANGE,'symbol':'OTHER'}).json()['availability']=='RECONSTRUCTED'
    assert c.get('/api/chart/v1/decisions',params=RANGE).json()['availability']=='MIXED'

def test_cached_reference_dependency_time_change_503(private_root):
    import hashlib
    from chart_studio.evidence_models import validate_envelope,canonical_bytes,utc_microseconds
    s=store(private_root);assert s.append(context(),envelope())['ok']
    assert s.append(context(),envelope(snapshot(),'SNAPSHOT'))['ok']
    c=client(s);assert c.get('/api/chart/v1/decisions',params=RANGE).status_code==200
    e=envelope()
    e['payload']['decisionTimeUtc']=e['payload']['capturedAtUtc']='2026-01-04T00:00:00Z'
    normalized=validate_envelope(e,context=context());raw=canonical_bytes(normalized)
    with sqlite3.connect(s.path) as db:
        db.execute("UPDATE records SET canonical_json=?,sha256=?,event_us=? WHERE kind='DECISION'",(raw,hashlib.sha256(raw).hexdigest(),utc_microseconds(e['payload']['decisionTimeUtc'])))
    # Changed target is itself a valid model with a matching hash/index, but
    # the existing snapshot can no longer reference that later decision.
    assert c.get('/api/chart/v1/decisions',params=RANGE).status_code==503

def test_malformed_generation_type_is_explicit_unavailable(private_root):
    s=store(private_root);assert s.append(context(),envelope())['ok']
    with sqlite3.connect(s.path) as db:db.execute('UPDATE metadata SET generation=?',(sqlite3.Binary(b'not-a-uuid'),))
    response=client(s).get('/api/chart/v1/decisions',params=RANGE)
    assert response.status_code==503
    assert response.json()['detail']['code']=='STORE_UNAVAILABLE'

"""Opt-in bounded file reader for private MT5 evidence spool files.

This module only reads local files and appends validated evidence. It never
connects to MT5 and has no HTTP ingestion or broker mutation path.
"""
import asyncio
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import threading
import time
from datetime import datetime, timezone

from chart_studio.evidence_spool import MAX_LINE_BYTES, SpoolImporter
from chart_studio.evidence_store import StoreUnavailable, _physical, _private

MAX_SEGMENT_BYTES = 8 * 1024 * 1024
MAX_RECORDS_PER_POLL = 50
_READY = re.compile(r'([A-Za-z0-9_-]{1,64})\.([1-9][0-9]*)-([1-9][0-9]*)\.ready\.ndjson\Z')
_TEMP_SEGMENT = re.compile(r'([A-Za-z0-9_-]{1,64})\.([1-9][0-9]*)\.tmp\.ndjson\Z')
_TEMP_SCAN_INTERVAL_SECONDS = 60.0
_FILE_INDEX_REFRESH_SECONDS = 10.0


class FileIdentityChanged(Exception):
    pass


class SegmentInvalid(Exception):
    pass


class SpoolFileConsumer:
    """Tail active files and consume closed ready segments in sequence order."""

    def __init__(self, store, spool_root, *, producers, excluded_roots=(), records_per_poll=MAX_RECORDS_PER_POLL):
        if not store.root or not store.path or not isinstance(producers, dict) or not producers:
            raise ValueError('evidence store and producers are required')
        self.store = store
        self.root = Path(os.path.abspath(spool_root))
        self.excluded_roots = [Path(p).resolve() for p in excluded_roots]
        self.records_per_poll = records_per_poll
        self._temporary_scan_at = 0.0
        self._temporary_backlog = {}
        self._file_index_at = 0.0
        self._ready_files = {}
        self._archived_files = {}
        self._invalid_ready_producers = set()
        self._reported_store_loss = {}
        self._reported_gap = {}
        if type(records_per_poll) is not int or not 1 <= records_per_poll <= MAX_RECORDS_PER_POLL:
            raise ValueError('invalid record batch')
        self._verify_root()
        self.archive = self.root / 'archive'
        if not self.archive.is_dir():
            raise ValueError('private archive directory must pre-exist')
        _physical(self.archive); _private(self.archive, True)
        self.producers = {}
        self._thread_locks = {}
        for account, producer_id in producers.items():
            importer = SpoolImporter(store, account_id=account, producer_id=producer_id)
            if producer_id in self.producers:
                raise ValueError('duplicate producer')
            self.producers[producer_id] = (account, importer)
            self._thread_locks[producer_id] = threading.Lock()
            self._reported_store_loss[producer_id] = 0
            self._reported_gap[producer_id] = False

    def _verify_root(self):
        try:
            root_identity = _physical(self.root)
            if not self.root.is_dir(): raise StoreUnavailable()
            _private(self.root, True)
            resolved = self.root.resolve()
            if any(resolved == path or resolved.is_relative_to(path) for path in self.excluded_roots):
                raise StoreUnavailable()
            if any((parent / '.git').exists() for parent in [resolved, *resolved.parents]):
                raise StoreUnavailable()
            # Reject every known checkout/worktree, including sibling worktrees.
            for parent in [Path.cwd(), *Path.cwd().parents]:
                if (parent / '.git').exists():
                    output = subprocess.check_output(['git', '-C', str(parent), 'worktree', 'list', '--porcelain'], text=True)
                    for line in output.splitlines():
                        if line.startswith('worktree '):
                            checkout = Path(line[9:]).resolve()
                            if resolved == checkout or resolved.is_relative_to(checkout):
                                raise StoreUnavailable()
                    break
            if _physical(self.root) != root_identity: raise StoreUnavailable()
        except (OSError, ValueError, subprocess.SubprocessError, StoreUnavailable) as exc:
            raise ValueError('unsafe spool root') from exc

    @contextmanager
    def producer_lock(self, producer_id):
        if producer_id not in self.producers:
            raise ValueError('unknown producer')
        local = self._thread_locks[producer_id]
        if not local.acquire(blocking=False):
            yield False
            return
        path = self.root / ('.' + producer_id + '.consumer.lock')
        stream = None
        acquired = False
        try:
            flags = os.O_CREAT | os.O_RDWR
            if hasattr(os, 'O_NOFOLLOW'): flags |= os.O_NOFOLLOW
            fd = os.open(path, flags, 0o600)
            stream = os.fdopen(fd, 'r+b', buffering=0)
            if os.fstat(fd).st_size == 0:
                stream.write(b'\0'); stream.flush()
            if os.name == 'nt':
                import msvcrt
                stream.seek(0); msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            _physical(path); _private(path, False)
            acquired = True
            yield True
        except (OSError, StoreUnavailable):
            yield False
        finally:
            if stream:
                try:
                    if acquired:
                        if os.name == 'nt':
                            import msvcrt
                            stream.seek(0); msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)
                        else:
                            import fcntl
                            fcntl.flock(stream.fileno(), fcntl.LOCK_UN)
                except OSError: pass
                stream.close()
            local.release()

    def _cursor_path(self, account, producer):
        return self.store.root / ('.spool-offset-' + account + '-' + producer + '.json')

    def _load_cursor(self, account, importer):
        path = self._cursor_path(account, importer.producer_id)
        if not os.path.lexists(path): return None
        try:
            _physical(path); _private(path, False)
            if path.stat().st_size > 4096: raise ValueError()
            data = json.loads(path.read_text(encoding='utf-8'))
            expected = {'schemaVersion','accountId','terminalIdentityHash','producerId','fileName','fileState','device','inode','offset','prefixDigest','firstSequence','lastSequence'}
            if type(data) is not dict or set(data) != expected or data['schemaVersion'] != 1 or type(data['schemaVersion']) is not int:
                raise ValueError()
            if (data['accountId'] != importer.context.account_id or data['terminalIdentityHash'] != importer.context.terminal_identity_hash or data['producerId'] != importer.producer_id or
                    not isinstance(data['fileName'], str) or Path(data['fileName']).name != data['fileName'] or data['fileState'] not in ('active','ready','archive') or
                    type(data['device']) is not int or type(data['inode']) is not int or type(data['offset']) is not int or data['offset'] < 0 or
                    not isinstance(data['prefixDigest'],str) or not re.fullmatch('[0-9a-f]{64}',data['prefixDigest']) or
                    data['firstSequence'] is not None and (type(data['firstSequence']) is not int or data['firstSequence'] < 1) or
                    data['lastSequence'] is not None and (type(data['lastSequence']) is not int or data['lastSequence'] < 1)):
                raise ValueError()
            return data
        except (OSError, ValueError, TypeError, StoreUnavailable):
            raise StoreUnavailable() from None

    def _save_cursor(self, account, producer, cursor):
        path = self._cursor_path(account, producer); temp = path.with_name(path.name + '.tmp')
        if _physical(self.store.root) != self.store._root_identity: raise StoreUnavailable()
        _private(self.store.root, True)
        try:
            if os.path.lexists(temp): _physical(temp); _private(temp,False); temp.unlink()
            if os.path.lexists(path): _physical(path); _private(path,False)
            with open(temp,'xb') as stream:
                stream.write(json.dumps(cursor,sort_keys=True,separators=(',',':')).encode());stream.flush();os.fsync(stream.fileno())
            if os.name=='posix':os.chmod(temp,0o600)
            _physical(temp);_private(temp,False);os.replace(temp,path)
            if os.name=='posix':
                fd=os.open(path.parent,os.O_RDONLY|getattr(os,'O_DIRECTORY',0))
                try:os.fsync(fd)
                finally:os.close(fd)
            _physical(path);_private(path,False)
        except (OSError, StoreUnavailable, ValueError):
            try:
                if os.path.lexists(temp):_physical(temp);_private(temp,False);temp.unlink()
            except (OSError,StoreUnavailable):pass
            raise StoreUnavailable() from None

    def _remove_cursor(self, account, producer):
        path=self._cursor_path(account,producer)
        if os.path.lexists(path):_physical(path);_private(path,False);path.unlink()

    def _refresh_file_index(self):
        now = time.monotonic()
        if self._file_index_at and now - self._file_index_at < _FILE_INDEX_REFRESH_SECONDS:
            return
        ready = {producer: [] for producer in self.producers}
        archived = {producer: [] for producer in self.producers}
        invalid = set()
        with os.scandir(self.root) as entries:
            for entry in entries:
                match = _READY.fullmatch(entry.name)
                if not match or match.group(1) not in ready:
                    continue
                first, last = int(match.group(2)), int(match.group(3))
                if first > last:
                    invalid.add(match.group(1))
                    continue
                ready[match.group(1)].append((first, last, Path(entry.path), 'ready'))
        with os.scandir(self.archive) as entries:
            for entry in entries:
                match = _READY.fullmatch(entry.name)
                if not match or match.group(1) not in archived:
                    continue
                first, last = int(match.group(2)), int(match.group(3))
                archived[match.group(1)].append((first, last, Path(entry.path), 'archive'))
        for producer, rows in ready.items():
            rows.sort(key=lambda row: (row[0], row[1], row[2].name))
            previous = 0
            for first, last, _, _ in rows:
                if first <= previous:
                    invalid.add(producer)
                    break
                previous = last
        self._ready_files = ready
        self._archived_files = archived
        self._invalid_ready_producers = invalid
        self._file_index_at = now

    def _invalidate_file_index(self):
        self._file_index_at = 0.0

    def _files(self, producer):
        self._refresh_file_index()
        if producer in self._invalid_ready_producers:
            raise SegmentInvalid()
        ready = list(self._ready_files.get(producer, ()))
        active=self.root/(producer+'.active.ndjson')
        rows=[(first,last,path,state) for first,last,path,state in ready]
        if os.path.lexists(active):rows.append((None,None,active,'active'))
        rows.extend(self._archived_files.get(producer, ()))
        return rows

    def _segment_sequences(self, path, first, last):
        _physical(path);_private(path,False)
        size=path.stat().st_size
        if size>MAX_SEGMENT_BYTES or size==0:
            raise SegmentInvalid()
        data=path.read_bytes()
        if not data.endswith(b'\n'):raise SegmentInvalid()
        sequences=[]
        for raw in data.splitlines(keepends=True):
            if len(raw)>MAX_LINE_BYTES or not raw.endswith(b'\n'):raise SegmentInvalid()
            try:row=json.loads(raw[:-1])
            except (ValueError,UnicodeError):raise SegmentInvalid() from None
            seq=row.get('sequence') if type(row) is dict else None
            if type(seq) is not int or seq<1 or sequences and seq<=sequences[-1]:raise SegmentInvalid()
            sequences.append(seq)
        if not sequences or sequences[0]!=first or sequences[-1]!=last:raise SegmentInvalid()
        return data,sequences

    def _choose(self, account, importer):
        saved=self._load_cursor(account,importer)
        rows=self._files(importer.producer_id)
        if saved:
            identity=(saved['device'],saved['inode'])
            matches=[]
            for first,last,path,state in rows:
                try:dev,ino=_physical(path)
                except (OSError,StoreUnavailable):continue
                if (dev,ino)==identity:matches.append((first,last,path,state))
            if len(matches)!=1:raise FileIdentityChanged()
            first,last,path,state=matches[0]
            size=path.stat().st_size
            if size>MAX_SEGMENT_BYTES or size<saved['offset']:raise FileIdentityChanged()
            with path.open('rb') as stream:prefix=stream.read(saved['offset'])
            if len(prefix)!=saved['offset'] or hashlib.sha256(prefix).hexdigest()!=saved['prefixDigest']:raise FileIdentityChanged()
            if state=='archive':
                if saved['fileState'] not in ('ready','archive') or saved['offset']!=size:raise FileIdentityChanged()
                self._remove_cursor(account,importer.producer_id)
                return None
            if state=='active' and saved['fileState']!='active':raise FileIdentityChanged()
            if state=='ready':
                if saved['fileState'] not in ('active','ready'):raise FileIdentityChanged()
                data,sequences=self._segment_sequences(path,first,last)
                if saved['offset']>len(data):raise FileIdentityChanged()
            elif saved['fileState']!='active':
                raise StoreUnavailable()
            saved.update(fileName=path.name,fileState=state,firstSequence=first,lastSequence=last)
            return saved,path,(first,last,state)
        candidates=[row for row in rows if row[3]=='ready']
        if not candidates:candidates=[row for row in rows if row[3]=='active']
        if not candidates:return None
        first,last,path,state=candidates[0]
        if state=='ready':self._segment_sequences(path,first,last)
        dev,ino=_physical(path)
        cursor={'schemaVersion':1,'accountId':account,'terminalIdentityHash':importer.context.terminal_identity_hash,'producerId':importer.producer_id,
                'fileName':path.name,'fileState':state,'device':int(dev),'inode':int(ino),'offset':0,'prefixDigest':hashlib.sha256(b'').hexdigest(),'firstSequence':first,'lastSequence':last}
        self._save_cursor(account,importer.producer_id,cursor)
        return cursor,path,(first,last,state)

    def _poll_producer(self, producer):
        account,importer=self.producers[producer]
        with self.producer_lock(producer) as locked:
            if not locked:return {'code':'CONSUMER_LOCKED','imported':0,'gapCount':importer.gap_count,'gapObserved':importer.gap_count>0}
            try:
                importer.reload_cursor()
                chosen=self._choose(account,importer)
                if chosen is None:return {'code':'IDLE','imported':0,'gapCount':importer.gap_count,'gapObserved':importer.gap_count>0}
                cursor,path,(first,last,state)=chosen
                _physical(path);_private(path,False)
                size=path.stat().st_size
                if size>MAX_SEGMENT_BYTES or size<cursor['offset']:raise StoreUnavailable()
                dev,ino=_physical(path)
                if (int(dev),int(ino))!=(cursor['device'],cursor['inode']):raise FileIdentityChanged()
                with path.open('rb') as stream:prefix=stream.read(cursor['offset']);chunk=stream.read(min(size-cursor['offset'],MAX_SEGMENT_BYTES))
                if len(prefix)!=cursor['offset'] or hashlib.sha256(prefix).hexdigest()!=cursor['prefixDigest']:raise FileIdentityChanged()
                prefix_hasher=hashlib.sha256(prefix)
                lines=chunk.splitlines(keepends=True);partial=False
                if lines and not lines[-1].endswith(b'\n'):
                    partial=True;lines=lines[:-1]
                imported=duplicates=store_lost=0
                gap_observed=importer.gap_count>0
                for raw in lines[:self.records_per_poll]:
                    outcome=importer.import_line(raw)
                    store_lost=max(store_lost,outcome.get('storeLostCount',0))
                    gap_observed=gap_observed or bool(outcome.get('gapObserved'))
                    if not outcome.get('ok'):
                        return {'code':outcome.get('code','IMPORT_FAILED'),'imported':imported,'gapCount':outcome.get('gapCount',importer.gap_count),'gapObserved':gap_observed,'storeLostCount':store_lost}
                    if outcome.get('code')=='DUPLICATE':duplicates+=1
                    else:imported+=1
                    cursor['offset']+=len(raw);prefix_hasher.update(raw);cursor['prefixDigest']=prefix_hasher.hexdigest()
                    self._save_cursor(account,producer,cursor)
                remaining=lines[self.records_per_poll:]
                if state=='ready' and not partial and not remaining and cursor['offset']==size:
                    if first is None or last is None:raise StoreUnavailable()
                    self._segment_sequences(path,first,last)
                    expected_identity=(cursor['device'],cursor['inode'])
                    def verify_acknowledged_file(candidate):
                        _physical(candidate);_private(candidate,False)
                        dev,ino=_physical(candidate)
                        if (int(dev),int(ino))!=expected_identity or candidate.stat().st_size!=cursor['offset']:
                            raise FileIdentityChanged()
                        digest=hashlib.sha256()
                        with candidate.open('rb') as stream:
                            for block in iter(lambda:stream.read(65536),b''):digest.update(block)
                        if digest.hexdigest()!=cursor['prefixDigest']:
                            raise FileIdentityChanged()
                        return (int(dev),int(ino))
                    identity=verify_acknowledged_file(path)
                    archive=self.archive/path.name
                    if os.path.lexists(archive):raise StoreUnavailable()
                    os.replace(path,archive)
                    try:
                        if verify_acknowledged_file(archive)!=identity:raise FileIdentityChanged()
                    except FileIdentityChanged:
                        if not os.path.lexists(path):os.replace(archive,path)
                        raise
                    cursor['fileName']=archive.name;cursor['fileState']='archive'
                    self._save_cursor(account,producer,cursor)
                    self._remove_cursor(account,producer)
                    return {'code':'ARCHIVED','imported':imported,'duplicates':duplicates,'gapCount':importer.gap_count,'gapObserved':gap_observed,'storeLostCount':store_lost}
                return {'code':'IMPORTED' if imported or duplicates else 'IDLE','imported':imported,'duplicates':duplicates,'waitingForNewline':partial,'morePending':bool(remaining),'gapCount':importer.gap_count,'gapObserved':gap_observed,'storeLostCount':store_lost}
            except FileIdentityChanged:
                return {'code':'FILE_IDENTITY_CHANGED','imported':0,'gapCount':importer.gap_count,'gapObserved':importer.gap_count>0,'storeLostCount':0}
            except SegmentInvalid:
                return {'code':'SEGMENT_RANGE_INVALID','imported':0,'gapCount':importer.gap_count,'gapObserved':importer.gap_count>0,'storeLostCount':0}
            except (OSError, ValueError, TypeError, StoreUnavailable, json.JSONDecodeError):
                return {'code':'SPOOL_UNAVAILABLE','imported':0,'gapCount':importer.gap_count,'gapObserved':importer.gap_count>0,'storeLostCount':0}

    def _scan_temporary_segments(self):
        now = time.monotonic()
        if now - self._temporary_scan_at < _TEMP_SCAN_INTERVAL_SECONDS:
            return
        self._temporary_scan_at = now
        counts = {producer: {'count': 0, 'bytes': 0, 'oldest': None, 'newest': None}
                  for producer in self.producers}
        try:
            with os.scandir(self.root) as entries:
                for entry in entries:
                    match = _TEMP_SEGMENT.fullmatch(entry.name)
                    if not match or match.group(1) not in counts:
                        continue
                    try:
                        metadata = entry.stat(follow_symlinks=False)
                    except OSError:
                        continue
                    if stat.S_ISREG(metadata.st_mode):
                        values = counts[match.group(1)]
                        values['count'] += 1
                        values['bytes'] += max(0, metadata.st_size)
                        mtime = metadata.st_mtime
                        values['oldest'] = mtime if values['oldest'] is None else min(values['oldest'], mtime)
                        values['newest'] = mtime if values['newest'] is None else max(values['newest'], mtime)
        except OSError:
            return
        def as_utc(value):
            if value is None:
                return None
            return datetime.fromtimestamp(value, timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')

        self._temporary_backlog = {
            producer: {
                'temporaryFileCount': values['count'],
                'temporaryBytes': values['bytes'],
                'temporaryOldestMtimeUtc': as_utc(values['oldest']),
                'temporaryNewestMtimeUtc': as_utc(values['newest']),
            }
            for producer, values in counts.items()
        }

    def poll_once(self):
        self._scan_temporary_segments()
        status={}
        invalidate_file_index = False
        for producer in self.producers:
            result=self._poll_producer(producer)
            invalidate_file_index = invalidate_file_index or result.get('code') == 'ARCHIVED'
            result.update(self._temporary_backlog.get(producer, {
                'temporaryFileCount': 0, 'temporaryBytes': 0,
                'temporaryOldestMtimeUtc': None, 'temporaryNewestMtimeUtc': None,
            }))
            self._reported_store_loss[producer]=max(self._reported_store_loss[producer],result.get('storeLostCount',0))
            self._reported_gap[producer]=self._reported_gap[producer] or bool(result.get('gapObserved'))
            result['storeLostCount']=self._reported_store_loss[producer]
            result['gapObserved']=self._reported_gap[producer]
            status[producer]=result
        if invalidate_file_index:
            self._invalidate_file_index()
        return status


async def run_spool_service(app, consumer, *, interval=1.0, poll=asyncio.to_thread):
    """Poll off-loop and retain process-lifetime import counters between polls."""
    app.state.evidence_spool_status = {}
    totals = {name: {'importedTotal': 0, 'duplicatesTotal': 0} for name in consumer.producers}

    def publish(result):
        if not isinstance(result, dict):
            raise ValueError('invalid spool status')
        pending = {}
        for name in consumer.producers:
            entry = result.get(name)
            if not isinstance(entry, dict):
                raise ValueError('invalid producer status')
            counts = (entry.get('imported', 0), entry.get('duplicates', 0))
            if any(type(count) is not int or count < 0 for count in counts):
                raise ValueError('invalid spool count')
            pending[name] = (entry, counts)

        status = {}
        for name, (entry, counts) in pending.items():
            totals[name]['importedTotal'] += counts[0]
            totals[name]['duplicatesTotal'] += counts[1]
            status[name] = {
                **entry,
                'importedTotal': totals[name]['importedTotal'],
                'duplicatesTotal': totals[name]['duplicatesTotal'],
            }
        app.state.evidence_spool_status = status

    try:
        while True:
            in_flight=asyncio.create_task(poll(consumer.poll_once))
            try:publish(await asyncio.shield(in_flight))
            except asyncio.CancelledError:
                try:publish(await asyncio.shield(in_flight))
                except Exception:pass
                raise
            except Exception:
                app.state.evidence_spool_status = {
                    name: {'code': 'SPOOL_UNAVAILABLE', 'gapCount': 0, 'gapObserved': False, **totals[name]}
                    for name in consumer.producers
                }
            await asyncio.sleep(interval)
    except asyncio.CancelledError:
        raise

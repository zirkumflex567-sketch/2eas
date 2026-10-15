"""Opt-in, immutable trusted-provider evidence. No broker or HTTP ingestion.

The current OS user is trusted. Physical checks detect replacement between
connections; they do not promise immunity to races by that same user.
"""
import ctypes
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import stat
import struct
import subprocess
import threading
import time
import uuid
from chart_studio import evidence_models as models

PAGE_COUNT = 24576
RECORD_LIMIT = 100000
PAGE_BYTES = 2 * 1024 * 1024


class StoreUnavailable(Exception):
    pass


class StoreReplaced(StoreUnavailable):
    pass


class Conflict(Exception):
    pass


class Capacity(Exception):
    pass


def _same_mt5_deal_redelivery(existing, candidate):
    """Treat a later observation of the same broker deal as the same fact.

    The first capturedAtUtc remains immutable provenance. A later polling pass
    may observe the same deal with a newer capture time, but it must not alter
    the stored record or hide any changed broker fact.
    """
    if (not isinstance(existing, dict) or not isinstance(candidate, dict) or
            existing.get('type') != 'LIFECYCLE' or candidate.get('type') != 'LIFECYCLE'):
        return False
    old_payload, new_payload = existing.get('payload'), candidate.get('payload')
    if (not isinstance(old_payload, dict) or not isinstance(new_payload, dict) or
            old_payload.get('source') != 'MT5_DEAL' or new_payload.get('source') != 'MT5_DEAL' or
            'capturedAtUtc' not in old_payload or 'capturedAtUtc' not in new_payload):
        return False
    old = dict(existing, payload={key: value for key, value in old_payload.items()
                                  if key not in ('capturedAtUtc', 'revision')})
    new = dict(candidate, payload={key: value for key, value in new_payload.items()
                                   if key not in ('capturedAtUtc', 'revision')})
    return old == new


def _windows_private(path):
    """Inspect effective DACL ACE trustees with native Win32 APIs; fail closed."""
    from ctypes import wintypes as w
    adv = ctypes.WinDLL('advapi32', use_last_error=True)
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    ptr = ctypes.c_void_p
    adv.GetNamedSecurityInfoW.argtypes = [w.LPWSTR, w.DWORD, w.DWORD, ctypes.POINTER(ptr), ctypes.POINTER(ptr), ctypes.POINTER(ptr), ctypes.POINTER(ptr), ctypes.POINTER(ptr)]
    adv.GetNamedSecurityInfoW.restype = w.DWORD
    adv.ConvertSidToStringSidW.argtypes = [ptr, ctypes.POINTER(w.LPWSTR)]
    adv.ConvertSidToStringSidW.restype = w.BOOL
    adv.GetAce.argtypes = [ptr, w.DWORD, ctypes.POINTER(ptr)]
    adv.GetAce.restype = w.BOOL
    adv.OpenProcessToken.argtypes = [w.HANDLE, w.DWORD, ctypes.POINTER(w.HANDLE)]
    adv.GetTokenInformation.argtypes = [w.HANDLE, ctypes.c_int, ptr, w.DWORD, ctypes.POINTER(w.DWORD)]
    kernel.GetCurrentProcess.restype = w.HANDLE
    kernel.LocalFree.argtypes = [ptr]
    kernel.CloseHandle.argtypes = [w.HANDLE]
    def sid_text(sid):
        value = w.LPWSTR()
        if not adv.ConvertSidToStringSidW(sid, ctypes.byref(value)):
            raise StoreUnavailable()
        try:
            return value.value
        finally:
            kernel.LocalFree(ctypes.cast(value, ptr))
    token = w.HANDLE()
    if not adv.OpenProcessToken(kernel.GetCurrentProcess(), 8, ctypes.byref(token)):
        raise StoreUnavailable()
    try:
        length = w.DWORD()
        adv.GetTokenInformation(token, 1, None, 0, ctypes.byref(length))
        buffer = ctypes.create_string_buffer(length.value)
        if not adv.GetTokenInformation(token, 1, buffer, length, ctypes.byref(length)):
            raise StoreUnavailable()
        user = sid_text(ptr.from_buffer(buffer).value)
    finally:
        kernel.CloseHandle(token)
    descriptor, dacl, owner = ptr(), ptr(), ptr()
    if adv.GetNamedSecurityInfoW(str(path), 1, 5, ctypes.byref(owner), None, ctypes.byref(dacl), None, ctypes.byref(descriptor)):
        raise StoreUnavailable()
    try:
        if not dacl.value or sid_text(owner) not in {user, 'S-1-5-18', 'S-1-5-32-544'}:
            raise StoreUnavailable()
        # ACL header: BYTE revision, BYTE reserved, WORD size/count/reserved.
        count = ctypes.c_ushort.from_address(dacl.value + 4).value
        allowed = {user, 'S-1-5-18', 'S-1-5-32-544'}
        granted = False
        for i in range(count):
            ace = ptr()
            if not adv.GetAce(dacl, i, ctypes.byref(ace)):
                raise StoreUnavailable()
            kind = ctypes.c_ubyte.from_address(ace.value).value
            # Standard deny ACE cannot broaden access. Unknown/object ACEs
            # are unsupported rather than guessed at.
            if kind == 1:
                continue
            if kind != 0 or sid_text(ace.value + 8) not in allowed:
                raise StoreUnavailable()
            if sid_text(ace.value + 8) == user:
                granted = True
        if not granted:
            raise StoreUnavailable()
    finally:
        kernel.LocalFree(descriptor)


def _private(path, directory):
    if os.name == 'nt':
        _windows_private(path)
    elif os.name == 'posix':
        st = path.lstat()
        if st.st_uid != os.getuid() or stat.S_IMODE(st.st_mode) != (0o700 if directory else 0o600):
            raise StoreUnavailable()
    else:
        raise StoreUnavailable()


def _physical(path):
    for component in [*reversed(path.parents), path]:
        st = component.lstat()
        if stat.S_ISLNK(st.st_mode) or getattr(st, 'st_file_attributes', 0) & 0x400:
            raise StoreUnavailable()
    st = path.lstat()
    if stat.S_ISREG(st.st_mode) and st.st_nlink != 1:
        raise StoreUnavailable()
    return st.st_dev, st.st_ino


SCHEMA = (
    'CREATE TABLE metadata(singleton INTEGER PRIMARY KEY CHECK(singleton=1),schemaVersion INTEGER NOT NULL CHECK(schemaVersion=1),generation TEXT NOT NULL)',
    'CREATE TABLE records(seq INTEGER PRIMARY KEY AUTOINCREMENT,account TEXT NOT NULL,terminal TEXT NOT NULL,kind TEXT NOT NULL,id TEXT NOT NULL,revision INTEGER NOT NULL,event_us INTEGER NOT NULL,symbol TEXT,strategy TEXT,position_id TEXT,canonical_json BLOB NOT NULL,sha256 TEXT NOT NULL,UNIQUE(account,terminal,kind,id,revision))',
    'CREATE TABLE refs(source_seq INTEGER NOT NULL REFERENCES records(seq),target_seq INTEGER NOT NULL REFERENCES records(seq),PRIMARY KEY(source_seq,target_seq))',
    'CREATE INDEX records_scope_order ON records(account,terminal,kind,event_us,id,revision,seq)',
    'CREATE INDEX records_symbol_order ON records(account,terminal,kind,symbol,event_us,id,revision,seq)',
    'CREATE INDEX records_strategy_order ON records(account,terminal,kind,strategy,event_us,id,revision,seq)',
    'CREATE INDEX records_position_order ON records(account,terminal,kind,position_id,event_us,id,revision,seq)',
)


class EvidenceStore:
    def __init__(self, root=None, *, db_path=None, excluded_roots=()):
        self.root = Path(os.path.abspath(root)) if root else None
        self.path = Path(os.path.abspath(db_path)) if db_path else None
        if self.root and (not self.path or self.path.parent != self.root or self.path.suffix != '.sqlite'):
            raise StoreUnavailable()
        self.record_limit = RECORD_LIMIT
        self._file_identity = None
        self._root_identity = None
        self._generation = None
        self._verified_contents = None
        self._monitor = None
        self._monitor_version = None
        self._append_verified = False
        self._append_file_state = None
        self._loss = {}
        self._lock = threading.RLock()
        if self.root:
            try:
                self._root_identity = _physical(self.root)
                if not self.root.is_dir():
                    raise StoreUnavailable()
                _private(self.root, True)
                if any((parent / '.git').exists() for parent in [self.root, *self.root.parents]):
                    raise StoreUnavailable()
                for excluded in excluded_roots:
                    p = Path(excluded).resolve()
                    if self.root == p or self.root.is_relative_to(p):
                        raise StoreUnavailable()
                # All discovered Git worktrees, including sibling checkouts.
                for parent in [Path.cwd(), *Path.cwd().parents]:
                    if (parent / '.git').exists():
                        output = subprocess.check_output(['git', '-C', str(parent), 'worktree', 'list', '--porcelain'], text=True)
                        for line in output.splitlines():
                            if line.startswith('worktree '):
                                p = Path(line[9:]).resolve()
                                if self.root == p or self.root.is_relative_to(p):
                                    raise StoreUnavailable()
                        break
                self._verify_path()
            except (OSError, ValueError, subprocess.SubprocessError) as exc:
                raise StoreUnavailable() from exc

    def gaps(self, account):
        with self._lock:
            return {'knownLossSinceStart':self._loss.get(account, 0), 'lifetime':'PROCESS_ONLY', 'unrecordedHistory':True}

    def _close_monitor(self):
        if self._monitor is not None:
            self._monitor.close()
            self._monitor = None
        self._monitor_version = None
        self._append_verified = False
        self._append_file_state = None

    def _file_state(self):
        """Invalidate append's cache for ordinary file writes outside SQLite.

        A same-user edit that preserves stat fields or races the final sample
        can evade this check; every read still hashes actual stored bytes.
        """
        try:
            current = self.path.lstat()
        except OSError as exc:
            raise StoreUnavailable() from exc
        identity = (current.st_dev, current.st_ino)
        if identity != self._file_identity:
            raise StoreReplaced()
        if (not stat.S_ISREG(current.st_mode) or current.st_nlink != 1 or
                getattr(current, 'st_file_attributes', 0) & 0x400 or
                current.st_size > 96 * 1024 * 1024):
            raise StoreUnavailable()
        return identity, current.st_size, current.st_mtime_ns, current.st_ctime_ns

    def _verify_path(self):
        if _physical(self.root) != self._root_identity:
            raise StoreReplaced()
        _private(self.root, True)
        if not os.path.lexists(self.path):
            if self._file_identity is not None:
                raise StoreReplaced()
            return False
        identity = _physical(self.path)
        if not stat.S_ISREG(self.path.lstat().st_mode):
            raise StoreUnavailable()
        _private(self.path, False)
        if self._file_identity is not None and identity != self._file_identity:
            raise StoreReplaced()
        self._file_identity = identity
        for suffix in ('-wal', '-shm'):
            if os.path.lexists(str(self.path) + suffix):
                raise StoreUnavailable()
        journal = Path(str(self.path) + '-journal')
        if os.path.lexists(journal):
            _physical(journal)
            _private(journal, False)
            if journal.stat().st_size + self.path.stat().st_size > 256 * 1024 * 1024:
                raise StoreUnavailable()
        if self.path.stat().st_size > 96 * 1024 * 1024:
            raise StoreUnavailable()
        return True

    def _quick_check(self, db):
        if db.execute('PRAGMA quick_check').fetchone()[0] != 'ok' or db.execute('PRAGMA foreign_key_check').fetchone():
            raise StoreUnavailable()

    def _connect(self, initialize=False, deadline=None, known_good=False):
        if not self.root:
            return None
        try:
            exists = self._verify_path()
            if not exists:
                if not initialize:
                    return None
                fd = os.open(self.path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
                os.close(fd)
                self._verify_path()
            remaining = 0.1 if deadline is None else max(0, min(0.1, (deadline-time.monotonic()) / 2))
            db = sqlite3.connect(self.path.as_uri() + '?mode=rw', uri=True, timeout=remaining, isolation_level=None)
            try:
                db.row_factory = sqlite3.Row
                db.execute(f'PRAGMA busy_timeout={int(remaining*1000)}')
                db.execute('PRAGMA foreign_keys=ON')
                db.execute('PRAGMA synchronous=FULL')
                if not exists:
                    db.execute('PRAGMA page_size=4096')
                    db.execute('PRAGMA journal_mode=DELETE')
                    db.execute(f'PRAGMA max_page_count={PAGE_COUNT}')
                    db.execute('BEGIN IMMEDIATE')
                    for sql in SCHEMA:
                        db.execute(sql)
                    db.execute('INSERT INTO metadata VALUES(1,1,?)', (str(uuid.uuid4()),))
                    db.commit()
                if db.execute('PRAGMA journal_mode').fetchone()[0].lower() != 'delete':
                    raise StoreUnavailable()
                if db.execute('PRAGMA page_size').fetchone()[0] != 4096 or db.execute('PRAGMA synchronous').fetchone()[0] != 2:
                    raise StoreUnavailable()
                if db.execute(f'PRAGMA max_page_count={PAGE_COUNT}').fetchone()[0] != PAGE_COUNT:
                    raise StoreUnavailable()
                expected = {sql.split()[2].split('(')[0]: sql for sql in SCHEMA}
                actual = dict(db.execute("SELECT name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'"))
                if actual != expected:
                    raise StoreUnavailable()
                rows = db.execute('SELECT * FROM metadata').fetchall()
                if len(rows) != 1 or rows[0]['singleton'] != 1 or rows[0]['schemaVersion'] != 1:
                    raise StoreUnavailable()
                generation = rows[0]['generation']
                if not isinstance(generation, str) or str(uuid.UUID(generation)) != generation:
                    raise StoreUnavailable()
                if self._generation and self._generation != generation:
                    raise StoreReplaced()
                self._generation = generation
                if not known_good:
                    self._quick_check(db)
                self._verify_path()
                return db
            except BaseException:
                db.close()
                raise
        except (OSError, sqlite3.Error, ValueError) as exc:
            raise StoreUnavailable() from exc

    def _decoded(self, row):
        try:
            raw = row['canonical_json']
            if not isinstance(raw, bytes) or len(raw)>models.MAX_BYTES or hashlib.sha256(raw).hexdigest() != row['sha256']:
                raise StoreUnavailable()
            context = models.AccountContext.from_config(row['account'])
            record = models.parse_envelope(raw, context=context)
            meta = models.event_metadata(record, context=context)
            payload = record['payload']
            symbol = payload.get('symbol', payload.get('chartView', {}).get('symbol'))
            if (models.canonical_bytes(record) != raw or row['terminal'] != context.terminal_identity_hash or
                    (row['kind'], row['id'], row['revision'], row['event_us'], row['symbol'], row['strategy'], row['position_id']) !=
                    (record['type'], record['id'], record['dataRevision'], meta['eventTimeUs'], symbol, payload.get('strategyId'), payload.get('positionIdentifier'))):
                raise StoreUnavailable()
            return record
        except (ValueError, TypeError, KeyError) as exc:
            raise StoreUnavailable() from exc

    def _checked_record(self, db, row):
        record = self._decoded(row)
        expected = set()
        references = []
        supersedes = record['supersedes']
        if record['dataRevision'] == 1:
            if supersedes is not None:
                raise StoreUnavailable()
        else:
            if supersedes != {'type':record['type'],'id':record['id'],'dataRevision':record['dataRevision']-1}:
                raise StoreUnavailable()
            references.append(supersedes)
        if record['type'] == 'SNAPSHOT':
            references.extend(record['payload']['decisionEventIds'])
        for ref in references:
            target = db.execute('SELECT * FROM records WHERE account=? AND terminal=? AND kind=? AND id=? AND revision=?',
                                (row['account'],row['terminal'],ref['type'],ref['id'],ref['dataRevision'])).fetchone()
            if not target or target['seq'] >= row['seq']:
                raise StoreUnavailable()
            self._decoded(target)
            if ref is not supersedes and (target['symbol'] != row['symbol'] or target['event_us'] > row['event_us']):
                raise StoreUnavailable()
            expected.add(target['seq'])
        actual = {r[0] for r in db.execute('SELECT target_seq FROM refs WHERE source_seq=?',(row['seq'],))}
        if actual != expected:
            raise StoreUnavailable()
        return record

    def _monitor_data_version(self):
        """Detect SQLite commits since append's last full validation.

        Raw same-user file edits bypass this counter; reads always hash stored
        bytes, and a new store process performs full append validation.
        """
        try:
            if self._monitor is None:
                self._monitor = sqlite3.connect(self.path.as_uri() + '?mode=ro', uri=True,
                                                timeout=0.1, isolation_level=None, check_same_thread=False)
            return self._monitor.execute('PRAGMA data_version').fetchone()[0]
        except sqlite3.Error as exc:
            self._close_monitor()
            raise StoreUnavailable() from exc

    def _verify_contents(self, db):
        """Verify before trusting any filtering column, across the read snapshot.

        Every read streams all actual canonical bytes, stored hashes, metadata,
        and reference edges into a digest. Only an identical previously fully
        validated snapshot can reuse validation. The cache is a single digest,
        never an mtime/generation shortcut or a growing collection of records.
        A change requires complete model/hash/metadata/reference validation.
        The database's 96 MiB and 100,000-record caps bound this scan; returned
        pages remain indexed, offsetless, and independently bounded.
        """
        digest = hashlib.sha256()
        count = 0
        for row in db.execute('SELECT * FROM records ORDER BY seq'):
            count += 1
            raw = row['canonical_json']
            if count > RECORD_LIMIT or row['seq'] < 1 or not isinstance(raw, bytes) or len(raw)>models.MAX_BYTES:
                raise StoreUnavailable()
            metadata = models.canonical_bytes([row[key] for key in row.keys() if key != 'canonical_json'])
            digest.update(b'R' + struct.pack('>Q', len(metadata)) + metadata)
            digest.update(b'B' + struct.pack('>Q', len(raw)) + raw)
        for source, target in db.execute('SELECT source_seq,target_seq FROM refs ORDER BY source_seq,target_seq'):
            digest.update(b'F' + struct.pack('>qq', source, target))
        fingerprint = digest.digest()
        if fingerprint == self._verified_contents:
            return
        if db.execute('PRAGMA foreign_key_check').fetchone():
            raise StoreUnavailable()
        for row in db.execute('SELECT * FROM records ORDER BY seq'):
            self._checked_record(db, row)
        self._verified_contents = fingerprint

    def append(self, context, envelope):
        """Internal trusted-provider entry point; no ingestion route exists."""
        account = context.account_id if isinstance(context, models.AccountContext) else None
        db = None
        code, ref = 'STORE_UNAVAILABLE', None
        with self._lock:
            try:
                record = models.validate_envelope(envelope, context=context)
                raw = models.canonical_bytes(record)
                digest = hashlib.sha256(raw).hexdigest()
                if not self.root:
                    raise StoreUnavailable()
                deadline = time.monotonic() + 0.45
                known_good = self._append_verified
                for attempt in range(3):
                    try:
                        if time.monotonic() >= deadline:
                            raise StoreUnavailable()
                        db = self._connect(True, deadline=deadline, known_good=known_good)
                        db.execute(f'PRAGMA busy_timeout={max(0,min(100,int((deadline-time.monotonic())*1000)))}')
                        db.execute('BEGIN IMMEDIATE')
                        break
                    except (sqlite3.OperationalError, StoreUnavailable) as exc:
                        if db:
                            db.close()
                            db = None
                        cause = exc.__cause__ or exc
                        if 'locked' not in str(cause).lower() or attempt == 2:
                            raise StoreUnavailable() from exc
                        time.sleep(0.05)
                monitor_version = self._monitor_data_version()
                file_state = self._file_state()
                if (not self._append_verified or monitor_version != self._monitor_version or
                        file_state != self._append_file_state):
                    if known_good:
                        self._quick_check(db)
                    self._verify_contents(db)
                    if self._file_state() != file_state:
                        raise StoreUnavailable()
                    self._append_verified = True
                    self._monitor_version = monitor_version
                    self._append_file_state = file_state
                scope = (account, context.terminal_identity_hash, record['type'], record['id'])
                existing = db.execute('SELECT * FROM records WHERE account=? AND terminal=? AND kind=? AND id=? AND revision=?', (*scope, record['dataRevision'])).fetchone()
                if existing:
                    existing_record = self._checked_record(db, existing)
                    if (existing['canonical_json'] != raw and
                            not _same_mt5_deal_redelivery(existing_record, record)):
                        raise Conflict()
                    code = 'IDEMPOTENT'
                else:
                    if db.execute('SELECT COUNT(*) FROM records').fetchone()[0] >= self.record_limit:
                        raise Capacity()
                    latest = db.execute('SELECT * FROM records WHERE account=? AND terminal=? AND kind=? AND id=? ORDER BY revision DESC LIMIT 1', scope).fetchone()
                    refs = []
                    if latest:
                        self._checked_record(db, latest)
                        if record['dataRevision'] != latest['revision'] + 1 or record['supersedes'] != {'type':record['type'], 'id':record['id'], 'dataRevision':latest['revision']}:
                            raise Conflict()
                        refs.append(latest['seq'])
                    elif record['dataRevision'] != 1 or record['supersedes'] is not None:
                        raise Conflict()
                    p = record['payload']
                    symbol = p.get('symbol', p.get('chartView', {}).get('symbol'))
                    if record['type'] == 'SNAPSHOT':
                        for reference in p['decisionEventIds']:
                            row = db.execute('SELECT * FROM records WHERE account=? AND terminal=? AND kind=? AND id=? AND revision=?', (account, context.terminal_identity_hash, reference['type'], reference['id'], reference['dataRevision'])).fetchone()
                            if not row:
                                raise Conflict()
                            self._checked_record(db, row)
                            if row['symbol'] != symbol or row['event_us'] > models.utc_microseconds(p['asOfUtc']):
                                raise Conflict()
                            refs.append(row['seq'])
                    if self._file_state() != file_state:
                        raise StoreUnavailable()
                    meta = models.event_metadata(record, context=context)
                    seq = db.execute('INSERT INTO records(account,terminal,kind,id,revision,event_us,symbol,strategy,position_id,canonical_json,sha256) VALUES(?,?,?,?,?,?,?,?,?,?,?)', (*scope, record['dataRevision'], meta['eventTimeUs'], symbol, p.get('strategyId'), p.get('positionIdentifier'), raw, digest)).lastrowid
                    db.executemany('INSERT INTO refs VALUES(?,?)', [(seq, target) for target in set(refs)])
                    code = 'APPENDED'
                if code == 'IDEMPOTENT' and self._file_state() != file_state:
                    raise StoreUnavailable()
                db.commit()
                try:
                    committed_version = self._monitor_data_version()
                except StoreUnavailable:
                    self._append_verified = False
                else:
                    expected_version = monitor_version + 1 if code == 'APPENDED' else monitor_version
                    self._append_verified = committed_version == expected_version
                    self._monitor_version = committed_version
                try:
                    self._append_file_state = self._file_state()
                except StoreUnavailable:
                    self._append_verified = False
                    self._append_file_state = None
                ref = {'type':record['type'], 'id':record['id'], 'dataRevision':record['dataRevision']}
            except Conflict:
                code = 'CONFLICT'
            except Capacity:
                code = 'RECORDING_CAPACITY'
            except (StoreUnavailable, sqlite3.Error, ValueError, TypeError, OSError):
                code = 'STORE_UNAVAILABLE'
            finally:
                if db:
                    db.rollback()
                    db.close()
            ok = code in ('APPENDED', 'IDEMPOTENT')
            if not ok and account in models.gateway.ACCOUNTS:
                self._loss[account] = min(2**31-1, self._loss.get(account, 0) + 1)
            loss = self._loss.get(account, 0)
            return {'ok':ok, 'code':code, 'recordRef':ref, 'gapObserved':loss > 0, 'lostCount':loss}

    def read(self, context, *, kind, start=None, end=None, filters=None, limit=200, pinned=None, last=None, record_id=None, revision=None):
        result = {'schemaVersion':1, 'accountId':context.account_id, 'terminalIdentityHash':context.terminal_identity_hash,
                  'availability':'NOT_RECORDED', 'storeState':'DISABLED' if not self.root else 'NOT_INITIALIZED',
                  'coverage':'UNKNOWN', 'gaps':self.gaps(context.account_id),
                  'canExecute':False, 'records':[], 'generation':None, 'pinnedMaxSeq':0, 'last':None, 'hasMore':False}
        db = None
        with self._lock:
            try:
                db = self._connect()
                if db is None:
                    return result
                db.execute('BEGIN')
                self._verify_contents(db)
                pin = db.execute('SELECT COALESCE(MAX(seq),0) FROM records').fetchone()[0] if pinned is None else pinned
                where = ['account=?', 'terminal=?', 'kind=?', 'seq<=?']
                args = [context.account_id, context.terminal_identity_hash, kind, pin]
                if start is not None:
                    where.extend(['event_us>=?', 'event_us<=?']); args.extend([start, end])
                for key, value in (filters or {}).items():
                    if key not in ('symbol', 'strategy', 'position_id'):
                        raise ValueError('invalid filter')
                    where.append(key + '=?'); args.append(value)
                if record_id:
                    where.append('id=?'); args.append(record_id)
                    if revision is not None:
                        where.append('revision=?'); args.append(revision)
                if last:
                    where.append('(event_us,id,revision,seq)>(?,?,?,?)'); args.extend(last)
                order = 'revision DESC' if record_id and revision is None else 'event_us,id,revision,seq'
                rows = db.execute('SELECT * FROM records WHERE ' + ' AND '.join(where) + ' ORDER BY ' + order + ' LIMIT ?', (*args, 1 if record_id else limit + 1))
                size = 0
                returned = []
                has_more = False
                for row in rows:
                    if len(returned) >= limit or size + len(row['canonical_json']) > PAGE_BYTES:
                        has_more = True
                        break
                    decoded = self._checked_record(db, row)
                    size += len(row['canonical_json'])
                    returned.append(decoded)
                    result['last'] = [row['event_us'], row['id'], row['revision'], row['seq']]
                provenance = {record['provenance'] for record in returned}
                result.update(records=returned, hasMore=has_more, generation=self._generation, pinnedMaxSeq=pin, storeState='INITIALIZED')
                if provenance:
                    result['availability'] = next(iter(provenance)) if len(provenance) == 1 else 'MIXED'
                db.commit()
                return result
            except (sqlite3.Error, OSError, ValueError) as exc:
                raise StoreUnavailable() from exc
            finally:
                if db:
                    db.close()

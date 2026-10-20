# STT dashboard proxy operations

The dashboard supports nginx Basic Authentication with explicitly assigned `read`,
`layout`, or `trade` roles. A proxy role never defaults to `trade`. Only `trade`
can use the existing modify-position, close-position and reset-drawdown controls.
`read` and `layout` receive a session with `control_enabled: false`. Chart workspace
writes still use the separate existing Chart Studio token gate; a dashboard proxy
role does not authorize them. The new-entry ticket additionally requires `trade`
and its own private feature gate, which defaults to disabled.

## Trust boundary and application configuration

Run the application on loopback, with the TCP peer preserved. `python app.py`
passes `proxy_headers=False` to uvicorn. For a CLI/service launch, use
`uvicorn app:app --host 127.0.0.1 --port 8050 --no-proxy-headers`. Never enable
`--proxy-headers`, trusted forwarded middleware, or PROXY protocol handling that
replaces the TCP peer before `dashboard_security` verifies it. The current Windows
the live main application runs on port 8056 (`DASHBOARD_PORT=8056`). The reverse
SSH tunnel maps remote loopback port 8055 to the Windows loopback backend on
port 8056; nginx's `proxy_pass` therefore remains port 8055. If nginx
and the application instead run on the same host without that SSH tunnel, match
the backend port to `proxy_pass`: for example, explicitly set
`DASHBOARD_PORT=8055` for `python app.py`, or CLI `--port 8055`.

Configure these in the application's protected service environment:

| Variable | Meaning |
| --- | --- |
| `DASHBOARD_ALLOWED_HOSTS` | Comma-separated public hostnames, without schemes, paths or ports. Default local hosts remain accepted. |
| `DASHBOARD_PROXY_SECRET` | Shared high-entropy secret of at least 32 characters; identical to the nginx include value. Store outside Git. |
| `DASHBOARD_PROXY_USERS` | JSON object mapping exact Basic-auth usernames to `read`, `layout`, or `trade`. Example: `{"viewer":"read","designer":"layout","operator":"trade"}`. |
| `DASHBOARD_PROXY_PREFIX` | Exact deployment prefix; default `/stt`. Change nginx and this value together. No trailing slash. |
| `DASHBOARD_CONTROL_TOKEN` | Existing optional explicit bearer capability. It is independent of nginx credentials and grants trade controls. |
| `CHART_STUDIO_TRADE_TICKET_ENABLED` | Separate pending-entry commit gate; accepts only `0` or `1` and defaults to `0`. Leave disabled until the demo risk guard, exact order candidate, and recovery/readback acceptance are complete. |

Malformed JSON, duplicate usernames, unknown roles, unmapped or empty usernames,
a short/missing secret, a wrong secret, and a non-loopback proxy peer fail closed.
Duplicate identity/forwarding headers also fail closed. A permitted public Host
arriving over loopback cannot receive a local operator capability. Local sessions
require both a local peer and a loopback Host (or the `testserver` test host).
Forwarding headers alone neither grant a capability nor change request metadata.

## Mutation audit journal

The application keeps an append-only SQLite journal at
`~/.chartstudio/mutation-audit.sqlite`, outside the Git checkout. On POSIX
systems the store creates a `0700` directory and a `0600` database; on Windows
it inherits the current user's profile ACL. State-changing dashboard API routes
(position modify/close/reset, commit attempts, workspace writes, and device-sync
writes) are journaled before route dispatch and get a second event with their
HTTP outcome. Read-only preview POSTs are not state changes. The records contain
only the canonical route template, the demo alias read from the query or scoped
JSON account field, role, a stable hash of the principal, UTC timestamps, and status.
Request bodies, headers, cookies, passwords, control tokens, broker logins,
server names, and path IDs are not retained.

Read the latest 1–500 events with the authenticated
`GET /api/audit/mutations?limit=100` route. A failed start append returns
`AUDIT_UNAVAILABLE` before the handler runs, including when the store is missing.
A failed result append returns
`AUDIT_RESULT_UNAVAILABLE`; the durable start event remains for reconciliation.
An account alias outside the configured non-protected demo allowlist is
rejected before dispatch. This API journal records dashboard requests; MT5 EA
activity and manual terminal actions require their own recorder or broker
history evidence.

Only a verified proxy may supply one literal IPv4/IPv6 `X-Forwarded-For`, an
`http`/`https` scheme and the exact configured prefix. nginx must terminate HTTPS
for public use. The normalized HTTPS scheme supplies the external origin and a
Secure, HttpOnly, SameSite=Strict session cookie. Each control mutation checks the
current identity, role, session and CSRF token. Changing the user, removing their
mapping or downgrading their role rejects and revokes the old session; request a
new session after updating authorization. Sessions expire after one hour and are
in memory, so restarting the application clears them. Existing explicit bearer
sessions retain cookie/CSRF compatibility while the configured bearer is unchanged.

## nginx provisioning and deployment

`stt_nginx.conf` is a location template inside the intended HTTPS `server` block.
Keep `auth_basic` and its protected password file enabled. nginx validates the
credentials before proxying and replaces `X-Dashboard-User` with `$remote_user`.
It replaces the forwarding chain with `$remote_addr` and clears upstream
`Authorization`, so the Basic credential does not reach application handlers.
These directives must remain together within the location; nginx header directive
inheritance can change when adding directives in child locations.

Provision `/etc/nginx/snippets/stt-proxy-secret.conf` outside the repository. It
contains exactly one directive, using the same secret as the application:

```nginx
proxy_set_header X-Dashboard-Proxy-Secret "<provisioned-secret>";
```

The placeholder is not a usable secret. Have the deployment secret manager write
a cryptographically random ASCII value (at least 32 characters, preferably 64
hex characters) directly into this file and the application environment file.
Use `root:root` ownership and mode `0600` on both files and restrict the Basic-auth
password file. The nginx master/service must be able to read the include; a
rootless deployment needs an equally restricted service-readable arrangement.
Do not print these files, log request identity secrets, run `nginx -T` in shared
logs, or put credentials in commands, URLs, reports or Git.

For an approved deployment, back up the installed application/configuration and
protected files, set the environment and include, install the location template,
and validate nginx configuration with `nginx -t`. Confirm the application runs
with raw-peer forwarding disabled, then restart the application and reload nginx
through the deployment's service manager. Validate `/stt/api/control_session`
through HTTPS with separate read/layout/trade test identities: confirm each role
and `control_enabled` result, cookie Secure/HttpOnly flags, and a denied mutation
for a read identity. Test permitted mutations only against isolated mock handlers;
do not place or close a live trade to verify security. Confirm invalid proxy
claims on the loopback backend return 403 and direct external backend access is
blocked by the network/service binding.

This repository change does not perform deployment, service reloads, broker calls
or live trade verification.

## Runtime version proof and guarded Windows restart

`GET /api/runtime` returns `pid`, `startedUtc`, `checkoutId`, `startupRevision`,
`startupDigest`, `diskRevision`, `diskDigest`, `applicationCodeDirty`,
`sourceAvailable` and `restart_required`. Startup revision/digest are captured
once before serving and remain fixed for the lifetime of the process. Current
disk revision/digest are inspected afresh, so editing a module or static source,
staging a source addition, deleting tracked source or changing HEAD requires a
restart. An unreadable/missing source also requires a restart. The response
contains no paths, environment values, account data or credentials.

The digest includes tracked Python, JavaScript/TypeScript (including CJS/MJS),
CSS/HTML and immutable package/build manifests and dashboard dependency locks.
It excludes tests, docs, private/secrets directories, generated output, package
installations, runtime state, untracked files and mutable `drawdown_config.json`.
It does not attest installed dependency binaries or images/fonts. `checkoutId`
is SHA256 of the normalized resolved absolute checkout root; identical source
in another Git worktree therefore cannot authorize stopping this process.
Without a usable Git checkout, revision is explicitly `unknown` and inspection
is limited to known dashboard root modules and source directories. The guarded
script requires a readable Git checkout and refuses this fallback.

Inspect expected code without importing the dashboard or MT5:

```powershell
& 'C:\Python314\python.exe' 'C:\path\dashboard\dashboard_runtime.py' --inspect-checkout 'C:\path\dashboard'
```

`scripts/dashboard_runtime.ps1` is validated on Windows PowerShell 5.1
(5.1.26100.9444) and PowerShell 7.6.6 on Windows, using disposable HTTP fixtures.
It reads raw HTTP JSON and preserves the exact `startedUtc` string: PowerShell
5.1 preserves strings directly, and supported Core parsers use
`ConvertFrom-Json -DateKind String` (introduced in 7.5). Core shells without
that parameter refuse clearly before any stop. Timestamp type/UTC format and
all process, checkout and source identity checks still apply. Other shell
versions have not been validated.

Supply explicit absolute repository/Python paths and backend port. These
examples are operator commands; they are not executed by this change:

```powershell
.\scripts\dashboard_runtime.ps1 -Action Status -Repo 'C:\path\dashboard' -Python 'C:\Python314\python.exe' -Port 8056
.\scripts\dashboard_runtime.ps1 -Action Start -Repo 'C:\path\dashboard' -Python 'C:\Python314\python.exe' -Port 8056 -PrivateEnvJson 'C:\protected\dashboard-env.json'
.\scripts\dashboard_runtime.ps1 -Action Restart -Repo 'C:\path\dashboard' -Python 'C:\Python314\python.exe' -Port 8056 -PrivateEnvJson 'C:\protected\dashboard-env.json'
```

When `-PrivateEnvJson` is omitted, the direct runtime command uses
`$env:USERPROFILE\.dashboard-env.json`, matching the guarded wrapper. `Start`
and `Restart` refuse to proceed if that default file is missing; pass an explicit
external path to override it.

The private file must be outside the resolved checkout and protected by local
ACLs. It is a JSON object with unique keys and string values. Permitted keys are
the five proxy/control variables documented above,
`DASHBOARD_QUOTE_MAX_AGE_SECONDS`, chart storage/evidence settings,
`CHART_STUDIO_DEVICE_SYNC_ENABLED`, `CHART_STUDIO_V5_PREVIEW_ENABLED`, and
`CHART_STUDIO_TRADE_TICKET_ENABLED`, and `CHART_STUDIO_INDICATOR_TRUSTED_KEYS_JSON`.
The new-entry gate accepts only `0` or `1` and is disabled unless explicitly set
to `1`; enabling it installs a distinct guarded pending-order route, not an EA
or automatic chart-click order. Keep it disabled until a reviewed demo order
candidate and readback/rollback acceptance are ready. The indicator trust variable is a
JSON object mapping 1–16 key IDs to canonical Base64 Ed25519 public keys (32
decoded bytes); private signing keys must never be placed in this file. The
launcher rejects duplicate IDs, malformed/noncanonical keys, and oversized maps
before it stops an existing process. Secret values/passwords
must never be placed in shell arguments or Git. The private file can be omitted
for default local configuration. Controlled dashboard/chart variables are cleared
in the child environment before applying this file; protected settings must be
provided explicitly on every launch. Port is supplied by `-Port`, not the file.
The file does not provision nginx Basic-auth passwords, enable a new chart write
gate or replace the protected nginx secret include.

Start/Restart rejects dirty tracked application code, missing source, malformed
JSON, duplicate keys, invalid roles/prefixes, short/missing proxy secrets and
invalid quote/storage configuration before any stop. Mutable drawdown changes
do not count as application code. Source files with Git `assume-unchanged` or
`skip-worktree` flags are rejected even if their bytes match, because these flags
can conceal changes from Git diff. Clear those flags before an approved launch.
Proxy usernames must use printable ASCII without spaces or commas, matching the
application's exact identity grammar. Syntax preflight compiles the complete
tracked application Python inventory without importing app/MT5; a committed
helper syntax error is therefore rejected before stopping the old process.
The script then verifies that the actual loopback listener PID
matches the runtime endpoint PID and that `checkoutId` matches the requested
checkout. Unrelated listeners, wildcard-bound listeners, malformed endpoints
and another worktree are refused. Restart can intentionally replace a stale
running revision with the current clean checkout revision.

Launch uses the selected Python and absolute `app.py` path in a hidden process.
Unique `.dashboard-runtime-*.stdout.log`, `.stderr.log` and `.previous.log`
files must be ignored by Git before launch. Treat these local logs as private;
application tracebacks may contain protected data. No log contents or private
environment values are printed by the script. Startup waits up to 30 seconds
(configurable with `-StartupTimeoutSeconds`, maximum 60), checking listener PID,
checkout identity, startup/disk revision/digest and a false `restart_required`.
There is no Git pull, MT5/EA restart, SSH/tunnel restart or broker operation.

If the replacement fails, the script stops only its own newly launched process,
reports the previous public runtime proof and preserves source, protected
environment file and ignored recovery record. It does not automatically roll
back files or replay environment secrets. Use the deployment backup to restore
the prior checkout revision/environment and rerun Start. A source digest alone
cannot restore old source bytes; keep a recoverable Git revision and protected
configuration backup before an approved rollout.

An older running dashboard without `/api/runtime` cannot be restarted by this
guard. During the first migration, the operator must independently verify the
existing listener's PID, executable, command line and checkout ownership, back
up its configuration, and explicitly stop that dashboard process only. Then
launch the upgraded clean checkout with Start and verify local/public runtime
proof. Do not infer ownership from a matching port or HTML, and do not stop
MT5, EA, Python processes generally or the reverse SSH tunnel.

## Rollback

If validation fails, close public access to the STT location first. Restore the
previous application, environment and nginx configuration from the protected
backup, validate configuration, and restart/reload through the approved service
manager. Do not leave the public proxy serving the prior loopback-only gate: it
can treat nginx connections as local operators. Keep STT public access disabled
until equivalent proxy authorization is verified. Reissue sessions after restart
and rotate the shared secret if it may have been exposed.

## References

The template follows the official nginx documentation for
[Basic Authentication](https://nginx.org/en/docs/http/ngx_http_auth_basic_module.html),
[`proxy_set_header` replacement and suppression](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_set_header),
and the [`$remote_user` and `$remote_addr` variables](https://nginx.org/en/docs/http/ngx_http_core_module.html#variables).
Runtime timestamp parsing follows the official PowerShell
[`ConvertFrom-Json` `DateKind` documentation](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.utility/convertfrom-json?view=powershell-7.6).

# Chart Studio foundation — test branch

Primary requirements: [docs/CHART_STUDIO_MASTER_SPEC.md](../docs/CHART_STUDIO_MASTER_SPEC.md)
Execution: [plan](../docs/CHART_STUDIO_PLAN.md) · [task board](../docs/CHART_STUDIO_TASKS.md).

The first functional **read-only** beta is integrated into the existing dashboard
via `static/chart-studio-beta.js`, using a temporary Lightweight Charts v4 adapter.
It does **not** replace the planned professional v5 engine.

Current features:
- Enable/disable EMA20/50/200; SMA20/50 and Bollinger 20 overlays.
- Draw horizontal/trend/rectangle/Fibonacci tools with time+price anchors, drag
  existing handles, undo/redo, account-scoped *provisional* browser storage and
  JSON export through clipboard.
- Optionally display actual broker position Entry/SL/TP lines and zone overlays
  **without any trading mutation**.
- Read-only What-if plan and JSON API endpoints for a verified MT5 XAUUSD
  quote and `order_calc_profit`/`order_calc_margin` broker pricing.
- Read-only What-if sizing can use fixed lots, a cash risk budget in account
  currency, or an equity percentage. Automatic lot size is rounded down across
  broker volume steps using MT5 stop-profit calculations; missing equity,
  currency, or broker pricing fails closed.
- No USD exchange-rate fabrication: previews for non-USD accounts are in
  account currency, with USD explicitly unavailable.

Routes: `GET /api/chart/v1/capabilities`,
`GET /api/chart/v1/quotes`,
`POST /api/chart/v1/scenarios/preview`.

## Immutable evidence Phase 0

`GET /api/chart/v1/decisions`, `/decisions/{id}`, `/lifecycle`,
`/snapshots`, and `/snapshots/{id}` read immutable schema-v1 evidence.
Every request requires an explicit `account`; lists require `fromUtc` and
`toUtc` in explicit UTC, at most 31 days apart, and `limit` of 1–200.
Decision lists support `symbol` and `strategyId`; snapshot lists support
`symbol` and `positionIdentifier`; lifecycle lists support `positionIdentifier`.
Details accept an optional integer `revision`, otherwise returning the latest
revision. Lists include all immutable revisions ordered by event time, ID, and
revision. Continuations use `nextCursor` as the next request's `cursor`, keeping
the same range, filters, account, and limit. They expire after 15 minutes and
are invalid after process restart or identity/scope/generation changes.

Recording is disabled by default. Both `CHART_STUDIO_EVIDENCE_ROOT` and
`CHART_STUDIO_EVIDENCE_DB` must be explicitly configured before application
startup. The root must already exist, be private, and be outside every Git
worktree and mounted static directory. The DB must be an immediate-child
regular `.sqlite` file; an absent DB can only be initialized by the internal
trusted-provider append entry point, never by GET. A partial configuration
remains disabled. Invalid complete configuration or damaged existing storage
fails closed. No launcher environment allowlist was expanded.

Windows ACLs permit only the current user, SYSTEM, and Administrators; POSIX
requires owner-only root mode 0700 and file mode 0600. Symlinks, reparse points,
multilink files, replacement, WAL storage, and unsupported permission verifiers
are refused. The current OS user is a trusted boundary: these checks do not
promise protection against races or modification by that same user. SQLite
uses DELETE journaling, synchronous FULL, a 96 MiB database cap, a 100,000
record cap, and a 256 MiB aggregate database/journal ceiling.

`EvidenceStore.append(configured_context, envelope)` is an internal API for a
reviewed trusted provider, with transactional correction/reference validation
and immutable originals. There is no HTTP ingestion endpoint, EA recorder,
automatic snapshot capture, current original decision history, or renderer in
this phase. `renderAssetRef` remains null and no rendered files are invented.
`chart_studio.evidence_spool.SpoolImporter` is a tested local-line validation
and append helper with a private atomic cursor, but no file worker or EA
producer is wired or running; it does not enable automatic recording.
Recorded versus reconstructed availability follows the validated records on
the returned page; an empty page, uninitialized store, or disabled store returns
`NOT_RECORDED`. Every read verifies store-wide canonical bytes, stored hashes,
indexed metadata, and reference edges before trusting query filters. A single
cached digest avoids repeating semantic validation only for an identical,
previously fully verified snapshot; every read still hashes actual contents,
and changes or process restart require full validation. Coverage is always
`UNKNOWN`, history may be unrecorded, and the loss counter is bounded,
process-only, and resets on restart. It makes no durable gap guarantee.

The existing middleware authenticates local, bearer, and proxy identities;
`read`, `layout`, and `trade` roles can read both configured demo account
aliases for this single operator. This is not a per-account ACL. Responses
have `Cache-Control: no-store` and `canExecute: false`; these routes make no
MT5 calls and never choose a default/selected account or restart a terminal.
The synthetic benchmark in ignored `output/platform` exercises fake evidence
only; its cold/warm timings and memory/DB/journal observations are not a
production performance or recording claim. Cold means the first read pass
with a fresh store object; the OS cache is not flushed. Warm means the second
pass, and both open fresh SQLite connections. The memory figure is the OS
whole-process lifetime peak working set, not incremental evidence allocations.

## Verified broker reads

`GET /api/chart/v1/symbols?account=titan&q=USD&limit=50` searches actual MT5
symbol names (case insensitive, `q` at most 64 characters, `limit` 1–200).
Results retain the broker `tradeMode`, including disabled instruments. Search
does not select symbols in Market Watch. `GET /api/chart/v1/symbol-info` requires
an explicit `account` and `symbol` and returns actual digits, point, tick size,
stop/freeze levels, volume limits/step, currencies and trade mode. Empty broker
currency metadata remains empty; it is never replaced with USD.

`GET /api/chart/v1/positions?account=titan&symbol=XAUUSD` returns separate
`positions` and pending `orders`, actual account `currency`/`marginMode`, and a
verified quote. Both broker fetches run under the account gateway's shared lock,
with login/server/terminal identity checked on every request. A stopped terminal
is refused. Optional decimal string `ticket`, `magic` and boolean `manual`
filters apply **after** broker fetch and validation. A broker `None`, malformed
row or invalid quote returns 503; an empty tuple remains an honest empty array.
Unknown symbols return 404; missing or malformed query fields return 422 and
unknown account scopes return 400. Reads send `Cache-Control: no-store`.

Prices, volumes, profit/swap and identifiers use canonical decimal strings.
Position profit/swap are in the actual account currency, with no FX conversion.
Broker SL/TP zero becomes `null`. Every hedged ticket and pending order type is
retained. Magic zero means `MANUAL`; all other rows are `UNKNOWN` because no
verified ownership map exists. Comments remain provenance, never EA identity.
All read models expose `source: MT5_VERIFIED` and `canExecute: false`.

The Chart Studio beta's Brokerbuch panel consumes these routes for XAUUSD open
positions and pending orders, and `/trades` for a paginated list of actual deals.
Ticket, magic and manual/unknown filters are preserved in the UTC history cursor
scope; changing a filter or date range restarts at page one. A 410 cursor error
clears pagination and asks the user to reload history. The panel validates
`MT5_VERIFIED` and `canExecute: false`, clears tables on account changes, and
renders all broker strings as text. Deal rows are not joined into reconstructed
positions, and no EA owner is inferred from comments or magic values.

Position and order `revision` values are SHA-256 of compact, sorted-key JSON;
all schema values are canonical strings, including raw zero SL/TP. Both include
account ID (`account`), verified `login`/`server` and broker `symbol`.
Positions additionally use `ticket, identifier, type, volume, price_open, sl,
tp, time_update_msc`. Orders use their distinct real schema: `ticket,
position_id, type, volume_current, volume_initial, price_open, price_stoplimit,
sl, tp, time_setup_msc, time_expiration, type_time, type_filling, state`.
Live quotes, current prices, profit and comments do not affect revisions.

Creation/update/expiration clocks retain raw broker milliseconds alongside
normalized `utcEpochMs`, the configured `brokerUtcOffsetSeconds` and
`offsetSource: ACCOUNT_CONFIG`. Zero order expiration stays unset (`null`).
Paired creation/update/setup seconds and milliseconds must agree on the second;
inconsistent pairs fail closed while actual millisecond precision is retained.
Quotes expose `rawBrokerEpoch`/`rawBrokerEpochMs`, corrected `quoteTimeUtc`/
`quoteTimeUtcMs`, `ageSeconds`, and `freshness` (`FRESH`, `STALE` after 30 seconds,
or `FUTURE` when more than one second ahead). Valid stale quotes retain the
broker book and explicitly disable execution. Invalid or absent clock policies
fail closed. The legacy XAUUSD quote endpoint keeps numeric `bid`, `ask`, and
`tickSize` for the existing UI while using the same clock and quote validation.
Returned legacy symbol metadata must name the requested symbol exactly.

`GET /api/chart/v1/trades?account=titan&symbol=XAUUSD&fromUtc=2026-10-09T09:00:00Z&toUtc=2026-10-09T13:00:00Z&limit=100`
reads actual MT5 `HISTORY_DEAL` records exclusively through
`history_deals_get(date_from, date_to)`, under the same verified account session
and shared lock. Both UTC endpoints are required ISO datetimes with `Z` or
`+00:00` and at most six fractional digits; the range must be positive and no
longer than 31 days. Missing/invalid ranges return 422 before connecting.
`limit` is 1–500 (default 100). Optional `ticket`, `magic` and `manual` filters
apply after raw history validation. Here **ticket means the DEAL ticket**, not
the ORDER ticket accepted by MT5's own `ticket` fetch argument. History is
fetched by range without the MT5 ticket argument; returned `orderTicket` and
`positionIdentifier` preserve the separate broker identifiers.

The `trades` array preserves executed BUY/SELL deals, each real `entry`
(`IN`, `OUT`, `INOUT`, `OUT_BY`, or explicit `UNKNOWN`), `rawType`/`rawEntry`,
`status: EXECUTED`, fill `price`/`volume`, signed `commission`/`swap`/`profit`/
`fee`, account currency, magic/ownership and comment. Financial values and
identifiers are canonical decimal strings. No positions, pending orders,
signals, inferred EA ownership or USD conversions become history fills.
Actual broker provenance also retains required `rawReason` (a nonnegative
integer, including unknown codes) and `externalId` (the actual broker string,
allowed to be empty). Neither field infers EA ownership. Missing or malformed
values fail closed even in filtered or omitted rows. Both participate in
duplicate validation and the pagination fingerprint: conflicting same-ticket
values return 503, and corrected provenance between pages expires the cursor
with 410.
`fillTime` retains raw milliseconds, normalized UTC milliseconds and the
explicit account offset provenance; `rawBrokerTime` retains the paired seconds.
The pair must agree on its second. Request UTC datetimes are shifted by the
configured account offset (the demos use UTC+3), retaining explicit UTC tzinfo
for MT5 queries so the machine timezone never changes the query range.

Non-trade balance/credit/commission/other deals and BUY_CANCELED (13)/
SELL_CANCELED (14) are excluded from `trades`. `omittedCategories` reports each
category's `type`, `rawType` and unique-deal `count` across the account's pinned
UTC range, before the fill-only symbol/ticket/magic/manual filters. Unknown
deal types are reported as `OTHER_UNKNOWN`, never assigned a guessed side.
All raw rows, even omitted or filtered rows, must contain valid finite fields.
`None` or malformed broker data returns 503; an actual empty tuple succeeds
with empty arrays. More than 50,000 raw rows returns explicit 503 `HISTORY_LIMIT`
and requires a narrower range; history is never silently truncated.

The first page pins `asOfUtc` to the earlier of requested `toUtc` and observed
UTC now. Inclusive range filtering uses actual milliseconds, excludes future
deals and persists that first boundary on later pages. Request `fromUtc`/
`toUtc` and response times are canonicalized to six fractional UTC digits.
Rows sort ascending by `(rawBrokerEpochMs, numeric DEAL ticket)`. Identical
duplicate tickets collapse; conflicting duplicates fail closed with 503.

Pass `nextCursor` as the optional `cursor` on the next request, retaining the
same account, symbol, UTC range and filters. Page size may change. Cursors are
opaque, HMAC-authenticated tokens with a random process-local key, constant-time
signature verification and bounded encoding. They bind exact account/login/
server/terminal/clock identity and all filters through a scope digest; tokens
contain no credentials, terminal paths or raw account identity. There is no
cursor persistence. Tampering, scope changes, process restarts or corrected/
late-arriving history inside the pinned range return explicit 410
`CURSOR_INVALID_OR_EXPIRED`; start again without a cursor. A history fingerprint
prevents silent duplicates or skipped inserted deals across pages. New deals
after the pinned boundary cannot enter subsequent pages. `nextCursor: null`
marks the final page. These reads send `Cache-Control: no-store` and cannot
execute broker mutations.

These endpoints supply backend read contracts. Native symbol/history UI,
FX normalization and chart trading remain later work.

## Opt-in serverseitige Chart-Workspaces (SQLite)

Die Layouts liegen nun **zusätzlich** in der privaten SQLite-Datenbank.
Der Speicher ist **standardmäßig ausgeschaltet**, da das ältere Dashboard
noch keinen vollständig geprüften Benutzer-Login besitzt. Die neuen APIs
sind **separat token-geschützt** und handeln niemals auf MT5.

Aktivierung auf dem privaten Windows-Server **vor dem Start** (PowerShell):

```powershell
$env:CHART_STUDIO_STORAGE_ENABLED = "1"
$env:CHART_STUDIO_STORAGE_TOKEN = "<ein-geheim-erzeugtes-zufälliges-Token-mit-mindestens-32-Zeichen>"
$env:CHART_STUDIO_DB = "C:\ChartStudioPrivate\chart_studio.sqlite3"
python app.py
```

Das obige Token ist nur ein **Platzhalter**, niemals als Token übernehmen.
Ein eigenes kryptografisch zufälliges Geheimnis generieren; nicht in GitHub
oder Browser-LocalStorage ablegen. Auf öffentlichen Installationen zusätzlich
HTTPS und eine starke globale Dashboard-Anmeldung einsetzen, **bevor** echte
MT5-Schreibfunktionen aktiviert werden.

Im Chart Studio bei **Server-Layouts** den Token einmalig in das Passwortfeld
eingeben, **Verbinden** wählen und anschließend Serverlayouts speichern,
laden oder löschen. Beim Refresh/Schließen ist der Token weg. Der Browser
speichert weiterhin lokale Layoutprofile unabhängig davon.

Die API ist versionsgeführt und verweigert alte Schreibrevisionen mit
`409 REVISION_CONFLICT`. Die Daten sind nach `owner + account + symbol + name`
isoliert, beschränkt auf bekannte Zeichnungs-/Indikatortypen und Größenlimits.
`DELETE` benötigt ebenfalls die erwartete Revision. Kein stiller Merge.

- `GET /api/chart/v1/workspaces?account=titan&symbol=XAUUSD`
- `GET /api/chart/v1/workspace?account=titan&symbol=XAUUSD&name=...`
- `PUT /api/chart/v1/workspace` mit `expectedRevision` und Dokument
- `DELETE /api/chart/v1/workspace` mit `expectedRevision`

Alle Requests benötigen `Authorization: Bearer <secret>`; ohne serverseitigen
Opt-in gibt der Dienst **503** zurück. Datenbankdateien niemals unter `/static`
anlegen; `state/` und SQLite-Journale sind Git-ignoriert.

**Aktueller Umfang:** Zeichenobjekte, EMA-/SMA-/Bollinger-/Pane-Einstellungen
und Timeframe werden gespeichert. Beim Laden bleibt der **aktive** Timeframe
vorerst unverändert, bis die spätere v5-Layoutverwaltung implementiert ist.
Serverlayouts sind momentan bewusst ein **Single-Owner-Lokalbetrieb**
(gesamtes autorisiertes Terminal), noch keine Multi-User-SaaS-Verwaltung.

Keine echte SL-/TP-Bearbeitung, Positionseröffnung, Replay oder
EA-Entscheidungshistorie wird durch diese Speicherfunktion freigeschaltet.
Die vollständig neue v5-Engine und weitere Master-Spezifikationstasks sind offen.


## Read-only actual position stop preview

`POST /api/chart/v1/position/preview-stop` requires the middleware-verified identity,
explicit account/symbol/ticket, current semantic `expectedRevision`, UUID request ID,
and at least one candidate `slPrice`/`tpPrice`. Prices are plain decimal strings;
omitted legs preserve the broker level, explicit null removes it (never a zero zone).

Actual MT5 quotes, tick size, volume step, stop/freeze levels, order-mode SL/TP flags,
position side/open price/volume and `order_calc_profit` drive the calculation. Both
initial and final signed server-observed quote ages must be within -500..5000 ms.
The account gateway lock covers identity checks, full symbol position/order book
validation, calculations and readback. Final revisions and geometry are checked again.
Existing levels at or inside a nonzero freeze distance conservatively block changing
or removing that leg; brokers may have less restrictive policies.

Money is estimated gross in the actual account currency; fees, swap, gaps and
slippage are excluded. No USD or FX conversion and no contract-size fallback exist.
Unset money is null. Risk/reward is unavailable unless SL gross is negative and TP
gross is positive; profitable trailing stops remain valid geometry.

Guard and market-session sources remain UNKNOWN/NONE. Geometry validity is never
permission: every preview has `canExecute=false` and `canCommit=false`. Persisted EA
files without a live heartbeat do not authorize anything. Native dragging and commit
remain unavailable; there is no commit route.

Random preview IDs live only in a locked process-local registry (maximum 256), expire
at a monotonic 10-second deadline, and disappear on restart or eviction. Internal
lookup binds the middleware principal/role/channel/raw peer plus actual account,
terminal, symbol, ticket and revision; returned snapshots are independent copies.
Displayed expiry/as-of use server UTC, while broker clock provenance retains raw
clock, configured offset, normalized UTC and permitted skew. An ID is never a write
capability: any future write gate needs separate live authorization, confirmation,
CSRF and fresh broker/guard reads. A monotonic per-principal 4/s burst-8 limiter and
one global in-flight preview reject excess work before entering the gateway.

The canonical result exposes `valid`, `positionRevision`, `brokerPreview` with
`slPrice`/`tpPrice`, nullable `pnlAtSl`/`pnlAtTp` estimated-gross money objects,
`ratioRiskReward`, UTC `quoteTimeUtc`, and `expiresAtUtc`. Symbol contract size,
calculation mode, monetary currencies and tick-value variants are included in the
actual initial/final calculation-context comparison when exposed by the adapter;
a correction conflicts instead of returning stale money. Account currency is also
verified before and after calculation and at final readback.

Trade-mode provenance reports the actual MT5 integer. Mode 0 is disabled; modes
1/2/3 are long-only/short-only/close-only and conservatively block proposal validity
with distinct reasons. Unknown modes fail explicitly. Rate-limit quota follows the
verified authentication channel and subject across peer/role changes; registry
bindings continue to include the full role and raw peer.

# Chart Studio foundation — test branch

Primary requirements: [docs/CHART_STUDIO_MASTER_SPEC.md](../docs/CHART_STUDIO_MASTER_SPEC.md)
Execution: [plan](../docs/CHART_STUDIO_PLAN.md) · [task board](../docs/CHART_STUDIO_TASKS.md).

The first functional **read-only** beta is integrated into the existing dashboard
via `static/chart-studio-beta.js`, using a temporary Lightweight Charts v4 adapter.
It does **not** replace the planned professional v5 engine.

Current features:
- Enable/disable EMA20/50/200; SMA20/50 and Bollinger 20 overlays.
- Draw horizontal/vertical and text annotations plus trend/rectangle/Fibonacci tools with time+price anchors, drag
  existing handles, undo/redo, account-scoped *provisional* browser storage and
  JSON export through clipboard. Local layouts can be copied or renamed, and a
  confirmed chart reset preserves the saved layouts.
- Fibonacci levels can be edited per drawing, including negative retracements
  and extensions such as 261.8%; accepted levels are strictly ascending and
  bounded to −1000%…+1000%.
- Display current `MT5_VERIFIED` XAUUSD positions as separate BUY/SELL ticket
  overlays with entry, SL/TP zones, broker P/L and swap in the verified account
  currency, plus the account's NETTING/EXCHANGE/HEDGING mode. Failed/stale
  reads and account changes clear the overlay; there is no guessed USD
  conversion and no trading mutation.
- The read-only Brokerbuch searches the verified MT5 symbol catalog and filters
  positions, pending orders and deal history by selected symbol. Non-XAU rows
  stay table-only while the displayed chart is XAUUSD; drafts and overlays remain
  bound to the matching chart symbol.
- The beta data window shows the hovered or pinned candle's UTC time and OHLC
  from the loaded chart series, plus calculated values for enabled RSI, MACD,
  ATR, volume, ADX, and VWAP indicators and visible configurable EMA/SMA/WMA
  lines at that bar. Warm-up and missing-volume states stay explicit; selected
  values follow calculation and line-configuration changes while the OHLC bar
  stays fixed. It labels the source as the chart feed.
  The full native v5 data window and remaining indicator catalog are still open.
  After an explicit verified MT5
  quote read, it also shows bid/ask, price spread, quote time, and freshness
  as of that read (including broker-reported quote age); invalid provenance
  clears these values.
  Unpinning, Escape, account changes, and timeframe changes clear the pinned
  bar; hover resumes when the pointer selects a candle again.
- Read-only What-if plan and JSON API endpoints for a verified quote on the
  current broker-verified chart symbol and `order_calc_profit`/`order_calc_margin`
  broker pricing. Account/symbol changes clear old quote and entry/SL/TP prices;
  position-bound stop drafts keep their separate XAUUSD-only restriction.
- Read-only What-if sizing can use fixed lots, a cash risk budget in account
  currency, or an equity percentage. Automatic lot size is rounded down across
  broker volume steps using MT5 stop-profit calculations; missing equity,
  currency, or broker pricing fails closed.
- What-if accepts a user assumption for round-trip fees per lot in account
  currency and adverse exit slippage in broker ticks. MT5 prices the
  slippage-adjusted exits; the UI keeps broker gross PnL separate from the
  estimated net values and uses these assumptions in risk-budget sizing. They
  are not broker-reported costs; actual commission, swap and gaps may differ.
- USD What-if results also project the assumed net stop risk against the fresh
  dashboard daily drawdown estimate, with quote time and remaining distance.
  The EA guard is always shown as unknown unless a separate live authorization
  source is proven; unavailable history/quotes and non-USD daily-DD projections
  stay unavailable.
- For non-USD What-if PnL, USD equivalents use one fresh selected MT5 direct or
  inverse currency pair. Assets use bid and liabilities use ask in the correct
  pair direction. Missing, stale, invalid, or ambiguous symbols leave USD
  amounts unavailable; the broker's original account-currency PnL stays primary.
- Two broker-verified What-if previews can be saved as account-and-symbol-scoped
  local A/B snapshots and exported as JSON. XAUUSD remains schema v2 for existing
  snapshots; other symbols use schema v3. The schema retains the exact preview request
  and response plus the same-account portfolio exposure, stop risk and
  descriptive What-if-symbol correlations as read at capture time. Exported
  portfolio context omits broker login/server identity. Schema-v1 snapshots
  remain readable with their portfolio context marked unavailable. These are
  not executable orders and are not synced to the server.

Routes: `GET /api/chart/v1/capabilities`,
`GET /api/chart/v1/quotes`,
`POST /api/chart/v1/scenarios/preview`.

## Portable Beta chart layouts

The active Beta panel can download and import a full chart layout as a
`2eas-chart-layout:v2` JSON file. It contains the chart symbol and timeframe,
drawings, chart options, indicator and moving-average settings, oscillator
instances, chart appearance, and chart type. It does not contain an account
identifier, broker positions, tickets, or order data. Files are limited to
512 KiB and must match the active chart's exact symbol and timeframe.

`Zusammenführen` appends drawings, remaps colliding drawing IDs, and applies
the file's chart and indicator settings. `Ersetzen` requires a browser
confirmation and installs the whole imported view. Rejected files and a
cancelled replacement leave the active view and its saved settings unchanged.
This is a local chart transfer; server multi-user conflict resolution and the
native-v5 production cutover remain separate work.

## Signed indicator extension sandbox (internal engine)

`chart_studio.indicator_extensions` accepts canonical JSON packages signed with
Ed25519. The host injects a trusted public-key map; package-provided keys are
never trusted. Export signs a canonical manifest only with a caller-provided
private-key object, which the module neither creates nor stores. The package
contains declarative source/constant/parameter leaves and arithmetic, SMA, or
EMA nodes. Imported Python or JavaScript is never executed; the calculator has
no filesystem, network, account, MT5, or broker-write access.

The current engine limits packages to 64 KiB, expressions to 128 nodes/depth
16, parameters to 16, bars to 10,000, and periods to 1,000. Before allocating
series it checks a conservative 64 MiB owned-memory estimate and a 3,000,000
operation-unit budget. Runtime metering repeats the work bound and aborts at a
250 ms monotonic deadline. SMA/EMA warmup is `None`; division by zero is also
`None`. A local 10,000-bar SMA(20) fixture completed in 56–86 ms over five
runs; separate `tracemalloc` profiling recorded an 835 KB peak. These are
local fixture measurements, not target-hardware acceptance.

The Chart Studio Beta now has a session-only signed-package import and preview.
`POST /api/chart/v1/indicator-extensions/preview` accepts bounded current-chart
bars and returns `CALLER_SUPPLIED_BARS`; it does not call MT5 or persist input
or output. The browser plots only the computed line on the active chart and
removes it on account, symbol, or timeframe changes. The endpoint fails closed
unless the host injects `CHART_STUDIO_INDICATOR_TRUSTED_KEYS_JSON`; the package
cannot supply its own trusted key. This does not make the browser bars
authoritative evidence or the output a broker signal.

The environment value is a JSON object keyed by signer ID, with each value the
base64 encoding of one raw 32-byte Ed25519 public key, for example
`{"release-key-2026":"<base64-public-key>"}`. Provision and rotate this
public trust map through the host's protected environment; never place private
signing keys in this setting or the repository.

The Beta also lets a user create a canonical package manifest and sign it
locally with a selected PKCS#8 Ed25519 private key, then download the signed
JSON package. The key is used only in browser memory, never sent to the server,
and the file input is cleared after use. After the server verifies a signed package,
it appears in the searchable native indicator catalog for the current session;
selecting it repeats the same read-only preview. Scope changes and selecting a new
file remove the catalog entry and chart line. The browser smoke generates a temporary
keypair and verifies the exported package through the Python server verifier,
including fractional and scientific-notation numbers. Server preview still
requires a separately provisioned host trust key.

Production trust-key provisioning/rotation, live-key package acceptance,
independent sandbox security review, and target-hardware profiling remain open
under FR-024.

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
fails closed. The runtime private-environment allowlist explicitly permits the
spool-root setting; the data path is never included in public runtime identity.

The local spool reader is also disabled by default. Enabling it requires an
explicit `CHART_STUDIO_EVIDENCE_SPOOL_ROOT` pointing to a pre-existing private
directory outside Git worktrees and static mounts, with a private pre-created
`archive/` child. It tails `<producerId>.active.ndjson` and archives only closed
`<producerId>.<first>-<last>.ready.ndjson` segments. Startup and shutdown own its
polling task; records are processed in bounded batches outside the event loop.
Internal `app.state.evidence_spool_status` reports importer gaps and failures.
The spool setting does not verify a loaded EA identity or prove file authorship.

The independent broker-deal recorder is disabled by default as well. Enable it
only with the private evidence store and an explicit comma-separated
`CHART_STUDIO_EVIDENCE_DEAL_ACCOUNTS` allowlist. Every alias must resolve to a
unique configured demo terminal; funded accounts such as Blueberry and duplicate
terminal aliases are rejected. It reads MT5 deal history under the normal
verified account lock, then appends the normalized deal ticket, position/order
IDs, side, entry kind, price, volume, commission, fee, swap, profit, broker event
time, and capture time to the same immutable store. It polls off the event loop,
pages at most 50,000 deals per account per pass, starts with a 48-hour recovery
window, and keeps a five-minute overlap after successful passes. Failed reads,
store writes, invalid records, or a page cap leave the watermark behind and show
unknown coverage/gap state internally so the next pass retries. `INOUT` reversal
deals remain `POSITION_OBSERVED`; the recorder never claims a full position exit
or reconstructs EA decisions. This data is broker history, not an EA decision
trace, and the rolling recovery window does not establish older history.

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
`chart_studio.evidence_spool.SpoolImporter` validates local lines and appends
with a private atomic cursor. `chart_studio.evidence_spool_service.SpoolFileConsumer`
is wired to application startup/shutdown only when the explicit private spool
root is valid; it remains disabled by default and no worker is running unless
configured. The broker-deal reader described above is a separate opt-in event
source. There is still no EA producer or verified loaded EA identity, so this
does not establish live EA decision recording.
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
does not select symbols in Market Watch. Invalid broker rows are skipped
individually and counted in `invalidCount`; valid search results remain usable.
`GET /api/chart/v1/symbol-info` requires
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

`GET /api/chart/v1/portfolio?account=titan` returns a bounded account-wide
position aggregate, margin/equity context, and the sum of broker-calculated loss
at actual position stop levels. A missing SL or failed calculation makes stop
risk explicitly unavailable. The `scenarioSymbol` query (default `XAUUSD`)
adds the proposed What-if instrument to the held symbols. For at most 12 unique
symbols total, the route requests at most 257 completed H1 bars per symbol and
returns pairwise Pearson correlations using at least 60 exact shared one-hour
close-to-close UTC intervals. It starts at MT5 bar index 1 to omit the current
unfinished bar. Missing, invalid or insufficient history is `UNAVAILABLE`; the
UI labels correlations descriptive and does not apply hedge credit to its
gross-additive What-if stop risk. All calls execute under the shared verified
account lock and issue no broker writes.

After a successful same-account What-if preview, the beta also projects gross
long, gross short and net lots for the proposed symbol using the broker-returned
final size, including server-sized budget lots. It displays matching completed-H1
correlations as descriptive context only. These lots are not notional exposure,
and correlations never reduce projected stop risk; missing preview or portfolio
data remains unavailable.

The Chart Studio beta's Brokerbuch panel consumes these routes for verified
account-scoped symbol search and selection, selected-symbol positions and pending
orders, and `/trades` for a paginated list of actual deals. The current selected
symbol drives the chart feed and its read-only matching overlays/markers. Position
stop drafts remain limited to XAUUSD. It requests up to 200
catalog entries; when the result is truncated, refine the symbol search. Positions,
orders and deals are validated row-by-row against the selected account, symbol,
source and read-only flag.
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
or `FUTURE` when more than 1.5 seconds ahead). Quote display and analytics allow
that bounded server-clock skew; position-stop previews and commits independently
reject quotes more than one second ahead. Valid stale quotes retain the
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
files without a live heartbeat do not authorize anything. The beta can select a
verified open position on the exact currently verified broker symbol, adjust a
transient revision-bound SL/TP draft with chart pointer handles or price fields, and
request this read-only preview. Suffixes such as `XAUUSD.pi` and `XAUUSD.p` are
preserved through symbol metadata and broker calculation. Account, symbol, ticket,
revision, and request ID are checked before showing a result; a revision conflict or
chart/account scope change discards the draft. Touch/hardware acceptance remains open,
and there is still no commit route.

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

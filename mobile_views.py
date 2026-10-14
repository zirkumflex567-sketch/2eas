"""Lightweight Mobile and Retro ASCII Art versions of the Titan Cockpit.
No heavy animations, no external CDN dependencies, ultra-fast and phone-optimized.
"""

MOBILE_HTML = """<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <title>Titan Mobile Cockpit</title>
  <style>
    :root {
      --bg: #070a0e;
      --card: #0d131a;
      --card-border: rgba(255,255,255,0.08);
      --text: #e2e8f0;
      --sub: #94a3b8;
      --green: #10b981;
      --green-bg: rgba(16,185,129,0.15);
      --red: #ef4444;
      --red-bg: rgba(239,68,68,0.15);
      --cyan: #06b6d4;
      --amber: #f59e0b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 14px;
      line-height: 1.4;
      padding: 10px 12px 60px;
      overflow-x: hidden;
    }
    .header-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--card-border);
      margin-bottom: 10px;
    }
    .title {
      font-size: 15px;
      font-weight: 800;
      color: var(--cyan);
      letter-spacing: 0.05em;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .view-switcher {
      display: flex;
      gap: 4px;
      background: rgba(255,255,255,0.05);
      padding: 2px;
      border-radius: 6px;
    }
    .view-btn {
      padding: 4px 8px;
      font-size: 11px;
      font-weight: 700;
      color: var(--sub);
      text-decoration: none;
      border-radius: 4px;
      transition: all 0.15s;
    }
    .view-btn.active {
      background: var(--cyan);
      color: #000;
    }
    .account-tabs {
      display: flex;
      gap: 6px;
      overflow-x: auto;
      padding-bottom: 6px;
      margin-bottom: 10px;
      scrollbar-width: none;
    }
    .account-tabs::-webkit-scrollbar { display: none; }
    .acc-tab {
      flex: 0 0 auto;
      padding: 6px 12px;
      font-size: 11px;
      font-weight: 700;
      background: var(--card);
      border: 1px solid var(--card-border);
      border-radius: 20px;
      color: var(--sub);
      cursor: pointer;
    }
    .acc-tab.active {
      background: var(--cyan);
      border-color: var(--cyan);
      color: #000;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 12px;
      margin-bottom: 10px;
    }
    .card-title {
      font-size: 11px;
      font-weight: 800;
      color: var(--sub);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .price-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .price-box {
      background: rgba(0,0,0,0.3);
      padding: 8px;
      border-radius: 8px;
      text-align: center;
    }
    .price-val {
      font-family: ui-monospace, monospace;
      font-size: 20px;
      font-weight: 800;
      color: #fff;
    }
    .price-lbl {
      font-size: 10px;
      color: var(--sub);
    }
    .badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 800;
      font-family: ui-monospace, monospace;
    }
    .badge-green { background: var(--green-bg); color: var(--green); border: 1px solid rgba(16,185,129,0.3); }
    .badge-red { background: var(--red-bg); color: var(--red); border: 1px solid rgba(239,68,68,0.3); }
    .badge-cyan { background: rgba(6,182,212,0.15); color: var(--cyan); border: 1px solid rgba(6,182,212,0.3); }
    .pos-card {
      background: rgba(0,0,0,0.25);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 10px;
      padding: 10px;
      margin-bottom: 8px;
    }
    .pos-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }
    .pos-pnl {
      font-family: ui-monospace, monospace;
      font-size: 16px;
      font-weight: 800;
    }
    .pos-info {
      font-size: 11px;
      color: var(--sub);
      font-family: ui-monospace, monospace;
      margin-bottom: 8px;
    }
    .pos-ema {
      background: rgba(6,182,212,0.1);
      border: 1px solid rgba(6,182,212,0.2);
      padding: 4px 8px;
      border-radius: 6px;
      font-size: 11px;
      font-family: ui-monospace, monospace;
      color: var(--cyan);
      margin-bottom: 8px;
      display: flex;
      justify-content: space-between;
    }
    .btn-row {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 6px;
    }
    .btn {
      padding: 8px 4px;
      font-size: 10px;
      font-weight: 700;
      border-radius: 6px;
      border: 1px solid var(--card-border);
      background: rgba(255,255,255,0.05);
      color: #fff;
      cursor: pointer;
      text-align: center;
    }
    .btn:active { opacity: 0.7; }
    .btn-danger { background: var(--red-bg); color: var(--red); border-color: rgba(239,68,68,0.3); }
    .btn-be { background: rgba(245,158,11,0.15); color: var(--amber); border-color: rgba(245,158,11,0.3); }
    .rule-item {
      display: flex;
      justify-content: space-between;
      padding: 4px 0;
      border-bottom: 1px solid rgba(255,255,255,0.03);
      font-size: 11px;
    }
    .rule-item:last-child { border-bottom: none; }
    .progress-bar {
      height: 6px;
      background: rgba(255,255,255,0.08);
      border-radius: 3px;
      overflow: hidden;
      margin-top: 6px;
    }
    .progress-fill {
      height: 100%;
      background: var(--green);
      transition: width 0.3s;
    }
  </style>
</head>
<body>
  <div class="header-bar">
    <div class="title">⚡ TITAN MOBILE <span id="status-dot" style="width:8px; height:8px; border-radius:50%; background:var(--green); display:inline-block;"></span></div>
    <div class="view-switcher">
      <a id="link-mob" href="/mobile" class="view-btn active">📱 Normal</a>
      <a id="link-asc" href="/ascii" class="view-btn">📟 ASCII</a>
      <a id="link-dsk" href="/" class="view-btn">🖥️ Voll</a>
    </div>
  </div>

  <div class="account-tabs" id="account-tabs"></div>

  <!-- LIVE MARKET -->
  <div class="card">
    <div class="card-title">
      <span>Gold (XAUUSD)</span>
      <span class="badge badge-cyan" id="candle-timer">⏳ 00:00</span>
    </div>
    <div class="price-grid">
      <div class="price-box">
        <div class="price-lbl">BID (Verkauf)</div>
        <div class="price-val" id="live-bid">—</div>
      </div>
      <div class="price-box">
        <div class="price-lbl">ASK (Kauf)</div>
        <div class="price-val" id="live-ask">—</div>
      </div>
    </div>
    <div style="display:flex; justify-content:space-between; margin-top:8px; font-size:11px; color:var(--sub);">
      <span>Spread: <strong class="text-white" id="live-spread">—</strong></span>
      <span>Trend: <strong id="trend-label" class="badge badge-cyan">—</strong></span>
      <span>DE: <strong id="time-de">—</strong></span>
    </div>
  </div>

  <!-- RISK & DRAWDOWN -->
  <div class="card">
    <div class="card-title">
      <span>Tages-Risiko & Drawdown</span>
      <span id="dd-badge" class="badge badge-green">0.00%</span>
    </div>
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:12px; margin-bottom:6px;">
      <div>Balance: <strong id="acc-bal" style="color:#fff;">—</strong></div>
      <div>Equity: <strong id="acc-eq" style="color:#fff;">—</strong></div>
      <div>Verlust heute: <strong id="acc-loss" style="color:var(--red);">—</strong></div>
      <div>Puffer: <strong id="acc-buf" style="color:var(--green);">—</strong></div>
    </div>
    <div class="progress-bar">
      <div class="progress-fill" id="dd-fill" style="width: 0%;"></div>
    </div>
  </div>

  <!-- ACTIVE POSITIONS -->
  <div class="card">
    <div class="card-title">
      <span>Offene Positionen</span>
      <span id="pos-count" class="badge badge-cyan">0 Aktiv</span>
    </div>
    <div id="positions-list">
      <div style="text-align:center; padding:15px; color:var(--sub); font-size:12px;">Keine offenen Positionen</div>
    </div>
  </div>

  <!-- TREND RULES CHECKLIST -->
  <div class="card">
    <details>
      <summary style="cursor:pointer; font-size:11px; font-weight:800; color:var(--sub); text-transform:uppercase;">
        ▶ Strategie & M15 Indikatoren
      </summary>
      <div id="rules-list" style="margin-top:10px;"></div>
    </details>
  </div>

  <!-- TRADE JOURNAL TOTALS -->
  <div class="card">
    <div class="card-title">
      <span>Trade Journal Gesamt</span>
      <select id="journal-filter" onchange="switchJournalFilter(this.value)" style="background:rgba(0,0,0,0.4); color:#fff; border:1px solid var(--card-border); font-size:10px; border-radius:4px; padding:2px 4px;">
        <option value="all">Alle Konten</option>
        <option value="blueberry">Blueberry</option>
        <option value="titan">Titan 10k</option>
        <option value="xau5m_m5">M5 $250</option>
        <option value="titan_m5">Titan M5 $500</option>
      </select>
    </div>
    <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px; text-align:center;">
      <div class="price-box">
        <div class="price-lbl">Gesamt PnL</div>
        <div id="journal-tot" class="pos-pnl" style="font-size:13px; color:var(--green);">$0.00</div>
      </div>
      <div class="price-box">
        <div class="price-lbl">Live PnL</div>
        <div id="journal-live" class="pos-pnl" style="font-size:13px; color:var(--green);">$0.00</div>
      </div>
      <div class="price-box">
        <div class="price-lbl">Hist PnL</div>
        <div id="journal-hist" class="pos-pnl" style="font-size:13px; color:var(--green);">$0.00</div>
      </div>
    </div>
  </div>

  <script>
    const BASE_PATH = window.location.pathname.startsWith('/stt') ? '/stt' : '';
    let activeAccount = 'xau5m_m5';
    let accounts = {};
    let journalData = {};
    let activeJournalFilter = 'all';

    async function init() {
      try {
        const linkMob = document.getElementById('link-mob');
        if (linkMob) linkMob.href = BASE_PATH + '/mobile';
        const linkAsc = document.getElementById('link-asc');
        if (linkAsc) linkAsc.href = BASE_PATH + '/ascii';
        const linkDsk = document.getElementById('link-dsk');
        if (linkDsk) linkDsk.href = BASE_PATH + '/';

        const res = await fetch(BASE_PATH + '/api/accounts');
        const data = await res.json();
        accounts = Object.fromEntries(data.accounts.map(a => [a.id, a]));
        const saved = localStorage.getItem('titan_mobile_acc');
        if (saved && accounts[saved]) activeAccount = saved;
        else activeAccount = data.default || 'xau5m_m5';
        renderAccountTabs();
        update();
        setInterval(update, 1500);
        loadJournal();
        setInterval(loadJournal, 10000);
      } catch (e) {
        console.error('Init failed', e);
      }
    }

    function renderAccountTabs() {
      const container = document.getElementById('account-tabs');
      container.innerHTML = Object.values(accounts).map(acc => `
        <button class="acc-tab ${acc.id === activeAccount ? 'active' : ''}" onclick="selectAccount('${acc.id}')">
          ${acc.name.replace(/\\s*\\(.*?\\)/g, '')}
        </button>
      `).join('');
    }

    function selectAccount(id) {
      if (activeAccount === id) return;
      activeAccount = id;
      localStorage.setItem('titan_mobile_acc', id);
      renderAccountTabs();
      update();
    }

    async function update() {
      try {
        const res = await fetch(`${BASE_PATH}/api/status?account=${encodeURIComponent(activeAccount)}&include_journal=false`);
        if (!res.ok) throw new Error('Status Error');
        const d = await res.json();
        
        document.getElementById('live-bid').textContent = Number(d.bid).toFixed(2);
        document.getElementById('live-ask').textContent = Number(d.ask).toFixed(2);
        document.getElementById('live-spread').textContent = d.spread;
        document.getElementById('time-de').textContent = d.times?.german || '—';
        document.getElementById('candle-timer').textContent = '⏳ ' + (d.times?.bar_remaining_fmt || '00:00');
        
        const trendEl = document.getElementById('trend-label');
        trendEl.textContent = d.trend_direction || '—';
        trendEl.className = 'badge ' + (d.trend_direction === 'BULLISH' ? 'badge-green' : 'badge-red');

        // Risk & Drawdown
        if (d.daily_drawdown) {
          const dd = d.daily_drawdown;
          document.getElementById('acc-bal').textContent = '$' + Number(dd.balance).toFixed(2);
          document.getElementById('acc-eq').textContent = '$' + Number(dd.equity).toFixed(2);
          document.getElementById('acc-loss').textContent = '-$' + Number(dd.loss_usd).toFixed(2);
          document.getElementById('acc-buf').textContent = dd.buffer_usd !== null ? '$' + Number(dd.buffer_usd).toFixed(2) : 'Kein Limit';
          
          const pct = Number(dd.pct || 0);
          const ddBadge = document.getElementById('dd-badge');
          ddBadge.textContent = pct.toFixed(2) + '%';
          ddBadge.className = 'badge ' + (pct >= 3.0 ? 'badge-red' : pct >= 1.5 ? 'badge-cyan' : 'badge-green');
          document.getElementById('dd-fill').style.width = Math.min(100, (pct / 4.0) * 100) + '%';
          document.getElementById('dd-fill').style.background = pct >= 3.0 ? 'var(--red)' : pct >= 1.5 ? 'var(--amber)' : 'var(--green)';
        }

        // Positions
        renderPositions(d.positions || [], d.indicators?.ema9 || null);

        // Rules
        if (Array.isArray(d.rules_matrix)) {
          const rList = document.getElementById('rules-list');
          rList.innerHTML = d.rules_matrix.map(r => `
            <div class="rule-item">
              <span style="color:var(--sub);">${r.name}</span>
              <span class="badge ${r.short_met || r.long_met ? 'badge-green' : 'badge-red'}">
                ${r.current_val}
              </span>
            </div>
          `).join('');
        }
        document.getElementById('status-dot').style.background = 'var(--green)';
      } catch (err) {
        document.getElementById('status-dot').style.background = 'var(--red)';
      }
    }

    function renderPositions(positions, ema9) {
      const list = document.getElementById('positions-list');
      const count = document.getElementById('pos-count');
      count.textContent = `${positions.length} Aktiv`;
      if (!positions.length) {
        list.innerHTML = `<div style="text-align:center; padding:15px; color:var(--sub); font-size:12px;">Keine offenen Positionen</div>`;
        return;
      }
      list.innerHTML = positions.map(p => {
        const isProfit = p.profit_usd >= 0;
        const pnlColor = isProfit ? 'var(--green)' : 'var(--red)';
        const pnlSign = isProfit ? '+' : '';
        const target = p.target_usd || 28.0;
        const reached = p.profit_usd >= target;
        
        return `
          <div class="pos-card">
            <div class="pos-header">
              <span class="badge ${p.type === 'BUY' ? 'badge-green' : 'badge-red'}">${p.type} ${p.volume} Lot</span>
              <span class="pos-pnl" style="color:${pnlColor};">${pnlSign}$${p.profit_usd.toFixed(2)}</span>
            </div>
            <div class="pos-info">
              #${p.ticket} @ $${p.open_price.toFixed(2)} · Aktuell: $${p.current_price.toFixed(2)}
            </div>
            ${p.ema9 ? `
              <div class="pos-ema">
                <span>🎯 EMA9: <strong>$${p.ema9.toFixed(2)}</strong></span>
                <span>Abst: <strong>${p.dist_to_ema9 !== null ? p.dist_to_ema9.toFixed(2) + ' Pkt' : '—'}</strong></span>
                <span style="color:${reached ? 'var(--green)' : 'var(--amber)'}; font-weight:bold;">
                  ${reached ? '✅ Scharf' : '⏳ Noch $' + (target - p.profit_usd).toFixed(2)}
                </span>
              </div>
            ` : ''}
            <div class="btn-row">
              <button class="btn btn-be" onclick="quickBE(${p.ticket})">SL +5$</button>
              <button class="btn" onclick="quickSL(${p.ticket}, -50)">SL −50$</button>
              <button class="btn" onclick="quickTP(${p.ticket}, 50)">TP +50$</button>
              <button class="btn btn-danger" onclick="closePos(${p.ticket})">✕ Schließen</button>
            </div>
          </div>
        `;
      }).join('');
    }

    async function quickBE(ticket) {
      await fetch(BASE_PATH + '/api/modify_position?account=' + encodeURIComponent(activeAccount), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket, sl_usd: 5.0 })
      });
      update();
    }
    async function quickSL(ticket, usd) {
      await fetch(BASE_PATH + '/api/modify_position?account=' + encodeURIComponent(activeAccount), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket, sl_usd: usd })
      });
      update();
    }
    async function quickTP(ticket, usd) {
      await fetch(BASE_PATH + '/api/modify_position?account=' + encodeURIComponent(activeAccount), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket, tp_usd: usd })
      });
      update();
    }
    async function closePos(ticket) {
      if (!confirm('Position #' + ticket + ' wirklich schließen?')) return;
      await fetch(BASE_PATH + '/api/close_position?account=' + encodeURIComponent(activeAccount), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket })
      });
      update();
    }

    function switchJournalFilter(val) {
      activeJournalFilter = val;
      loadJournal();
    }

    async function loadJournal() {
      try {
        const wanted = activeJournalFilter === 'all' ? Object.keys(accounts) : [activeJournalFilter];
        let allEntries = [];
        for (const id of wanted) {
          try {
            const res = await fetch(BASE_PATH + '/api/journal_summary?account=' + encodeURIComponent(id));
            if (res.ok) {
              const d = await res.json();
              if (Array.isArray(d.journal)) allEntries.push(...d.journal);
            }
          } catch (_) {}
        }
        
        const live = allEntries.filter(it => it.status === 'OPEN');
        const closed = allEntries.filter(it => it.status === 'CLOSED');
        const tot = allEntries.reduce((s, it) => s + (Number.isFinite(it.profit_usd) ? it.profit_usd : 0), 0);
        const lPnl = live.reduce((s, it) => s + (Number.isFinite(it.profit_usd) ? it.profit_usd : 0), 0);
        const cPnl = closed.reduce((s, it) => s + (Number.isFinite(it.profit_usd) ? it.profit_usd : 0), 0);

        const formatPnL = (num, el) => {
          el.textContent = (num >= 0 ? '+' : '') + '$' + Math.abs(num).toFixed(2);
          el.style.color = num >= 0 ? 'var(--green)' : 'var(--red)';
        };

        formatPnL(tot, document.getElementById('journal-tot'));
        formatPnL(lPnl, document.getElementById('journal-live'));
        formatPnL(cPnl, document.getElementById('journal-hist'));
      } catch (e) {}
    }

    window.onload = init;
  </script>
</body>
</html>
"""


ASCII_HTML = """<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <title>TITAN ASCII TERMINAL</title>
  <style>
    :root {
      --bg: #050a06;
      --fg: #33ff66;
      --fg-dim: #1a883a;
      --fg-bright: #66ff99;
      --red: #ff3333;
      --amber: #ffb000;
      --cyan: #33ccff;
    }
    body.theme-amber {
      --bg: #0a0802;
      --fg: #ffb000;
      --fg-dim: #885e00;
      --fg-bright: #ffd266;
    }
    body.theme-cyan {
      --bg: #02080a;
      --fg: #00e5ff;
      --fg-dim: #007280;
      --fg-bright: #66efff;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--fg);
      font-family: "Courier New", Courier, Lucida Console, Monaco, ui-monospace, monospace;
      font-size: 13px;
      line-height: 1.25;
      padding: 10px;
      overflow-x: auto;
      text-shadow: 0 0 4px rgba(51,255,102,0.35);
    }
    body.theme-amber { text-shadow: 0 0 4px rgba(255,176,0,0.35); }
    body.theme-cyan { text-shadow: 0 0 4px rgba(0,229,255,0.35); }
    pre {
      font-family: inherit;
      white-space: pre;
    }
    .top-bar {
      margin-bottom: 8px;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
    }
    .top-bar a, .top-bar button {
      color: var(--fg-bright);
      background: transparent;
      border: 1px solid var(--fg);
      font-family: inherit;
      font-size: 11px;
      padding: 2px 6px;
      text-decoration: none;
      cursor: pointer;
      display: inline-block;
    }
    .top-bar a:hover, .top-bar button:hover {
      background: var(--fg);
      color: #000;
      text-shadow: none;
    }
    .top-bar .active-btn {
      background: var(--fg);
      color: #000 !important;
      font-weight: bold;
      text-shadow: none;
    }
    .btn {
      color: var(--fg-bright);
      background: rgba(255, 255, 255, 0.08);
      cursor: pointer;
      padding: 0;
      margin: 0;
      border: none;
      box-shadow: inset 0 0 0 1px var(--fg-dim);
      font-family: inherit;
      font-size: inherit;
      line-height: inherit;
      display: inline;
      user-select: none;
      text-decoration: none;
    }
    .btn:hover {
      background: var(--fg);
      color: #000 !important;
      text-shadow: none;
      box-shadow: none;
    }
    .btn.active-btn {
      background: var(--fg);
      color: #000 !important;
      font-weight: bold;
      text-shadow: none;
    }
    .btn.danger {
      color: var(--red);
      box-shadow: inset 0 0 0 1px var(--red);
    }
    .btn.danger:hover {
      background: var(--red);
      color: #000 !important;
    }
    .btn.cyan {
      color: var(--cyan);
      box-shadow: inset 0 0 0 1px var(--cyan);
    }
    .btn.cyan:hover {
      background: var(--cyan);
      color: #000 !important;
    }
    .btn.amber {
      color: var(--amber);
      box-shadow: inset 0 0 0 1px var(--amber);
    }
    .btn.amber:hover {
      background: var(--amber);
      color: #000 !important;
    }
    .scanlines {
      position: fixed;
      top: 0; left: 0; width: 100%; height: 100%;
      background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%);
      background-size: 100% 3px;
      pointer-events: none;
      z-index: 999;
      opacity: 0.5;
    }
  </style>
</head>
<body>
  <div class="scanlines"></div>

  <!-- NAVIGATION -->
  <div class="top-bar">
    <span>[ANSICHT]:</span>
    <a id="link-ascii" href="/ascii" class="active-btn">[📟 ASCII]</a>
    <a id="link-mobile" href="/mobile">[📱 NORMAL MOBILE]</a>
    <a id="link-desktop" href="/">[🖥️ DESKTOP VOLL]</a>
    <span style="margin-left:8px;">[FARBE]:</span>
    <button onclick="setTheme('green')">[GRÜN]</button>
    <button onclick="setTheme('amber')">[AMBER]</button>
    <button onclick="setTheme('cyan')">[CYAN]</button>
  </div>

  <div id="account-buttons" class="top-bar"></div>

  <pre id="terminal-screen">INITIALISIERE TITAN ASCII TERMINAL ...</pre>

  <script>
    const W = 82;
    const BASE_PATH = window.location.pathname.startsWith('/stt') ? '/stt' : '';

    let activeAccount = 'xau5m_m5';
    let accounts = {};
    let candles = [];
    let journalData = { all: [], byAccount: {}, errors: [] };
    let journalScope = 'all'; // 'all' or 'single'
    let journalLimit = 10;    // 10, 25, 0 (all)
    let posDetailMode = true; // true = detailed cards with EMA9 & exit rules, false = compact table

    function setTheme(t) {
      document.body.className = t === 'amber' ? 'theme-amber' : t === 'cyan' ? 'theme-cyan' : '';
      localStorage.setItem('ascii_theme', t);
    }
    const savedTheme = localStorage.getItem('ascii_theme');
    if (savedTheme) setTheme(savedTheme);

    function fit(str, len, align = 'left') {
      str = String(str ?? '');
      if (str.length > len) str = str.slice(0, len);
      if (align === 'right') return ' '.repeat(len - str.length) + str;
      if (align === 'center') {
        const l = Math.floor((len - str.length) / 2);
        return ' '.repeat(l) + str + ' '.repeat(len - str.length - l);
      }
      return str + ' '.repeat(len - str.length);
    }

    function row(c) {
      const plain = c.replace(/<[^>]+>/g, '');
      const diff = (W - 4) - plain.length;
      if (diff > 0) return '│ ' + c + ' '.repeat(diff) + ' │\\n';
      return '│ ' + c + ' │\\n';
    }

    function bTop(t) {
      const title = t ? ' ' + t + ' ' : '';
      const rem = W - 2 - 2 - title.length;
      return '┌──' + title + '─'.repeat(Math.max(0, rem)) + '┐\\n';
    }

    function bDiv(t = '') {
      if (!t) return '├' + '─'.repeat(W - 2) + '┤\\n';
      const title = ' ' + t + ' ';
      const rem = W - 2 - 2 - title.length;
      return '├──' + title + '─'.repeat(Math.max(0, rem)) + '┤\\n';
    }

    function bBot() {
      return '└' + '─'.repeat(W - 2) + '┘\\n';
    }

    function hTop(t) {
      const title = t ? ' ' + t + ' ' : '';
      const rem = W - 2 - 2 - title.length;
      return '╔══' + title + '═'.repeat(Math.max(0, rem)) + '╗\\n';
    }

    function hRow(c) {
      const plain = c.replace(/<[^>]+>/g, '');
      const diff = (W - 4) - plain.length;
      if (diff > 0) return '║ ' + c + ' '.repeat(diff) + ' ║\\n';
      return '║ ' + c + ' ║\\n';
    }

    function hBot() {
      return '╚' + '═'.repeat(W - 2) + '╝\\n';
    }

    function btn(label, fn, cls = '') {
      return `<span class="btn ${cls}" onclick="${fn}">${label}</span>`;
    }

    async function init() {
      try {
        const linkAsc = document.getElementById('link-ascii');
        if (linkAsc) linkAsc.href = BASE_PATH + '/ascii';
        const linkMob = document.getElementById('link-mobile');
        if (linkMob) linkMob.href = BASE_PATH + '/mobile';
        const linkDsk = document.getElementById('link-desktop');
        if (linkDsk) linkDsk.href = BASE_PATH + '/';

        const res = await fetch(BASE_PATH + '/api/accounts');
        const data = await res.json();
        accounts = Object.fromEntries(data.accounts.map(a => [a.id, a]));
        const saved = localStorage.getItem('titan_mobile_acc');
        if (saved && accounts[saved]) activeAccount = saved;
        else activeAccount = data.default || 'xau5m_m5';
        renderAccountButtons();
        update();
        setInterval(update, 1500);
        loadCandles();
        setInterval(loadCandles, 5000);
        loadJournalData();
        setInterval(loadJournalData, 5000);
      } catch (e) {
        document.getElementById('terminal-screen').textContent = 'ERROR CONNECTING TO BACKEND: ' + e.message;
      }
    }

    function renderAccountButtons() {
      const container = document.getElementById('account-buttons');
      container.innerHTML = '<span>[KONTEN]:</span> ' + Object.values(accounts).map(acc => {
        let label = acc.name;
        if (acc.id === 'blueberry') label = 'Blueberry (Prop 10k)';
        else if (acc.id === 'titan') label = 'Titan (Demo 10k)';
        else if (acc.id === 'xau5m_m5') label = 'PU Prime ($250 M5)';
        else if (acc.id === 'titan_m5') label = 'PU Prime ($500 M5)';
        else if (acc.id === 'xau5m_500') label = 'PU Prime ($500 M15)';
        return `
          <button class="${acc.id === activeAccount ? 'active-btn' : ''}" onclick="selectAccount('${acc.id}')">
            ${label}
          </button>
        `;
      }).join('');
    }

    function selectAccount(id) {
      activeAccount = id;
      localStorage.setItem('titan_mobile_acc', id);
      renderAccountButtons();
      loadCandles();
      update();
    }

    function togglePosDetail() {
      posDetailMode = !posDetailMode;
      update();
    }

    function setJournalScope(scope) {
      journalScope = scope;
      update();
    }

    function setJournalLimit(limit) {
      journalLimit = limit;
      update();
    }

    async function loadCandles() {
      try {
        const tf = accounts[activeAccount]?.timeframe || 'M15';
        const res = await fetch(`${BASE_PATH}/api/candles?account=${encodeURIComponent(activeAccount)}&timeframe=${tf}&limit=16`);
        if (res.ok) {
          const d = await res.json();
          if (Array.isArray(d.candles)) candles = d.candles;
        }
      } catch (_) {}
    }

    async function loadJournalData() {
      try {
        const wanted = Object.keys(accounts);
        let all = [];
        let byAcc = {};
        let errs = [];
        for (const id of wanted) {
          try {
            const res = await fetch(BASE_PATH + '/api/journal_summary?account=' + encodeURIComponent(id));
            if (res.ok) {
              const d = await res.json();
              if (Array.isArray(d.journal)) {
                all.push(...d.journal);
                byAcc[id] = d.journal;
              }
            } else {
              errs.push(id);
            }
          } catch (_) {
            errs.push(id);
          }
        }
        all.sort((a, b) => (b.time_ts || 0) - (a.time_ts || 0));
        journalData = { all, byAccount: byAcc, errors: errs };
      } catch (_) {}
    }

    function renderAsciiChart(candleList) {
      const tf = accounts[activeAccount]?.timeframe || 'M15';
      if (!candleList || candleList.length < 4) {
        return row('  [ASCII CANDLE CHART WIRD GELADEN...]');
      }
      const last = candleList.slice(-16);
      const highs = last.map(c => Number(c.high));
      const lows = last.map(c => Number(c.low));
      const minP = Math.min(...lows);
      const maxP = Math.max(...highs);
      const range = (maxP - minP) || 1.0;
      const rows = 6;

      let out = '';
      for (let r = rows - 1; r >= 0; r--) {
        const levelPrice = minP + (r / (rows - 1)) * range;
        let line = fit(levelPrice.toFixed(1), 7, 'right') + ' ┤ ';
        for (const c of last) {
          const o = Number(c.open);
          const cl = Number(c.close);
          const h = Number(c.high);
          const l = Number(c.low);
          const isGreen = cl >= o;
          const bodyTop = Math.max(o, cl);
          const bodyBot = Math.min(o, cl);
          const rowPriceTop = minP + ((r + 0.5) / rows) * range;
          const rowPriceBot = minP + ((r - 0.5) / rows) * range;

          if (h >= rowPriceBot && l <= rowPriceTop) {
            if (bodyTop >= rowPriceBot && bodyBot <= rowPriceTop) {
              line += isGreen ? '█ ' : '░ ';
            } else {
              line += '│ ';
            }
          } else {
            line += '  ';
          }
        }
        let rightSide = '';
        if (r === 5) rightSide = '  MAX: $' + maxP.toFixed(2);
        else if (r === 4) rightSide = '  MIN: $' + minP.toFixed(2);
        else if (r === 3) rightSide = '  SPANNE: ' + range.toFixed(2) + ' Pkt';
        else if (r === 2) rightSide = '  ZEITFENSTER: ' + tf;
        else if (r === 1) rightSide = '  █ = BULLISCH';
        else if (r === 0) rightSide = '  ░ = BÄRISCH / │ = DOCHT';
        line += fit(rightSide, 35);
        out += row(line);
      }
      const botAxis = '        └' + '──'.repeat(last.length) + fit('  [JÜNGSTE KERZEN RECHTS]', 35);
      out += row(botAxis);
      return out;
    }

    async function update() {
      try {
        const res = await fetch(`${BASE_PATH}/api/status?account=${encodeURIComponent(activeAccount)}&include_journal=false`);
        if (!res.ok) throw new Error('Status Fehler (HTTP ' + res.status + ')');
        const d = await res.json();

        const bid = Number(d.bid || 0).toFixed(2);
        const ask = Number(d.ask || 0).toFixed(2);
        const spread = d.spread ?? 0;
        const trend = (d.trend_direction || 'NEUTRAL');
        const remaining = d.times?.bar_remaining_fmt || '00:00';
        const deTime = d.times?.german || '00:00:00';
        const dd = d.daily_drawdown || {};
        const bal = Number(dd.balance || 0).toFixed(2);
        const eq = Number(dd.equity || 0).toFixed(2);
        const loss = Number(dd.loss_usd || 0).toFixed(2);
        const pct = Number(dd.pct || 0).toFixed(2);
        const tf = d.account?.timeframe || accounts[activeAccount]?.timeframe || 'M15';
        const rsi = d.indicators?.rsi14 ? Number(d.indicators.rsi14).toFixed(1) : '—';
        const ema9Global = (d.indicators?.ema9 !== undefined && d.indicators?.ema9 !== null)
          ? '$' + Number(d.indicators.ema9).toFixed(2)
          : (d.positions?.[0]?.ema9 ? '$' + Number(d.positions[0].ema9).toFixed(2) : '—');

        const accName = d.account?.name || accounts[activeAccount]?.name || activeAccount;

        // 1. TERMINAL HEADER
        let screen = hTop('TITAN PRO INSTITUTIONAL GOLD TERMINAL [ASCII EDITION v7.10]');
        screen += hRow(`KONTO: ${fit(accName, 42)} SERVER/DE: ${deTime} (${tf})`);
        screen += hBot();
        screen += '\\n';

        // 2. LIVE MARKT
        screen += bTop('LIVE MARKT (XAUUSD)');
        screen += row(`BID: $${fit(bid, 9)} │ ASK: $${fit(ask, 9)} │ SPREAD: ${fit(String(spread), 4)} │ KERZE (${tf}): ${remaining}`);
        screen += row(`TREND: [${fit(trend, 8)}] │ EMA9: ${fit(ema9Global, 9)} │ RSI(14): ${fit(rsi, 5)} │ STATUS: LIVE TICK FREIGABE`);
        screen += bBot();
        screen += '\\n';

        // 3. CANDLE CHART
        screen += bTop(`16-BAR ASCII CANDLE CHART (${tf})`);
        screen += renderAsciiChart(candles);
        screen += bBot();
        screen += '\\n';

        // 4. RISK & DRAWDOWN
        screen += bTop('TAGES-RISIKO & KONTOSTATUS');
        const bufferStr = dd.buffer_usd !== null && dd.buffer_usd !== undefined ? '$' + Number(dd.buffer_usd).toFixed(2) : 'KEIN LIMIT';
        screen += row(`BALANCE: $${fit(bal, 10)} │ EQUITY: $${fit(eq, 10)} │ HEUTIGER VERLUST: -$${fit(loss, 8)}`);
        screen += row(`DRAWDOWN: ${fit(pct + '%', 8)} │ PUFFER: ${fit(bufferStr, 11)} │ STATUS: ${pct > 4.0 ? '[WARNUNG / LIMIT]' : '[OK: IM RISIKORAHMEN]'}`);
        screen += bBot();
        screen += '\\n';

        // 5. OFFENE POSITIONEN MIT EMA9-ABSTAND & AUSSTIEGS-REGELN
        const positions = d.positions || [];
        const posToggleBtn = btn(posDetailMode ? '[ANSICHT: KOMPAKT]' : '[ANSICHT: DETAIL]', 'togglePosDetail()', 'cyan');
        screen += bTop(`OFFENE POSITIONEN (${positions.length} AKTIV) │ ${posToggleBtn}`);

        if (positions.length === 0) {
          screen += row('KEINE OFFENEN POSITIONEN IM MARKT AUF DIESEM KONTO');
        } else if (!posDetailMode) {
          screen += row('#TICKET     TYP   LOT   OPEN      LIVE      EMA9-ABST   P&L (USD)  AKTION');
          screen += bDiv();
          for (const p of positions) {
            const tick = fit('#' + p.ticket, 11);
            const typ = fit(p.type, 5);
            const lot = fit(Number(p.volume).toFixed(2), 5);
            const op = fit('$' + p.open_price.toFixed(2), 9);
            const cp = fit('$' + p.current_price.toFixed(2), 9);
            const dist = fit(p.dist_to_ema9 !== null && p.dist_to_ema9 !== undefined ? (p.dist_to_ema9.toFixed(1) + 'pt') : '—', 10);
            const pnl = fit((p.profit_usd >= 0 ? '+' : '') + '$' + p.profit_usd.toFixed(2), 10, 'right');
            const clBtn = btn('[X SCHLIESSEN]', `closePos(${p.ticket})`, 'danger');
            screen += row(`${tick} ${typ} ${lot} ${op} ${cp} ${dist} ${pnl}  ${clBtn}`);
          }
        } else {
          for (let i = 0; i < positions.length; i++) {
            const p = positions[i];
            if (i > 0) screen += bDiv();
            const tick = fit('#' + p.ticket, 11);
            const typ = fit(p.type, 5);
            const lot = fit(Number(p.volume).toFixed(2) + ' Lot', 9);
            const op = fit('OPEN: $' + p.open_price.toFixed(2), 16);
            const cp = fit('LIVE: $' + p.current_price.toFixed(2), 16);
            const pnlSign = p.profit_usd >= 0 ? '+' : '';
            const pnlStr = fit(`${pnlSign}$${p.profit_usd.toFixed(2)} (${p.profit_pct >= 0 ? '+' : ''}${p.profit_pct.toFixed(1)}%)`, 18, 'right');
            screen += row(`${tick} ${typ} ${lot} ${op} ${cp} ${pnlStr}`);

            const ema9Val = p.ema9 ? '$' + Number(p.ema9).toFixed(2) : (ema9Global !== '—' ? ema9Global : '—');
            let distText = '—';
            if (p.dist_to_ema9 !== null && p.dist_to_ema9 !== undefined) {
              const rel = p.ema9 ? (p.current_price > p.ema9 ? 'unter Kurs' : 'über Kurs') : '';
              distText = `${Number(p.dist_to_ema9).toFixed(2)} Pkt ${rel ? '(' + rel + ')' : ''}`;
            }
            const targetUsd = p.target_usd || 28.0;
            screen += row(`  [EMA9-ZIEL]: ${fit(ema9Val, 9)} │ ABSTAND: ${fit(distText, 25)} │ MIN-ZIEL: $${targetUsd.toFixed(0)}`);

            const isReady = p.profit_usd >= targetUsd;
            let exitStatus = '';
            if (isReady) {
              exitStatus = `AUSSTIEG: [✅ MIN-GEWINN ERREICHT (+$${p.profit_usd.toFixed(2)} >= $${targetUsd.toFixed(0)}) · SCHLIESST BEI EMA9]`;
            } else {
              const diff = (targetUsd - p.profit_usd).toFixed(2);
              exitStatus = `AUSSTIEG: [⏳ MIN-GEWINN OFFEN: +$${p.profit_usd.toFixed(2)} / $${targetUsd.toFixed(0)} · NOCH $${diff} BIS ZIEL]`;
            }
            screen += row('  ' + exitStatus);

            const slStr = p.sl_price ? `SL: $${p.sl_price.toFixed(2)} (${p.sl_usd ? (p.sl_usd >= 0 ? '+' : '') + '$' + p.sl_usd.toFixed(2) : ''})` : 'SL: KEINER';
            const btnBE = btn('[SL +5$]', `quickBE(${p.ticket})`, 'cyan');
            const btnSL = btn('[SL -50$]', `quickSL(${p.ticket}, -50)`);
            const btnTP = btn('[TP +50$]', `quickTP(${p.ticket}, 50)`);
            const btnClose = btn('[X SCHLIESSEN]', `closePos(${p.ticket})`, 'danger');
            screen += row(`  ${fit(slStr, 25)} │ AKTIONEN: ${btnBE} ${btnSL} ${btnTP} ${btnClose}`);
          }
        }
        screen += bBot();
        screen += '\\n';

        // 6. TRADE JOURNAL (GESAMT vs EINZELN)
        const entries = (journalScope === 'all')
          ? journalData.all
          : (journalData.byAccount[activeAccount] || []);

        const totPnL = entries.reduce((s, it) => s + (Number.isFinite(it.profit_usd) ? it.profit_usd : 0), 0);
        const livePnL = entries.filter(it => it.status === 'OPEN').reduce((s, it) => s + (it.profit_usd || 0), 0);
        const histPnL = entries.filter(it => it.status === 'CLOSED').reduce((s, it) => s + (it.profit_usd || 0), 0);
        const okAccs = Object.keys(accounts).length - journalData.errors.length;

        const btnScopeAll = btn(journalScope === 'all' ? '[● GESAMT (ALLE KONTEN)]' : '[○ GESAMT (ALLE)]', `setJournalScope('all')`, journalScope === 'all' ? 'active-btn' : '');
        const btnScopeSingle = btn(journalScope === 'single' ? `[● NUR DIESES KONTO]` : `[○ NUR DIESES KONTO]`, `setJournalScope('single')`, journalScope === 'single' ? 'active-btn' : '');
        const btnL10 = btn(journalLimit === 10 ? '[● 10]' : '[○ 10]', 'setJournalLimit(10)');
        const btnL25 = btn(journalLimit === 25 ? '[● 25]' : '[○ 25]', 'setJournalLimit(25)');
        const btnLAll = btn(journalLimit === 0 ? '[● ALLE]' : '[○ ALLE]', 'setJournalLimit(0)');

        screen += bTop('TRADE JOURNAL & PORTFOLIO-HISTORIE');
        screen += row(`FILTER: ${btnScopeAll} ${btnScopeSingle} │ LIMIT: ${btnL10} ${btnL25} ${btnLAll}`);
        screen += bDiv();

        const totStr = (totPnL >= 0 ? '+' : '') + '$' + totPnL.toFixed(2);
        const liveStr = (livePnL >= 0 ? '+' : '') + '$' + livePnL.toFixed(2);
        const histStr = (histPnL >= 0 ? '+' : '') + '$' + histPnL.toFixed(2);
        screen += row(`GESAMT: ${fit(totStr, 12)} │ LIVE: ${fit(liveStr, 12)} │ HISTORISCH: ${fit(histStr, 12)}`);
        screen += row(`TRADES: ${fit(entries.length + ' GELADEN', 12)} │ KONTEN: ${fit(okAccs + '/' + Object.keys(accounts).length + ' ONLINE', 12)} │ MODUS: ${journalScope === 'all' ? 'ALLE KONTEN' : accName}`);
        screen += bDiv('GELISTETE TRADES');

        if (entries.length === 0) {
          screen += row('KEINE TRADES IM GEWÄHLTEN JOURNAL VERZEICHNET');
        } else {
          screen += row('#TICKET     KONTO      TYP  LOT   OPEN       CLOSE/AKT  P&L (USD)  STATUS');
          screen += bDiv();
          const displayList = journalLimit > 0 ? entries.slice(0, journalLimit) : entries;
          for (const it of displayList) {
            const tick = fit('#' + it.ticket, 11);
            const accTag = fit(it.account || activeAccount, 10);
            const typ = fit(it.type, 4);
            const lot = fit(Number(it.volume).toFixed(2), 5);
            const op = fit('$' + Number(it.open_price).toFixed(2), 10);
            const cp = fit('$' + Number(it.close_price || it.current_price).toFixed(2), 10);
            const pnl = fit((it.profit_usd >= 0 ? '+' : '') + '$' + Number(it.profit_usd).toFixed(2), 10, 'right');
            const st = fit(it.status, 6);
            screen += row(`${tick} ${accTag} ${typ} ${lot} ${op} ${cp} ${pnl}  ${st}`);
          }
          if (journalLimit > 0 && entries.length > journalLimit) {
            screen += row(`... ${entries.length - journalLimit} WEITERE TRADES (KLICKE [ALLE] FÜR VOLLSTÄNDIGE HISTORIE)`);
          }
        }
        screen += bBot();

        document.getElementById('terminal-screen').innerHTML = screen;
      } catch (err) {
        // Do not wipe screen on transient network glitches
      }
    }

    async function quickBE(ticket) {
      await fetch(BASE_PATH + '/api/modify_position?account=' + encodeURIComponent(activeAccount), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket, sl_usd: 5.0 })
      });
      update();
    }
    async function quickSL(ticket, usd) {
      await fetch(BASE_PATH + '/api/modify_position?account=' + encodeURIComponent(activeAccount), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket, sl_usd: usd })
      });
      update();
    }
    async function quickTP(ticket, usd) {
      await fetch(BASE_PATH + '/api/modify_position?account=' + encodeURIComponent(activeAccount), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket, tp_usd: usd })
      });
      update();
    }
    async function closePos(ticket) {
      if (!confirm('Position #' + ticket + ' schließen?')) return;
      await fetch(BASE_PATH + '/api/close_position?account=' + encodeURIComponent(activeAccount), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket })
      });
      update();
    }

    window.onload = init;
  </script>
</body>
</html>
"""

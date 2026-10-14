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
    .btn-pct { background: rgba(255,255,255,0.08); padding: 6px 3px; font-size: 10px; font-weight: 700; }
    .pos-sl-tp {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
      margin-bottom: 8px;
      background: rgba(255,255,255,0.03);
      padding: 6px 8px;
      border-radius: 6px;
      font-size: 11px;
      font-family: ui-monospace, monospace;
    }
    .sl-tp-row { display: flex; flex-direction: column; gap: 2px; }
    .sl-tp-lbl { color: var(--sub); font-size: 10px; font-weight: bold; }
    .sl-tp-val { font-weight: bold; }
    .pos-controls-row {
      display: flex;
      gap: 4px;
      align-items: center;
      margin-bottom: 6px;
      font-family: ui-monospace, monospace;
      font-size: 11px;
    }
    .pos-input {
      background: rgba(0,0,0,0.4);
      border: 1px solid var(--card-border);
      color: #fff;
      border-radius: 4px;
      padding: 4px 6px;
      font-size: 11px;
      font-family: ui-monospace, monospace;
      text-align: center;
    }
    .pos-input-lot { width: 62px; }
    .pos-input-usd { width: 66px; }
    .sound-badge {
      font-size: 10px;
      font-weight: 700;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 6px;
      border: 1px solid rgba(255,255,255,0.1);
      background: rgba(255,255,255,0.05);
      color: #fff;
    }
    .sound-badge.active {
      border-color: rgba(34,197,94,0.4);
      background: rgba(34,197,94,0.15);
      color: var(--green);
    }
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
      <button id="mob-sound-btn" class="sound-badge active" onclick="toggleMobAudio()" title="Arcade Sounds an/aus">🔊 Ton</button>
      <a id="link-mob" href="/mobile" class="view-btn active">📱 Normal</a>
      <a id="link-asc" href="/ascii" class="view-btn">📟 ASCII</a>
      <a id="link-dsk" href="/" class="view-btn">🖥️ Voll</a>
    </div>
  </div>

  <div style="display:flex; justify-content:center; gap:6px; margin:4px 0 8px 0; font-family:ui-monospace,monospace;">
    <button class="btn" style="padding:4px 8px; font-size:10px; background:rgba(6,182,212,0.1); border-color:rgba(6,182,212,0.3); color:var(--cyan);" onclick="ArcadeAudio.unlock(); ArcadeAudio.playTradeSound()">⚡ Trade Sound</button>
    <button class="btn" style="padding:4px 8px; font-size:10px; background:rgba(34,197,94,0.1); border-color:rgba(34,197,94,0.3); color:var(--green);" onclick="ArcadeAudio.unlock(); ArcadeAudio.playWinSound()">✦ Gewinn Sound</button>
    <button class="btn" style="padding:4px 8px; font-size:10px; background:rgba(239,68,68,0.1); border-color:rgba(239,68,68,0.3); color:var(--red);" onclick="ArcadeAudio.unlock(); ArcadeAudio.playSlSound()">💥 SL Sound</button>
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
    <details open>
      <summary style="cursor:pointer; font-size:11px; font-weight:800; color:var(--sub); text-transform:uppercase; display:flex; justify-content:space-between; align-items:center;">
        <span>🎯 Strategie & Indikatoren</span>
        <span id="mob-rule-summary" class="badge badge-cyan">Lade...</span>
      </summary>

      <!-- Readiness Bars (Short & Long) -->
      <div style="margin-top:10px; display:grid; grid-template-columns:1fr 1fr; gap:6px;">
        <div style="background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.25); border-radius:8px; padding:6px 8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; font-size:10px; font-weight:bold; margin-bottom:4px;">
            <span style="color:var(--red);">SHORT</span>
            <span id="mob-sell-readiness" style="color:var(--red); font-family:ui-monospace,monospace;">0/8 (0%)</span>
          </div>
          <div class="progress-bar" style="margin-top:0; height:5px;">
            <div class="progress-fill" id="mob-sell-bar" style="width:0%; background:var(--red);"></div>
          </div>
        </div>

        <div style="background:rgba(34,197,94,0.08); border:1px solid rgba(34,197,94,0.25); border-radius:8px; padding:6px 8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; font-size:10px; font-weight:bold; margin-bottom:4px;">
            <span style="color:var(--green);">LONG</span>
            <span id="mob-buy-readiness" style="color:var(--green); font-family:ui-monospace,monospace;">0/8 (0%)</span>
          </div>
          <div class="progress-bar" style="margin-top:0; height:5px;">
            <div class="progress-fill" id="mob-buy-bar" style="width:0%; background:var(--green);"></div>
          </div>
        </div>
      </div>

      <!-- Live Diagnosis / Status Text -->
      <div id="mob-trend-diag" style="margin-top:8px; padding:6px 8px; border-radius:6px; background:rgba(255,255,255,0.03); border:1px solid var(--card-border); font-size:11px; line-height:1.4; color:#fff;">
        Lade Strategie-Status...
      </div>

      <!-- Filter Buttons -->
      <div style="display:flex; gap:4px; margin-top:8px;">
        <button id="rule-tab-all" class="btn" style="flex:1; padding:4px; font-size:10px; background:rgba(6,182,212,0.15); border-color:rgba(6,182,212,0.4); color:var(--cyan);" onclick="setRuleFilter('all')">Alle (8)</button>
        <button id="rule-tab-short" class="btn" style="flex:1; padding:4px; font-size:10px;" onclick="setRuleFilter('short')">Nur Short</button>
        <button id="rule-tab-long" class="btn" style="flex:1; padding:4px; font-size:10px;" onclick="setRuleFilter('long')">Nur Long</button>
      </div>

      <!-- Detailed Rules List -->
      <div id="rules-list" style="margin-top:8px; display:flex; flex-direction:column; gap:6px;"></div>
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
    let soundEnabled = localStorage.getItem('titan_sound_enabled') !== 'false';
    let tradeObserverInitialized = false;
    let prevSeenTickets = new Set();
    let journalInitialized = false;
    let prevJournalCount = 0;
    let currentRuleFilter = 'all';
    let lastStatusData = null;

    const ArcadeAudio = (() => {
      let ctx = null;
      function getContext() {
        if (!ctx) {
          const A = window.AudioContext || window.webkitAudioContext;
          if (A) ctx = new A();
        }
        return ctx;
      }
      function unlock() {
        const c = getContext();
        if (c && c.state === 'suspended') c.resume().catch(() => {});
      }
      if (typeof window !== 'undefined') {
        ['click', 'keydown', 'touchstart', 'pointerdown'].forEach(e => {
          window.addEventListener(e, unlock, { once: true, passive: true });
        });
      }
      function runAudio(fn) {
        if (!soundEnabled) return;
        try {
          const c = getContext(); if (!c) return;
          const play = () => {
            try {
              const t0 = c.currentTime + 0.03;
              fn(c, t0);
            } catch (err) { console.warn('Mobile audio render error:', err); }
          };
          if (c.state === 'suspended') {
            c.resume().then(play).catch(err => console.warn('Audio resume error:', err));
          } else {
            play();
          }
        } catch (err) { console.warn('Audio context error:', err); }
      }
      function playTradeSound() {
        runAudio((c, t0) => {
          const o1 = c.createOscillator(), g1 = c.createGain();
          o1.type = 'sine'; o1.frequency.setValueAtTime(987.77, t0); o1.frequency.setValueAtTime(1318.51, t0 + 0.08);
          g1.gain.setValueAtTime(0.001, t0); g1.gain.exponentialRampToValueAtTime(0.35, t0 + 0.02); g1.gain.exponentialRampToValueAtTime(0.001, t0 + 0.30);
          o1.connect(g1); g1.connect(c.destination); o1.start(t0); o1.stop(t0 + 0.31);
          const o2 = c.createOscillator(), flt = c.createBiquadFilter(), g2 = c.createGain();
          o2.type = 'triangle'; flt.type = 'lowpass'; flt.frequency.setValueAtTime(2800, t0);
          o2.frequency.setValueAtTime(440, t0); o2.frequency.exponentialRampToValueAtTime(880, t0 + 0.14);
          g2.gain.setValueAtTime(0.001, t0); g2.gain.linearRampToValueAtTime(0.28, t0 + 0.02); g2.gain.exponentialRampToValueAtTime(0.001, t0 + 0.25);
          o2.connect(flt); flt.connect(g2); g2.connect(c.destination); o2.start(t0); o2.stop(t0 + 0.26);
        });
      }
      function playWinSound() {
        runAudio((c, t0) => {
          const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51, 1567.98];
          notes.forEach((freq, i) => {
            const osc = c.createOscillator(), g = c.createGain(), st = t0 + i * 0.07;
            osc.type = 'triangle'; osc.frequency.setValueAtTime(freq, st);
            g.gain.setValueAtTime(0.001, st); g.gain.exponentialRampToValueAtTime(0.32, st + 0.01); g.gain.exponentialRampToValueAtTime(0.001, st + 0.25);
            osc.connect(g); g.connect(c.destination); osc.start(st); osc.stop(st + 0.26);
          });
          const coinDts = [0.44, 0.53, 0.62, 0.72, 0.83];
          const coinP = [2093.0, 2637.0, 2093.0, 3136.0, 2637.0];
          coinDts.forEach((dt, i) => {
            const osc = c.createOscillator(), g = c.createGain(), st = t0 + dt;
            osc.type = 'sine'; osc.frequency.setValueAtTime(coinP[i], st);
            g.gain.setValueAtTime(0.001, st); g.gain.exponentialRampToValueAtTime(0.30, st + 0.008); g.gain.exponentialRampToValueAtTime(0.001, st + 0.18);
            osc.connect(g); g.connect(c.destination); osc.start(st); osc.stop(st + 0.19);
          });
        });
      }
      function playSlSound() {
        runAudio((c, t0) => {
          const steps = [{ freq: 349.23, dur: 0.10 }, { freq: 293.66, dur: 0.10 }, { freq: 220.00, dur: 0.12 }, { freq: 146.83, dur: 0.30 }];
          let cur = t0;
          steps.forEach(st => {
            const osc = c.createOscillator(), g = c.createGain();
            osc.type = 'sawtooth'; osc.frequency.setValueAtTime(st.freq, cur);
            g.gain.setValueAtTime(0.001, cur); g.gain.exponentialRampToValueAtTime(0.32, cur + 0.01); g.gain.exponentialRampToValueAtTime(0.001, cur + st.dur);
            osc.connect(g); g.connect(c.destination); osc.start(cur); osc.stop(cur + st.dur + 0.01);
            cur += st.dur;
          });
          try {
            const bufLen = Math.floor(c.sampleRate * 0.35), buf = c.createBuffer(1, bufLen, c.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (c.sampleRate * 0.07));
            const noise = c.createBufferSource(); noise.buffer = buf;
            const flt = c.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.setValueAtTime(900, t0); flt.frequency.linearRampToValueAtTime(140, t0 + 0.35);
            const gn = c.createGain(); gn.gain.setValueAtTime(0.26, t0); gn.gain.exponentialRampToValueAtTime(0.001, t0 + 0.35);
            noise.connect(flt); flt.connect(gn); gn.connect(c.destination); noise.start(t0); noise.stop(t0 + 0.36);
          } catch (_) {}
        });
      }
      return { playTradeSound, playWinSound, playSlSound, unlock };
    })();

    function syncMobSoundBtn() {
      const btn = document.getElementById('mob-sound-btn');
      if (btn) {
        btn.textContent = soundEnabled ? '🔊 Ton: AN' : '🔇 Ton: AUS';
        btn.classList.toggle('active', soundEnabled);
      }
    }

    function toggleMobAudio() {
      ArcadeAudio.unlock();
      soundEnabled = !soundEnabled;
      localStorage.setItem('titan_sound_enabled', String(soundEnabled));
      syncMobSoundBtn();
      if (soundEnabled) ArcadeAudio.playTradeSound();
    }

    async function init() {
      try {
        syncMobSoundBtn();
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
        const positions = d.positions || [];
        const curTickets = new Set(positions.map(p => p.ticket));
        if (tradeObserverInitialized) {
          for (const p of positions) {
            if (!prevSeenTickets.has(p.ticket)) {
              ArcadeAudio.playTradeSound();
              break;
            }
          }
        }
        tradeObserverInitialized = true;
        prevSeenTickets = curTickets;

        renderPositions(positions, d.indicators?.ema9 || null);

        // Rules
        lastStatusData = d;
        renderRules(d);
        document.getElementById('status-dot').style.background = 'var(--green)';
      } catch (err) {
        document.getElementById('status-dot').style.background = 'var(--red)';
      }
    }

    function setRuleFilter(filter) {
      currentRuleFilter = filter;
      ['all', 'short', 'long'].forEach(f => {
        const btn = document.getElementById(`rule-tab-${f}`);
        if (btn) {
          if (f === filter) {
            btn.style.background = 'rgba(6,182,212,0.2)';
            btn.style.borderColor = 'rgba(6,182,212,0.5)';
            btn.style.color = 'var(--cyan)';
          } else {
            btn.style.background = 'rgba(255,255,255,0.05)';
            btn.style.borderColor = 'var(--card-border)';
            btn.style.color = '#fff';
          }
        }
      });
      if (lastStatusData) renderRules(lastStatusData);
    }

    function renderRules(d) {
      if (!Array.isArray(d?.rules_matrix)) return;
      const sellMet = d.sell_met_count !== undefined ? d.sell_met_count : d.rules_matrix.filter(r => r.short_met).length;
      const buyMet = d.buy_met_count !== undefined ? d.buy_met_count : d.rules_matrix.filter(r => r.long_met).length;
      const total = d.rule_count || d.rules_matrix.length || 8;
      const sellPct = d.sell_readiness !== undefined ? d.sell_readiness : Math.round((sellMet / total) * 100);
      const buyPct = d.buy_readiness !== undefined ? d.buy_readiness : Math.round((buyMet / total) * 100);

      const sellReadEl = document.getElementById('mob-sell-readiness');
      if (sellReadEl) sellReadEl.textContent = `${sellMet}/${total} (${sellPct}%)`;
      const sellBarEl = document.getElementById('mob-sell-bar');
      if (sellBarEl) sellBarEl.style.width = `${sellPct}%`;

      const buyReadEl = document.getElementById('mob-buy-readiness');
      if (buyReadEl) buyReadEl.textContent = `${buyMet}/${total} (${buyPct}%)`;
      const buyBarEl = document.getElementById('mob-buy-bar');
      if (buyBarEl) buyBarEl.style.width = `${buyPct}%`;

      const summaryEl = document.getElementById('mob-rule-summary');
      if (summaryEl) {
        const focus = d.active_focus || (d.trend_direction === 'BULLISH' ? 'LONG' : 'SHORT');
        summaryEl.textContent = `${focus} · ${d.trend_direction || ''}`;
        summaryEl.className = 'badge ' + (d.trend_direction === 'BULLISH' ? 'badge-green' : 'badge-red');
      }

      const diagEl = document.getElementById('mob-trend-diag');
      if (diagEl) {
        diagEl.textContent = d.trend_diagnosis || d.short_missing || 'Keine Diagnose verfügbar';
      }

      const rList = document.getElementById('rules-list');
      if (!rList) return;

      rList.innerHTML = d.rules_matrix.map(r => {
        const showShort = currentRuleFilter === 'all' || currentRuleFilter === 'short';
        const showLong = currentRuleFilter === 'all' || currentRuleFilter === 'long';

        let colsHtml = '';
        if (showShort && showLong) {
          colsHtml = `
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:10px; font-family:ui-monospace,monospace;">
              <div style="padding:4px 6px; border-radius:5px; background:${r.short_met ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)'}; border:1px solid ${r.short_met ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'};">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px;">
                  <span style="font-weight:800; color:var(--red);">SHORT:</span>
                  <span class="badge ${r.short_met ? 'badge-green' : 'badge-red'}" style="padding:1px 4px; font-size:9px;">
                    ${r.short_met ? '✓ ERFÜLLT' : '✕ FEHLT'}
                  </span>
                </div>
                <div style="font-size:9px; color:var(--sub); line-height:1.2;">${r.short_note || ''}</div>
              </div>
              <div style="padding:4px 6px; border-radius:5px; background:${r.long_met ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)'}; border:1px solid ${r.long_met ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'};">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px;">
                  <span style="font-weight:800; color:var(--green);">LONG:</span>
                  <span class="badge ${r.long_met ? 'badge-green' : 'badge-red'}" style="padding:1px 4px; font-size:9px;">
                    ${r.long_met ? '✓ ERFÜLLT' : '✕ FEHLT'}
                  </span>
                </div>
                <div style="font-size:9px; color:var(--sub); line-height:1.2;">${r.long_note || ''}</div>
              </div>
            </div>
          `;
        } else if (showShort) {
          colsHtml = `
            <div style="padding:5px 8px; border-radius:5px; background:${r.short_met ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)'}; border:1px solid ${r.short_met ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}; font-family:ui-monospace,monospace;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px;">
                <span style="font-weight:800; color:var(--red); font-size:11px;">SHORT-STATUS:</span>
                <span class="badge ${r.short_met ? 'badge-green' : 'badge-red'}" style="padding:2px 6px; font-size:10px;">
                  ${r.short_met ? '✓ ERFÜLLT' : '✕ FEHLT'}
                </span>
              </div>
              <div style="font-size:10px; color:var(--sub); line-height:1.3;">${r.short_note || ''}</div>
            </div>
          `;
        } else {
          colsHtml = `
            <div style="padding:5px 8px; border-radius:5px; background:${r.long_met ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)'}; border:1px solid ${r.long_met ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}; font-family:ui-monospace,monospace;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px;">
                <span style="font-weight:800; color:var(--green); font-size:11px;">LONG-STATUS:</span>
                <span class="badge ${r.long_met ? 'badge-green' : 'badge-red'}" style="padding:2px 6px; font-size:10px;">
                  ${r.long_met ? '✓ ERFÜLLT' : '✕ FEHLT'}
                </span>
              </div>
              <div style="font-size:10px; color:var(--sub); line-height:1.3;">${r.long_note || ''}</div>
            </div>
          `;
        }

        return `
          <div style="padding:8px 10px; border-radius:8px; background:rgba(255,255,255,0.03); border:1px solid var(--card-border);">
            <div style="font-weight:bold; font-size:11px; color:#fff; margin-bottom:4px;">
              ${r.name}
            </div>
            <div style="font-size:10px; font-family:ui-monospace,monospace; color:var(--cyan); margin-bottom:6px; background:rgba(6,182,212,0.08); padding:3px 6px; border-radius:4px; border:1px solid rgba(6,182,212,0.15); word-break:break-all;">
              Wert: <strong>${r.current_val}</strong>
            </div>
            ${colsHtml}
          </div>
        `;
      }).join('');
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
        const slText = p.sl_price > 0 ? `$${p.sl_price.toFixed(2)} (${p.sl_usd >= 0 ? '+' : ''}$${p.sl_usd.toFixed(2)})` : 'Kein SL';
        const tpText = p.tp_price > 0 ? `$${p.tp_price.toFixed(2)} (${p.tp_usd >= 0 ? '+' : ''}$${p.tp_usd.toFixed(2)})` : 'Kein TP';
        const slVal = p.sl_usd ? p.sl_usd.toFixed(2) : '-50.00';
        const tpVal = p.tp_usd ? p.tp_usd.toFixed(2) : '50.00';
        
        return `
          <div class="pos-card">
            <div class="pos-header">
              <span class="badge ${p.type === 'BUY' ? 'badge-green' : 'badge-red'}">${p.type} ${p.volume} Lot</span>
              <span class="pos-pnl" style="color:${pnlColor};">${pnlSign}$${p.profit_usd.toFixed(2)}</span>
            </div>
            <div class="pos-info">
              #${p.ticket} @ $${p.open_price.toFixed(2)} · Aktuell: $${p.current_price.toFixed(2)}
            </div>

            <!-- SL & TP Werte Anzeige -->
            <div class="pos-sl-tp">
              <div class="sl-tp-row">
                <span class="sl-tp-lbl">STOP-LOSS (SL):</span>
                <span class="sl-tp-val" style="color:var(--red);">${slText}</span>
              </div>
              <div class="sl-tp-row">
                <span class="sl-tp-lbl">TAKE-PROFIT (TP):</span>
                <span class="sl-tp-val" style="color:var(--green);">${tpText}</span>
              </div>
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

            <!-- SL / TP Bearbeiten & Schnellbuttons -->
            <div class="pos-controls-row">
              <span class="sl-tp-lbl" style="min-width:44px;">SL ($):</span>
              <input id="mob-sl-${p.ticket}" class="pos-input pos-input-usd" type="number" step="1" value="${slVal}" placeholder="SL USD">
              <span class="sl-tp-lbl" style="min-width:44px;">TP ($):</span>
              <input id="mob-tp-${p.ticket}" class="pos-input pos-input-usd" type="number" step="1" value="${tpVal}" placeholder="TP USD">
              <button class="btn" style="flex:1; background:rgba(59,130,246,0.25); border-color:#3b82f6; color:#93c5fd;" onclick="saveMobSLTP(${p.ticket})">✓ Speichern</button>
            </div>
            <div class="btn-row" style="margin-bottom:8px;">
              <button class="btn btn-be" onclick="quickBE(${p.ticket})">BE +5$</button>
              <button class="btn" onclick="quickSL(${p.ticket}, -50)">SL −50$</button>
              <button class="btn" onclick="quickTP(${p.ticket}, 50)">TP +50$</button>
              <button class="btn" onclick="quickTP(${p.ticket}, 100)">TP +100$</button>
            </div>

            <!-- Teilschließen: 25%, 50%, 75%, 100% und Lots eingeben -->
            <div class="pos-controls-row" style="margin-top:6px; border-top:1px solid rgba(255,255,255,0.06); padding-top:6px;">
              <span class="sl-tp-lbl" style="min-width:65px;">Teilclose:</span>
              <div style="display:flex; gap:4px; flex:1;">
                <button class="btn btn-pct" style="flex:1;" onclick="closePosPct(${p.ticket}, ${p.volume}, 25)">25%</button>
                <button class="btn btn-pct" style="flex:1;" onclick="closePosPct(${p.ticket}, ${p.volume}, 50)">50%</button>
                <button class="btn btn-pct" style="flex:1;" onclick="closePosPct(${p.ticket}, ${p.volume}, 75)">75%</button>
                <button class="btn btn-pct" style="flex:1;" onclick="closePosPct(${p.ticket}, ${p.volume}, 100)">100%</button>
              </div>
            </div>
            <div class="pos-controls-row">
              <span class="sl-tp-lbl" style="min-width:65px;">Lot-Zahl:</span>
              <input id="mob-lot-${p.ticket}" class="pos-input pos-input-lot" type="number" step="0.01" min="0.01" max="${p.volume}" value="${p.volume.toFixed(2)}">
              <button class="btn btn-danger" style="flex:1;" onclick="closePosCustom(${p.ticket})">✕ Schließen</button>
            </div>
          </div>
        `;
      }).join('');
    }

    async function saveMobSLTP(ticket) {
      ArcadeAudio.unlock();
      const slInp = document.getElementById('mob-sl-' + ticket);
      const tpInp = document.getElementById('mob-tp-' + ticket);
      const sl = slInp ? parseFloat(slInp.value) : null;
      const tp = tpInp ? parseFloat(tpInp.value) : null;
      const body = { ticket };
      if (Number.isFinite(sl)) body.sl_usd = sl;
      if (Number.isFinite(tp)) {
        if (tp === 0) body.remove_tp = true;
        else body.tp_usd = tp;
      }
      try {
        await controlledPost('/api/modify_position', body);
      } catch (err) {
        alert('Fehler beim Ändern: ' + err.message);
      }
    }

    async function controlledPost(path, body) {
      const account = activeAccount;
      const control = await fetch(BASE_PATH + '/api/control_session', { credentials: 'same-origin', cache: 'no-store' });
      const session = await control.json();
      if (!control.ok || !session.control_enabled || !session.csrf_token) {
        throw new Error(session.detail || 'Steuerung für diesen Zugang nicht freigegeben.');
      }
      if (account !== activeAccount) throw new Error('Konto wurde gewechselt; Aktion nicht gesendet.');
      const response = await fetch(BASE_PATH + path + '?account=' + encodeURIComponent(account), {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Dashboard-CSRF': session.csrf_token },
        body: JSON.stringify(body)
      });
      const result = await response.json();
      if (account !== activeAccount) throw new Error('Konto wurde gewechselt; Antwort verworfen.');
      if (!response.ok || !result.success) throw new Error(result.detail || result.comment || 'Aktion abgelehnt.');
      update();
      return result;
    }

    async function quickBE(ticket) {
      ArcadeAudio.unlock();
      try { await controlledPost('/api/modify_position', { ticket, sl_usd: 5.0 }); }
      catch (err) { alert('BE fehlgeschlagen: ' + err.message); }
    }
    async function quickSL(ticket, usd) {
      ArcadeAudio.unlock();
      try { await controlledPost('/api/modify_position', { ticket, sl_usd: usd }); }
      catch (err) { alert('SL fehlgeschlagen: ' + err.message); }
    }
    async function quickTP(ticket, usd) {
      ArcadeAudio.unlock();
      try { await controlledPost('/api/modify_position', { ticket, tp_usd: usd }); }
      catch (err) { alert('TP fehlgeschlagen: ' + err.message); }
    }

    async function closePos(ticket, volume = null) {
      ArcadeAudio.unlock();
      const volNum = (volume != null && Number.isFinite(Number(volume)) && Number(volume) > 0) ? Number(volume) : null;
      const volText = volNum ? `${volNum.toFixed(2)} Lot von Position #${ticket}` : `Position #${ticket}`;
      if (!confirm(`${volText} wirklich schließen?`)) return;
      try {
        const payload = volNum ? { ticket, volume: volNum } : { ticket };
        await controlledPost('/api/close_position', payload);
      } catch (err) {
        alert('Fehler beim Schließen: ' + err.message);
      }
    }

    function closePosPct(ticket, fullVol, pct) {
      const vol = Math.max(0.01, Math.round(fullVol * pct / 100 * 100) / 100);
      const inp = document.getElementById('mob-lot-' + ticket);
      if (inp) inp.value = vol.toFixed(2);
      closePos(ticket, vol);
    }

    function closePosCustom(ticket) {
      const inp = document.getElementById('mob-lot-' + ticket);
      const vol = inp ? parseFloat(inp.value) : null;
      closePos(ticket, vol);
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
        
        allEntries.sort((a, b) => (b.time_ts || 0) - (a.time_ts || 0));

        if (journalInitialized && allEntries.length > prevJournalCount) {
          const newest = allEntries[0];
          if (newest && newest.status === 'CLOSED') {
            if (newest.profit_usd > 0) ArcadeAudio.playWinSound();
            else if (newest.profit_usd < 0) ArcadeAudio.playSlSound();
          }
        }
        if (allEntries.length > 0) {
          journalInitialized = true;
          prevJournalCount = allEntries.length;
        }

        const live = allEntries.filter(it => it.status === 'OPEN');
        const closed = allEntries.filter(it => it.status === 'CLOSED');
        const tot = allEntries.reduce((s, it) => s + (Number.isFinite(it.profit_usd) ? it.profit_usd : 0), 0);
        const lPnl = live.reduce((s, it) => s + (Number.isFinite(it.profit_usd) ? it.profit_usd : 0), 0);
        const cPnl = closed.reduce((s, it) => s + (Number.isFinite(it.profit_usd) ? it.profit_usd : 0), 0);

        const formatPnL = (num, el) => {
          if (!el) return;
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
      padding: 16px 12px 60px;
      overflow-x: auto;
      text-shadow: 0 0 4px rgba(51,255,102,0.35);
      display: flex;
      flex-direction: column;
      align-items: center;
      min-height: 100vh;
    }
    body.theme-amber { text-shadow: 0 0 4px rgba(255,176,0,0.35); }
    body.theme-cyan { text-shadow: 0 0 4px rgba(0,229,255,0.35); }
    .terminal-container {
      width: fit-content;
      max-width: 100%;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      align-items: stretch;
    }
    @media (max-width: 800px) {
      body {
        font-size: 11px;
        padding: 10px 6px 30px;
      }
    }
    @media (max-width: 500px) {
      body {
        font-size: 12px;
        padding: 8px 8px 32px;
      }
    }
    pre {
      font-family: inherit;
      white-space: pre;
      line-height: 1.25;
      display: block;
      margin: 0 auto;
    }
    @media (max-width: 740px) {
      body { display: block; overflow-x: hidden; }
      .terminal-container { width: 100%; min-width: 0; margin: 0; }
      .top-bar { width: 100%; }
      .top-bar a, .top-bar button { min-height: 36px; display: inline-flex; align-items: center; }
      .top-bar span[style] { margin-left: 0 !important; }
      #terminal-screen.compact { width: 100%; margin: 0; white-space: normal; overflow-wrap: anywhere; }
      .ascii-card { position: relative; border: 1px dashed var(--fg-dim); padding: 12px 10px 10px; margin: 0 0 12px; min-width: 0; background: linear-gradient(135deg, rgba(51,255,102,.04), transparent 52%); }
      .ascii-card::before { content: '╔'; position: absolute; top: -8px; left: -3px; background: var(--bg); color: var(--fg-bright); font-size: 16px; }
      .ascii-card::after { content: '╝'; position: absolute; bottom: -8px; right: -3px; background: var(--bg); color: var(--fg-bright); font-size: 16px; }
      .ascii-card h2 { color: var(--fg-bright); font-size: 12px; margin: 0 0 8px; border-bottom: 1px dashed var(--fg-dim); padding-bottom: 6px; letter-spacing: .08em; }
      .ascii-card h2::before { content: '> '; color: var(--amber); }
      .ascii-line { position: relative; display: flex; justify-content: space-between; gap: 8px; margin: 5px 0; padding-left: 12px; }
      .ascii-line::before { content: '│'; position: absolute; left: 0; color: var(--fg-dim); }
      .ascii-line span { min-width: 0; overflow-wrap: anywhere; }
      .ascii-position { border-top: 1px dashed var(--fg-dim); padding-top: 9px; margin-top: 9px; }
      .ascii-position:first-of-type { border-top: 0; padding-top: 0; margin-top: 0; }
      .ascii-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; margin-top: 9px; }
      .ascii-actions button { min-height: 44px; border: 1px solid var(--fg-dim); background: rgba(51,255,102,.08); color: var(--fg-bright); font: inherit; padding: 6px; text-align: center; }
      .ascii-actions button.danger { color: var(--red); border-color: var(--red); }
      .ascii-actions button:active { background: var(--fg-dim); }
      .ascii-plot { position: relative; display: block; width: 100%; overflow: hidden; white-space: pre; font-size: clamp(10px, 3.2vw, 14px); line-height: 1.26; letter-spacing: 0; margin: 4px 0 8px; }
      .chart-row { display: block; height: 1.26em; }
      .chart-axis, .chart-grid { color: var(--fg-dim); }
      .candle-body.up { color: var(--fg-bright); text-shadow: 0 0 7px var(--fg); }
      .candle-body.down { color: var(--red); text-shadow: 0 0 5px var(--red); }
      .candle-wick { color: var(--fg); }
      .candle-current { animation: candle-live 1.4s ease-in-out infinite; }
      .ascii-chart-meta { display: flex; justify-content: space-between; gap: 8px; color: var(--fg-bright); font-size: 10px; }
      .ascii-chart-meta span:last-child { color: var(--amber); }
      .ascii-legend { color: var(--fg-dim); font-size: 10px; margin-top: 7px; }
      .ascii-legend .up { color: var(--fg-bright); }
      .ascii-legend .down { color: var(--red); }
      @keyframes candle-live { 50% { opacity: .5; filter: brightness(1.65); } }
      @media (prefers-reduced-motion: reduce) { .candle-current { animation: none; } }
      .ascii-muted { color: var(--fg-dim); }
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

  <div class="terminal-container">
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
      <span style="margin-left:8px;">[AUDIO]:</span>
      <button id="ascii-sound-btn" onclick="toggleAsciiAudio()">[🔊 SOUND: AN]</button>
      <button onclick="ArcadeAudio.unlock(); ArcadeAudio.playTradeSound()">[⚡ TRADE]</button>
      <button onclick="ArcadeAudio.unlock(); ArcadeAudio.playWinSound()">[✦ WIN]</button>
      <button onclick="ArcadeAudio.unlock(); ArcadeAudio.playSlSound()">[💥 SL]</button>
    </div>

    <div id="account-buttons" class="top-bar"></div>

    <pre id="terminal-screen">INITIALISIERE TITAN ASCII TERMINAL ...</pre>
  </div>

  <script>
    const W = 96;
    const BASE_PATH = window.location.pathname.startsWith('/stt') ? '/stt' : '';

    let activeAccount = 'xau5m_m5';
    let accounts = {};
    let candles = [];
    let journalData = { all: [], byAccount: {}, errors: [] };
    let journalScope = 'all'; // 'all' or 'single'
    let journalLimit = 10;    // 10, 25, 0 (all)
    let posDetailMode = true; // true = detailed cards with EMA9 & exit rules, false = compact table
    let tradeObserverInitialized = false;
    let prevSeenTickets = new Set();
    let journalInitialized = false;
    let prevJournalCount = 0;

    let soundEnabled = localStorage.getItem('titan_sound_enabled') !== 'false';
    const ArcadeAudio = (() => {
      let ctx = null;
      function getContext() {
        if (!ctx) {
          const A = window.AudioContext || window.webkitAudioContext;
          if (A) ctx = new A();
        }
        return ctx;
      }
      function unlock() { const c = getContext(); if (c && c.state === 'suspended') c.resume().catch(() => {}); }
      if (typeof window !== 'undefined') {
        ['click', 'keydown', 'touchstart', 'pointerdown'].forEach(e => window.addEventListener(e, unlock, { once: true, passive: true }));
      }
      function runAudio(fn) {
        if (!soundEnabled) return;
        try {
          const c = getContext(); if (!c) return;
          const play = () => {
            try {
              const t0 = c.currentTime + 0.03;
              fn(c, t0);
            } catch (err) { console.warn('ASCII audio render error:', err); }
          };
          if (c.state === 'suspended') {
            c.resume().then(play).catch(err => console.warn('Audio resume error:', err));
          } else {
            play();
          }
        } catch (err) { console.warn('Audio context error:', err); }
      }
      function playTradeSound() {
        runAudio((c, t0) => {
          const o1 = c.createOscillator(), g1 = c.createGain();
          o1.type = 'sine'; o1.frequency.setValueAtTime(987.77, t0); o1.frequency.setValueAtTime(1318.51, t0 + 0.08);
          g1.gain.setValueAtTime(0.001, t0); g1.gain.exponentialRampToValueAtTime(0.35, t0 + 0.02); g1.gain.exponentialRampToValueAtTime(0.001, t0 + 0.30);
          o1.connect(g1); g1.connect(c.destination); o1.start(t0); o1.stop(t0 + 0.31);
          const o2 = c.createOscillator(), flt = c.createBiquadFilter(), g2 = c.createGain();
          o2.type = 'triangle'; flt.type = 'lowpass'; flt.frequency.setValueAtTime(2800, t0);
          o2.frequency.setValueAtTime(440, t0); o2.frequency.exponentialRampToValueAtTime(880, t0 + 0.14);
          g2.gain.setValueAtTime(0.001, t0); g2.gain.linearRampToValueAtTime(0.28, t0 + 0.02); g2.gain.exponentialRampToValueAtTime(0.001, t0 + 0.25);
          o2.connect(flt); flt.connect(g2); g2.connect(c.destination); o2.start(t0); o2.stop(t0 + 0.26);
        });
      }
      function playWinSound() {
        runAudio((c, t0) => {
          const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51, 1567.98];
          notes.forEach((freq, i) => {
            const osc = c.createOscillator(), g = c.createGain(), st = t0 + i * 0.07;
            osc.type = 'triangle'; osc.frequency.setValueAtTime(freq, st);
            g.gain.setValueAtTime(0.001, st); g.gain.exponentialRampToValueAtTime(0.32, st + 0.01); g.gain.exponentialRampToValueAtTime(0.001, st + 0.25);
            osc.connect(g); g.connect(c.destination); osc.start(st); osc.stop(st + 0.26);
          });
          const coinDts = [0.44, 0.53, 0.62, 0.72, 0.83], ps = [2093.0, 2637.0, 2093.0, 3136.0, 2637.0];
          coinDts.forEach((dt, i) => {
            const osc = c.createOscillator(), g = c.createGain(), st = t0 + dt;
            osc.type = 'sine'; osc.frequency.setValueAtTime(ps[i], st);
            g.gain.setValueAtTime(0.001, st); g.gain.exponentialRampToValueAtTime(0.30, st + 0.008); g.gain.exponentialRampToValueAtTime(0.001, st + 0.18);
            osc.connect(g); g.connect(c.destination); osc.start(st); osc.stop(st + 0.19);
          });
        });
      }
      function playSlSound() {
        runAudio((c, t0) => {
          const steps = [{ f: 349.23, d: 0.10 }, { f: 293.66, d: 0.10 }, { f: 220.00, d: 0.12 }, { f: 146.83, d: 0.30 }];
          let cur = t0;
          steps.forEach(st => {
            const osc = c.createOscillator(), g = c.createGain();
            osc.type = 'sawtooth'; osc.frequency.setValueAtTime(st.f, cur);
            g.gain.setValueAtTime(0.001, cur); g.gain.exponentialRampToValueAtTime(0.32, cur + 0.01); g.gain.exponentialRampToValueAtTime(0.001, cur + st.d);
            osc.connect(g); g.connect(c.destination); osc.start(cur); osc.stop(cur + st.d + 0.01);
            cur += st.d;
          });
          try {
            const bufLen = Math.floor(c.sampleRate * 0.35), buf = c.createBuffer(1, bufLen, c.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (c.sampleRate * 0.07));
            const noise = c.createBufferSource(); noise.buffer = buf;
            const flt = c.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.setValueAtTime(900, t0); flt.frequency.linearRampToValueAtTime(140, t0 + 0.35);
            const gn = c.createGain(); gn.gain.setValueAtTime(0.26, t0); gn.gain.exponentialRampToValueAtTime(0.001, t0 + 0.35);
            noise.connect(flt); flt.connect(gn); gn.connect(c.destination); noise.start(t0); noise.stop(t0 + 0.36);
          } catch (_) {}
        });
      }
      return { playTradeSound, playWinSound, playSlSound, unlock };
    })();

    function syncAsciiSoundBtn() {
      const btn = document.getElementById('ascii-sound-btn');
      if (btn) {
        btn.textContent = soundEnabled ? '[🔊 SOUND: AN]' : '[🔇 SOUND: AUS]';
        btn.className = soundEnabled ? 'active-btn' : '';
      }
    }
    function toggleAsciiAudio() {
      soundEnabled = !soundEnabled;
      localStorage.setItem('titan_sound_enabled', String(soundEnabled));
      syncAsciiSoundBtn();
      if (soundEnabled) ArcadeAudio.playTradeSound();
    }

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
      if (diff < 0 && c === plain) return '│ ' + c.slice(0, W - 4) + ' │\\n';
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
      if (diff < 0 && c === plain) return '║ ' + c.slice(0, W - 4) + ' ║\\n';
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
        syncAsciiSoundBtn();
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
        line += fit(rightSide, 50);
        out += row(line);
      }
      const botAxis = '        └' + '──'.repeat(last.length) + fit('  [JÜNGSTE KERZEN RECHTS]', 51);
      out += row(botAxis);
      return out;
    }

    function escapeAscii(value) {
      return String(value ?? '—').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
    }

    function renderMobileCandleChart(candleList) {
      const valid = (candleList || []).filter(c => [c.open, c.high, c.low, c.close]
        .every(v => Number.isFinite(Number(v))) && Number(c.high) >= Number(c.low)).slice(-16);
      if (valid.length < 4) return '<div class="ascii-muted">[ KERZEN WERDEN GELADEN ... ]</div>';
      const highs = valid.map(c => Number(c.high));
      const lows = valid.map(c => Number(c.low));
      const maxPrice = Math.max(...highs), minPrice = Math.min(...lows);
      const range = maxPrice - minPrice || 1;
      const rows = 11;
      const priceRow = price => Math.max(0, Math.min(rows - 1,
        Math.round((maxPrice - Number(price)) / range * (rows - 1))));
      const liveRow = priceRow(valid.at(-1).close);
      let plot = '';
      for (let r = 0; r < rows; r++) {
        const level = maxPrice - r / (rows - 1) * range;
        const axis = r === 0 || r === rows - 1 || r === liveRow
          ? level.toFixed(1).padStart(7) : '       ';
        let cells = '';
        valid.forEach((c, i) => {
          const bodyStart = Math.min(priceRow(c.open), priceRow(c.close));
          const bodyEnd = Math.max(priceRow(c.open), priceRow(c.close));
          const wickStart = priceRow(c.high), wickEnd = priceRow(c.low);
          const current = i === valid.length - 1 ? ' candle-current' : '';
          if (r >= bodyStart && r <= bodyEnd) {
            cells += `<span class="candle-body ${Number(c.close) >= Number(c.open) ? 'up' : 'down'}${current}">${Number(c.close) >= Number(c.open) ? '█' : '▓'}</span>`;
          } else if (r >= wickStart && r <= wickEnd) {
            cells += `<span class="candle-wick${current}">│</span>`;
          } else {
            cells += `<span class="chart-grid">${r === liveRow ? '·' : ' '}</span>`;
          }
          cells += ' ';
        });
        plot += `<span class="chart-row"><span class="chart-axis">${axis} ┤</span>${cells}<span class="chart-axis">│</span></span>`;
      }
      const floor = `<span class="chart-row"><span class="chart-axis">       └${'─'.repeat(valid.length * 2)}┘</span></span>`;
      return `<pre class="ascii-plot" role="img" aria-label="${valid.length} Kerzen mit Preisachse, Körpern und Dochten">${plot}${floor}</pre>
        <div class="ascii-chart-meta"><span>LOW ${minPrice.toFixed(2)}</span><span>◉ LIVE ${Number(valid.at(-1).close).toFixed(2)}</span><span>HIGH ${maxPrice.toFixed(2)}</span></div>
        <div class="ascii-legend"><span class="up">█ STEIGEND</span> / <span class="down">▓ FALLEND</span> / │ DOCHT / · LETZTER PREIS</div>`;
    }

    function renderCompactAscii(d) {
      const accountName = d.account?.name || accounts[activeAccount]?.name || activeAccount;
      const tf = escapeAscii(d.account?.timeframe || accounts[activeAccount]?.timeframe || 'M15');
      const dd = d.daily_drawdown || {};
      const money = value => '$' + Number(value || 0).toFixed(2);
      const line = (label, value) => `<div class="ascii-line"><span>${label}</span><span>${escapeAscii(value)}</span></div>`;
      const compactButton = (label, action, danger = false) =>
        `<button type="button" class="${danger ? 'danger' : ''}" onclick="${action}">${label}</button>`;
      const chart = renderMobileCandleChart(candles);
      const positions = (d.positions || []).map(p => {
        const ticket = Number(p.ticket);
        if (!Number.isSafeInteger(ticket) || ticket <= 0) return '';
        const pnl = Number(p.profit_usd || 0);
        const volume = Number(p.volume || 0);
        const safeVolume = Number.isFinite(volume) && volume > 0 ? volume : 0;
        const slDefault = p.sl_usd == null || !Number.isFinite(Number(p.sl_usd)) ? -50 : Number(p.sl_usd);
        const tpDefault = p.tp_usd == null || !Number.isFinite(Number(p.tp_usd)) ? 50 : Number(p.tp_usd);
        return `<div class="ascii-position">
          ${line('#' + ticket + ' · ' + p.type + ' · ' + safeVolume.toFixed(2) + ' Lot', (pnl >= 0 ? '+' : '') + money(pnl))}
          ${line('OPEN / LIVE', money(p.open_price) + ' / ' + money(p.current_price))}
          ${line('SL / TP', (p.sl_price > 0 ? money(p.sl_price) : 'KEIN SL') + ' / ' + (p.tp_price > 0 ? money(p.tp_price) : 'KEIN TP'))}
          ${line('EMA9-ABSTAND', p.dist_to_ema9 == null ? '—' : Number(p.dist_to_ema9).toFixed(2) + ' Pkt')}
          <div class="ascii-actions">
            ${compactButton('[SL/TP]', `promptEditSLTP(${ticket}, ${slDefault}, ${tpDefault})`)}
            ${compactButton('[BE +5$]', `quickBE(${ticket})`)}
            ${compactButton('[SL -50$]', `quickSL(${ticket}, -50)`)}
            ${compactButton('[TP +50$]', `quickTP(${ticket}, 50)`)}
            ${compactButton('[25%]', `closePosPct(${ticket}, ${safeVolume}, 25)`)}
            ${compactButton('[50%]', `closePosPct(${ticket}, ${safeVolume}, 50)`)}
            ${compactButton('[LOT-EINGABE]', `promptCloseLots(${ticket}, ${safeVolume})`)}
            ${compactButton('[SCHLIESSEN]', `closePos(${ticket})`, true)}
          </div>
        </div>`;
      }).join('');
      const entries = journalScope === 'all' ? (journalData.all || []) : (journalData.byAccount[activeAccount] || []);
      const displayed = journalLimit > 0 ? entries.slice(0, journalLimit) : entries;
      const journal = displayed.map(it => line('#' + it.ticket + ' · ' + it.status,
        (Number(it.profit_usd || 0) >= 0 ? '+' : '') + money(it.profit_usd))).join('');
      return `<section class="ascii-card">
        <h2>[ TITAN GOLD TERMINAL · ${tf} ]</h2>
        ${line('KONTO', accountName)}
        ${line('BID / ASK', money(d.bid) + ' / ' + money(d.ask))}
        ${line('SPREAD / TREND', d.spread + ' / ' + (d.trend_direction || 'NEUTRAL'))}
        ${line('KERZE / DE-ZEIT', (d.times?.bar_remaining_fmt || '—') + ' / ' + (d.times?.german || '—'))}
      </section>
      <section class="ascii-card"><h2>[ 16 KERZEN · ${tf} ]</h2>${chart}</section>
      <section class="ascii-card"><h2>[ TAGES-RISIKO ]</h2>
        ${line('BALANCE / EQUITY', money(dd.balance) + ' / ' + money(dd.equity))}
        ${line('VERLUST HEUTE', money(dd.loss_usd))}
        ${line('DRAWDOWN / PUFFER', Number(dd.pct || 0).toFixed(2) + '% / ' + (dd.buffer_usd == null ? 'KEIN LIMIT' : money(dd.buffer_usd)))}
      </section>
      <section class="ascii-card"><h2>[ OFFENE POSITIONEN · ${(d.positions || []).length} ]</h2>
        ${positions || '<span class="ascii-muted">KEINE OFFENEN POSITIONEN</span>'}
      </section>
      <section class="ascii-card"><h2>[ TRADE JOURNAL ]</h2>
        <div class="ascii-actions">
          ${compactButton('[ALLE KONTEN]', "setJournalScope('all')")}
          ${compactButton('[DIESES KONTO]', "setJournalScope('single')")}
          ${compactButton('[10]', 'setJournalLimit(10)')}
          ${compactButton('[ALLE TRADES]', 'setJournalLimit(0)')}
        </div>
        ${journal || '<span class="ascii-muted">KEINE TRADES GELADEN</span>'}
      </section>`;
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
        screen += hRow(`KONTO: ${fit(accName, 44)} SERVER/DE: ${deTime} (${tf})`);
        screen += hBot();
        screen += '\\n';

        // 2. LIVE MARKT
        screen += bTop('LIVE MARKT (XAUUSD)');
        screen += row(`BID: $${fit(bid, 9)} │ ASK: $${fit(ask, 9)} │ SPREAD: ${fit(String(spread), 4)} │ KERZE (${tf}): ${remaining} │ DE-ZEIT: ${deTime}`);
        screen += row(`TREND: [${fit(trend, 8)}] │ EMA9: ${fit(ema9Global, 9)} │ RSI(14): ${fit(rsi, 5)} │ STATUS: [● LIVE TICK AKTIV]`);
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
        const curTickets = new Set(positions.map(p => p.ticket));
        if (tradeObserverInitialized) {
          for (const p of positions) {
            if (!prevSeenTickets.has(p.ticket)) {
              ArcadeAudio.playTradeSound();
              break;
            }
          }
        }
        tradeObserverInitialized = true;
        prevSeenTickets = curTickets;

        if (journalInitialized && Array.isArray(journalData.all)) {
          if (journalData.all.length > prevJournalCount) {
            const newest = journalData.all[0];
            if (newest && newest.status === 'CLOSED') {
              if (newest.profit_usd > 0) ArcadeAudio.playWinSound();
              else if (newest.profit_usd < 0) ArcadeAudio.playSlSound();
            }
          }
        }
        if (Array.isArray(journalData.all) && journalData.all.length > 0) {
          journalInitialized = true;
          prevJournalCount = journalData.all.length;
        }

        const terminal = document.getElementById('terminal-screen');
        const compact = window.matchMedia('(max-width: 740px)').matches;
        terminal.classList.toggle('compact', compact);
        if (compact) {
          terminal.innerHTML = renderCompactAscii(d);
          return;
        }

        const posToggleBtn = btn(posDetailMode ? '[ANSICHT: KOMPAKT]' : '[ANSICHT: DETAIL]', 'togglePosDetail()', 'cyan');
        screen += bTop(`OFFENE POSITIONEN (${positions.length} AKTIV) │ ${posToggleBtn}`);

        if (positions.length === 0) {
          screen += row('KEINE OFFENEN POSITIONEN IM MARKT AUF DIESEM KONTO');
        } else if (!posDetailMode) {
          screen += row('#TICKET     TYP   LOT    OPEN       LIVE       EMA9-ABST  P&L (USD)   TEILCLOSE / AKTION');
          screen += bDiv();
          for (const p of positions) {
            const tick = fit('#' + p.ticket, 11);
            const typ = fit(p.type, 5);
            const lot = fit(Number(p.volume).toFixed(2), 6);
            const op = fit('$' + p.open_price.toFixed(2), 10);
            const cp = fit('$' + p.current_price.toFixed(2), 10);
            const dist = fit(p.dist_to_ema9 !== null && p.dist_to_ema9 !== undefined ? (p.dist_to_ema9.toFixed(1) + 'pt') : '—', 10);
            const pnl = fit((p.profit_usd >= 0 ? '+' : '') + '$' + p.profit_usd.toFixed(2), 10, 'right');
            const btn25 = btn('[25%]', `closePosPct(${p.ticket}, ${p.volume}, 25)`);
            const btn50 = btn('[50%]', `closePosPct(${p.ticket}, ${p.volume}, 50)`);
            const clBtn = btn('[X SCHLIESSEN]', `closePos(${p.ticket})`, 'danger');
            screen += row(`${tick} ${typ} ${lot} ${op} ${cp} ${dist} ${pnl}  ${btn25} ${btn50} ${clBtn}`);
          }
        } else {
          for (let i = 0; i < positions.length; i++) {
            const p = positions[i];
            if (i > 0) screen += bDiv();
            const tick = fit('#' + p.ticket, 11);
            const typ = fit(p.type, 5);
            const lot = fit(Number(p.volume).toFixed(2) + ' Lot', 10);
            const op = fit('OPEN: $' + p.open_price.toFixed(2), 17);
            const cp = fit('LIVE: $' + p.current_price.toFixed(2), 17);
            const pnlSign = p.profit_usd >= 0 ? '+' : '';
            const pnlStr = fit(`${pnlSign}$${p.profit_usd.toFixed(2)} (${p.profit_pct >= 0 ? '+' : ''}${p.profit_pct.toFixed(1)}%)`, 20, 'right');
            screen += row(`${tick} ${typ} ${lot} ${op} ${cp} ${pnlStr}`);

            const ema9Val = p.ema9 ? '$' + Number(p.ema9).toFixed(2) : (ema9Global !== '—' ? ema9Global : '—');
            let distText = '—';
            if (p.dist_to_ema9 !== null && p.dist_to_ema9 !== undefined) {
              const rel = p.ema9 ? (p.current_price > p.ema9 ? 'unter Kurs' : 'über Kurs') : '';
              distText = `${Number(p.dist_to_ema9).toFixed(2)} Pkt ${rel ? '(' + rel + ')' : ''}`;
            }
            const targetUsd = p.target_usd || 28.0;
            screen += row(`  [EMA9-ZIEL]: ${fit(ema9Val, 10)} │ ABSTAND: ${fit(distText, 28)} │ MIN-ZIEL: $${targetUsd.toFixed(0)}`);

            const isReady = p.profit_usd >= targetUsd;
            let exitStatus = '';
            if (isReady) {
              exitStatus = `AUSSTIEG: [BEREIT: MIN-GEWINN ERREICHT (+$${p.profit_usd.toFixed(2)} >= $${targetUsd.toFixed(0)}) · SCHLIESST BEI EMA9]`;
            } else {
              const diff = (targetUsd - p.profit_usd).toFixed(2);
              exitStatus = `AUSSTIEG: [OFFEN: MIN-GEWINN +$${p.profit_usd.toFixed(2)} / $${targetUsd.toFixed(0)} · NOCH $${diff} BIS ZIEL]`;
            }
            screen += row('  ' + exitStatus);

            const slStr = p.sl_price > 0 ? `SL: $${p.sl_price.toFixed(2)} (${p.sl_usd ? (p.sl_usd >= 0 ? '+' : '') + '$' + p.sl_usd.toFixed(2) : '$0'})` : 'SL: KEIN SL';
            const tpStr = p.tp_price > 0 ? `TP: $${p.tp_price.toFixed(2)} (${p.tp_usd ? (p.tp_usd >= 0 ? '+' : '') + '$' + p.tp_usd.toFixed(2) : '$0'})` : 'TP: KEIN TP';
            const btnEdit = btn('[✏️ SL/TP]', `promptEditSLTP(${p.ticket}, ${p.sl_usd || -50}, ${p.tp_usd || 50})`, 'cyan');
            const btnBE = btn('[BE +5$]', `quickBE(${p.ticket})`, 'cyan');
            const btnSL = btn('[SL -50$]', `quickSL(${p.ticket}, -50)`);
            const btnTP = btn('[TP +50$]', `quickTP(${p.ticket}, 50)`);
            const btnTP100 = btn('[TP +100$]', `quickTP(${p.ticket}, 100)`);
            screen += row(`  ${fit(slStr, 24)} │ ${fit(tpStr, 24)} │ ${btnEdit} ${btnBE} ${btnSL} ${btnTP} ${btnTP100}`);

            const btn25 = btn('[25%]', `closePosPct(${p.ticket}, ${p.volume}, 25)`);
            const btn50 = btn('[50%]', `closePosPct(${p.ticket}, ${p.volume}, 50)`);
            const btn75 = btn('[75%]', `closePosPct(${p.ticket}, ${p.volume}, 75)`);
            const btn100 = btn('[100%]', `closePosPct(${p.ticket}, ${p.volume}, 100)`, 'danger');
            const btnCustom = btn('[✏️ LOT-EINGABE]', `promptCloseLots(${p.ticket}, ${p.volume})`);
            const btnClose = btn('[X SCHLIESSEN]', `closePos(${p.ticket})`, 'danger');
            screen += row(`  TEILSCHLIESSEN (${p.volume} Lot): ${btn25}  ${btn50}  ${btn75}  ${btn100}  ${btnCustom}  ${btnClose}`);
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
        screen += row(`FILTER: ${btnScopeAll}  ${btnScopeSingle} │ LIMIT: ${btnL10} ${btnL25} ${btnLAll}`);
        screen += bDiv();

        const totStr = (totPnL >= 0 ? '+' : '') + '$' + totPnL.toFixed(2);
        const liveStr = (livePnL >= 0 ? '+' : '') + '$' + livePnL.toFixed(2);
        const histStr = (histPnL >= 0 ? '+' : '') + '$' + histPnL.toFixed(2);
        screen += row(`GESAMT: ${fit(totStr, 14)} │ LIVE: ${fit(liveStr, 14)} │ HISTORISCH: ${fit(histStr, 14)}`);
        screen += row(`TRADES: ${fit(entries.length + ' GELADEN', 14)} │ KONTEN: ${fit(okAccs + '/' + Object.keys(accounts).length + ' ONLINE', 14)} │ MODUS: ${journalScope === 'all' ? 'ALLE KONTEN' : accName}`);
        screen += bDiv('GELISTETE TRADES');

        if (entries.length === 0) {
          screen += row('KEINE TRADES IM GEWÄHLTEN JOURNAL VERZEICHNET');
        } else {
          screen += row('#TICKET      KONTO       TYP  LOT    OPEN       CLOSE/AKT  P&L (USD)   STATUS');
          screen += bDiv();
          const displayList = journalLimit > 0 ? entries.slice(0, journalLimit) : entries;
          for (const it of displayList) {
            const tick = fit('#' + it.ticket, 12);
            const accTag = fit(it.account || activeAccount, 11);
            const typ = fit(it.type, 4);
            const lot = fit(Number(it.volume).toFixed(2), 6);
            const op = fit('$' + Number(it.open_price).toFixed(2), 10);
            const cp = fit('$' + Number(it.close_price || it.current_price).toFixed(2), 10);
            const pnl = fit((it.profit_usd >= 0 ? '+' : '') + '$' + Number(it.profit_usd).toFixed(2), 11, 'right');
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

    async function promptEditSLTP(ticket, curSl, curTp) {
      ArcadeAudio.unlock();
      const newSl = prompt(`Neuer Stop-Loss in USD für Position #${ticket} (z.B. -50 oder 5):`, String(curSl));
      if (newSl === null) return;
      const newTp = prompt(`Neuer Take-Profit in USD für Position #${ticket} (z.B. 50 oder 0 für keinen TP):`, String(curTp));
      if (newTp === null) return;
      const slNum = parseFloat(newSl);
      const tpNum = parseFloat(newTp);
      const body = { ticket };
      if (Number.isFinite(slNum)) body.sl_usd = slNum;
      if (Number.isFinite(tpNum)) {
        if (tpNum === 0) body.remove_tp = true;
        else body.tp_usd = tpNum;
      }
      try {
        await controlledPost('/api/modify_position', body);
      } catch (err) {
        alert('Änderung fehlgeschlagen: ' + err.message);
      }
    }

    async function controlledPost(path, body) {
      const account = activeAccount;
      const control = await fetch(BASE_PATH + '/api/control_session', { credentials: 'same-origin', cache: 'no-store' });
      const session = await control.json();
      if (!control.ok || !session.control_enabled || !session.csrf_token) {
        throw new Error(session.detail || 'Steuerung für diesen Zugang nicht freigegeben.');
      }
      if (account !== activeAccount) throw new Error('Konto wurde gewechselt; Aktion nicht gesendet.');
      const response = await fetch(BASE_PATH + path + '?account=' + encodeURIComponent(account), {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Dashboard-CSRF': session.csrf_token },
        body: JSON.stringify(body)
      });
      const result = await response.json();
      if (account !== activeAccount) throw new Error('Konto wurde gewechselt; Antwort verworfen.');
      if (!response.ok || !result.success) throw new Error(result.detail || result.comment || 'Aktion abgelehnt.');
      update();
      return result;
    }

    async function quickBE(ticket) {
      ArcadeAudio.unlock();
      try { await controlledPost('/api/modify_position', { ticket, sl_usd: 5.0 }); }
      catch (err) { alert('BE fehlgeschlagen: ' + err.message); }
    }
    async function quickSL(ticket, usd) {
      ArcadeAudio.unlock();
      try { await controlledPost('/api/modify_position', { ticket, sl_usd: usd }); }
      catch (err) { alert('SL fehlgeschlagen: ' + err.message); }
    }
    async function quickTP(ticket, usd) {
      ArcadeAudio.unlock();
      try { await controlledPost('/api/modify_position', { ticket, tp_usd: usd }); }
      catch (err) { alert('TP fehlgeschlagen: ' + err.message); }
    }
    async function closePos(ticket, volume = null) {
      ArcadeAudio.unlock();
      const volNum = (volume != null && Number.isFinite(Number(volume)) && Number(volume) > 0) ? Number(volume) : null;
      const volText = volNum ? `${volNum.toFixed(2)} Lot von Position #${ticket}` : `Position #${ticket}`;
      if (!confirm(`${volText} schließen?`)) return;
      try {
        const payload = volNum ? { ticket, volume: volNum } : { ticket };
        await controlledPost('/api/close_position', payload);
      } catch (err) {
        alert('Schließen fehlgeschlagen: ' + err.message);
      }
    }

    function closePosPct(ticket, fullVol, pct) {
      const vol = Math.max(0.01, Math.round(fullVol * pct / 100 * 100) / 100);
      closePos(ticket, vol);
    }

    function promptCloseLots(ticket, fullVol) {
      ArcadeAudio.unlock();
      const val = prompt(`Wie viele Lots von Position #${ticket} (${fullVol} Lot aktiv) schließen? (z.B. 0.01):`, String(fullVol));
      if (!val) return;
      const vol = parseFloat(val);
      if (!Number.isFinite(vol) || vol <= 0) {
        alert('Bitte eine gültige positive Zahl für Lots eingeben.');
        return;
      }
      closePos(ticket, vol);
    }

    window.onload = init;
  </script>
</body>
</html>
"""

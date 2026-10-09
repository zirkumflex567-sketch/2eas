/* Non-chart transport helpers. No broker commands or chart APIs. */
(() => {
  'use strict';
  const pending = new Set();
  const storage = {
    getItem(key) { try { return window.localStorage.getItem(key); } catch (_) { return null; } },
    setItem(key, value) { try { window.localStorage.setItem(key, value); } catch (_) { /* Preferences are optional. */ } }
  };
  async function request(url, options = {}, timeout = 4500, accountScoped = false) {
    const controller = new AbortController();
    const token = {controller, cancel:null};
    let timer;
    const aborted = new Promise((_, reject) => {
      token.cancel = () => { controller.abort(); reject(new DOMException('Account wurde gewechselt', 'AbortError')); };
      timer = setTimeout(() => { controller.abort(); reject(new DOMException('Anfragefrist überschritten', 'TimeoutError')); }, timeout);
    });
    if (accountScoped) pending.add(token);
    try {
      // Includes body reading: a resolved header with a hanging body is a timeout too.
      return await Promise.race([(async () => {
        const response = await fetch(url, {...options, signal:controller.signal, credentials:'same-origin'});
        const body = await response.json();
        return {ok:response.ok, status:response.status, json:async () => body};
      })(), aborted]);
    } finally { clearTimeout(timer); pending.delete(token); }
  }
  function initPresentation() {
    const areas = [...document.querySelectorAll('nav[aria-label="Konto und Strategie"],header.glass-card,.dashboard-panel,#dd-reset-modal')];
    const observer = new IntersectionObserver(entries => entries.forEach(entry => entry.target.dataset.uiVisible = String(entry.isIntersecting)));
    areas.forEach(area => observer.observe(area));
    const selector = document.getElementById('ui-motion');
    const saved = storage.getItem('dashboard_ui_motion');
    selector.value = ['off','low','full'].includes(saved) ? saved : 'low';
    const apply = () => { document.body.dataset.uiMotion = selector.value; storage.setItem('dashboard_ui_motion',selector.value); };
    selector.addEventListener('change', apply); apply();
    const visibility = () => document.body.dataset.uiHidden = String(document.hidden);
    document.addEventListener('visibilitychange', visibility); visibility();
  }
  window.DashboardRuntime = {request, storage, initPresentation, abortAccount:() => { for (const token of pending) token.cancel(); pending.clear(); }};
})();

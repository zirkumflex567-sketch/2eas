const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {chromium} = require('playwright');

const ROOT = path.join(__dirname, '..');
const DOC = {schemaVersion: 1, timeframe: 'M15', drawings: [], options: {}, indicators: {}};

async function main() {
  let browser, server;
  try {
    server = http.createServer((req, res) => {
      if (req.url === '/api/chart/v1/capabilities') {
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({features: {encryptedDeviceSync: true}}));
        return;
      }
      if (req.url === '/sync.js') {
        res.writeHead(200, {'Content-Type': 'application/javascript'});
        res.end(fs.readFileSync(path.join(ROOT, 'static', 'chart-studio-server-sync.js')));
        return;
      }
      res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
      res.end('<!doctype html><div id="panel"></div><script src="/sync.js"></script>');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    browser = await chromium.launch({headless: true});

    // Browser WebCrypto: new-device import, wrong key, tamper and scope binding.
    const cryptoPage = await browser.newPage();
    await cryptoPage.goto(`http://127.0.0.1:${address.port}/`);
    const cryptoResult = await cryptoPage.evaluate(async doc => {
      const sync = window.ChartStudioDeviceSync;
      const created = await sync.createRecoveryPackage('titan', 'XAUUSD');
      const imported = await sync.parseRecoveryPackage(created.recoveryPackage);
      const envelope = await sync.encryptDocument(doc, imported);
      const roundtrip = await sync.decryptDocument(envelope, imported);
      const bad = {...envelope, ciphertext: envelope.ciphertext.slice(0, -1) +
        (envelope.ciphertext.endsWith('A') ? 'B' : 'A')};
      const failures = [];
      try { await sync.decryptDocument(envelope, {...imported, account: 'xau5m_m5'}); } catch { failures.push('scope'); }
      try { await sync.encryptDocument({...doc, symbol: 'EURUSD'}, imported); } catch { failures.push('encrypt_scope'); }
      try { await sync.decryptDocument(bad, imported); } catch { failures.push('tamper'); }
      return {recoveryPackage: created.recoveryPackage, envelope, roundtrip, failures};
    }, DOC);
    assert.deepEqual(cryptoResult.roundtrip, DOC);
    assert.deepEqual(cryptoResult.failures.sort(), ['encrypt_scope', 'scope', 'tamper']);

    // Online save only sends ciphertext and scope metadata, then verifies decryptable readback.
    const page = await browser.newPage();
    page.setDefaultTimeout(5000);
    page.on('pageerror', error => console.error('page error:', error));
    await page.goto(`http://127.0.0.1:${address.port}/`);
    assert.equal(await page.evaluate(() => typeof window.ChartStudioServerSync), 'object');
    await page.evaluate(doc => {
      window.importedLayouts = [];
      window.ChartStudioServerSync.mount({panel: document.querySelector('#panel'), account: 'titan',
        getSymbol: () => 'XAUUSD', getAccount: () => 'titan',
        exportDocument: () => doc, importDocument: value => (window.importedLayouts.push(value), true)});
    }, DOC);
    await page.waitForFunction(() => !document.querySelector('[aria-label="Recovery-Paket"]').disabled);
    await page.getByRole('button', {name: 'Neuen Sync-Schlüssel erstellen'}).click();
    await page.waitForFunction(() => document.querySelector('[aria-label="Recovery-Paket"]').value.startsWith('2eas-sync:v1:'));
    const recoveryPackage = await page.locator('[aria-label="Recovery-Paket"]').inputValue();
    await page.evaluate(() => window.ChartStudioServerSync.scope('xau5m_m5', 'XAUUSD'));
    assert.equal(await page.locator('[aria-label="Recovery-Paket"]').inputValue(), '');
    await page.evaluate(() => window.ChartStudioServerSync.scope('titan', 'XAUUSD'));
    assert.equal(await page.locator('[aria-label="Recovery-Paket"]').inputValue(), recoveryPackage);
    let capturedPut;
    await page.route('**/api/chart/v1/device-sync/**', async route => {
      const req = route.request();
      if (req.method() === 'GET') return route.fulfill({status: 404, contentType: 'application/json', body: JSON.stringify({detail: 'not found'})});
      capturedPut = req.postDataJSON();
      return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({
        bundleId: new URL(req.url()).pathname.split('/').pop(), account: 'titan', symbol: 'XAUUSD',
        ...capturedPut, revision: 1, createdUtc: Math.floor(Date.now() / 1000),
      })});
    });
    await page.getByRole('button', {name: 'Aktuelles Layout verschlüsselt speichern'}).click();
    await page.waitForFunction(() => document.querySelector('[role="status"]').textContent.includes('Revision 1'));
    assert.deepEqual(Object.keys(capturedPut).sort(),
      ['account', 'ciphertext', 'expectedRevision', 'formatVersion', 'nonce', 'symbol'].sort());
    assert.equal(JSON.stringify(capturedPut).includes(JSON.stringify(DOC)), false);
    assert.equal(JSON.stringify(capturedPut).includes(recoveryPackage), false);
    assert.equal(await page.evaluate(() => localStorage.length), 0);

    // Offline retry queue persists ciphertext only, then drains after the connection returns.
    const offline = await browser.newPage();
    await offline.goto(`http://127.0.0.1:${address.port}/`);
    await offline.evaluate(doc => window.ChartStudioServerSync.mount({panel: document.querySelector('#panel'), account: 'titan',
      getSymbol: () => 'XAUUSD', exportDocument: () => doc, importDocument: () => true}), DOC);
    await offline.waitForFunction(() => !document.querySelector('[aria-label="Recovery-Paket"]').disabled);
    await offline.getByRole('button', {name: 'Neuen Sync-Schlüssel erstellen'}).click();
    await offline.waitForFunction(() => document.querySelector('[aria-label="Recovery-Paket"]').value.length > 0);
    await offline.route('**/api/chart/v1/device-sync/**', route => route.abort());
    await offline.getByRole('button', {name: 'Aktuelles Layout verschlüsselt speichern'}).click();
    await offline.waitForFunction(() => document.querySelector('[role="status"]').textContent.includes('Offline:'));
    const queued = await offline.evaluate(() => new Promise((resolve, reject) => {
      const open = indexedDB.open('2eas-chart-sync', 1);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result, request = db.transaction('encrypted-outbox').objectStore('encrypted-outbox').getAll();
        request.onsuccess = () => { db.close(); resolve(request.result); };
        request.onerror = () => reject(request.error);
      };
    }));
    assert.equal(queued.length, 1);
    assert.ok(queued[0].envelope.ciphertext);
    assert.equal('document' in queued[0], false);
    assert.equal(JSON.stringify(queued).includes(JSON.stringify(DOC)), false);
    assert.equal(JSON.stringify(queued).includes(recoveryPackage), false);
    await offline.unroute('**/api/chart/v1/device-sync/**');
    await offline.route('**/api/chart/v1/device-sync/**', async route => {
      const req = route.request();
      if (req.method() === 'GET') return route.fulfill({status: 404, contentType: 'application/json', body: JSON.stringify({detail: 'not found'})});
      const body = req.postDataJSON();
      return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({
        bundleId: new URL(req.url()).pathname.split('/').pop(), account: 'titan', symbol: 'XAUUSD',
        ...body, revision: 1, createdUtc: Math.floor(Date.now() / 1000),
      })});
    });
    await offline.getByRole('button', {name: 'Recovery-Paket importieren'}).click();
    await offline.waitForFunction(() => document.querySelector('[role="status"]').textContent.includes('synchronisiert'));
    const remaining = await offline.evaluate(() => new Promise(resolve => {
      const open = indexedDB.open('2eas-chart-sync', 1);
      open.onsuccess = () => { const db = open.result, req = db.transaction('encrypted-outbox').objectStore('encrypted-outbox').getAll(); req.onsuccess = () => { db.close(); resolve(req.result.length); }; };
    }));
    assert.equal(remaining, 0);

    // An offline save with an unknown base revision must not replace a newer head.
    const stale = await browser.newPage();
    stale.setDefaultTimeout(5000);
    await stale.goto(`http://127.0.0.1:${address.port}/`);
    await stale.evaluate(doc => window.ChartStudioServerSync.mount({panel: document.querySelector('#panel'), account: 'titan',
      getSymbol: () => 'XAUUSD', exportDocument: () => doc, importDocument: () => true}), DOC);
    await stale.waitForFunction(() => !document.querySelector('[aria-label="Recovery-Paket"]').disabled);
    await stale.getByRole('button', {name: 'Neuen Sync-Schlüssel erstellen'}).click();
    await stale.waitForFunction(() => document.querySelector('[aria-label="Recovery-Paket"]').value.length > 0);
    await stale.route('**/api/chart/v1/device-sync/**', route => route.abort());
    await stale.getByRole('button', {name: 'Aktuelles Layout verschlüsselt speichern'}).click();
    await stale.waitForFunction(() => document.querySelector('[role="status"]').textContent.includes('Offline:'));
    let stalePutCount = 0;
    await stale.unroute('**/api/chart/v1/device-sync/**');
    await stale.route('**/api/chart/v1/device-sync/**', async route => {
      if (route.request().method() === 'PUT') { stalePutCount++; return route.fulfill({status: 500}); }
      const bundleId = new URL(route.request().url()).pathname.split('/').pop();
      return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({
        bundleId, account: 'titan', symbol: 'XAUUSD', ...cryptoResult.envelope, revision: 4, createdUtc: 4,
      })});
    });
    await stale.getByRole('button', {name: 'Recovery-Paket importieren'}).click();
    await stale.waitForFunction(() => !document.querySelector('.cs-sync-conflict').hidden);
    assert.equal(stalePutCount, 0, 'unknown base revision prompts conflict instead of overwriting current head');
    assert.equal(await stale.locator('.cs-sync-conflict button').count(), 3);
    await stale.close();

    // A delayed response from an old account cannot import into the new account chart.
    const switched = await browser.newPage();
    switched.setDefaultTimeout(5000);
    await switched.goto(`http://127.0.0.1:${address.port}/`);
    await switched.evaluate(doc => {
      window.importedLayouts = [];
      window.ChartStudioServerSync.mount({panel: document.querySelector('#panel'), account: 'titan', getSymbol: () => 'XAUUSD',
        exportDocument: () => doc, importDocument: value => (window.importedLayouts.push(value), true)});
    }, DOC);
    await switched.waitForFunction(() => !document.querySelector('[aria-label="Recovery-Paket"]').disabled);
    await switched.getByRole('button', {name: 'Neuen Sync-Schlüssel erstellen'}).click();
    await switched.waitForFunction(() => document.querySelector('[aria-label="Recovery-Paket"]').value.length > 0);
    let releaseRemote;
    let markRemoteStarted;
    const remoteStarted = new Promise(resolve => { markRemoteStarted = resolve; });
    await switched.route('**/api/chart/v1/device-sync/**', async route => {
      if (route.request().method() === 'GET') {
        markRemoteStarted();
        await new Promise(resolve => { releaseRemote = resolve; });
        const bundleId = new URL(route.request().url()).pathname.split('/').pop();
        return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({
          bundleId, account: 'titan', symbol: 'XAUUSD', ...cryptoResult.envelope, revision: 1, createdUtc: 1,
        })});
      }
      return route.fulfill({status: 500});
    });
    await switched.getByRole('button', {name: 'Serverstand laden'}).click();
    await remoteStarted;
    await switched.evaluate(() => window.ChartStudioServerSync.scope('icmarkets10k', 'XAUUSD'));
    releaseRemote();
    await switched.waitForFunction(() => document.querySelector('[role="status"]').textContent.includes('Scope wurde während'));
    assert.deepEqual(await switched.evaluate(() => window.importedLayouts), []);
    await switched.close();

    // A delayed 409 during outbox retry cannot reopen an old-account conflict after a scope switch.
    const retrySwitch = await browser.newPage();
    retrySwitch.setDefaultTimeout(5000);
    await retrySwitch.goto(`http://127.0.0.1:${address.port}/`);
    await retrySwitch.evaluate(doc => window.ChartStudioServerSync.mount({panel: document.querySelector('#panel'), account: 'titan',
      getSymbol: () => 'XAUUSD', exportDocument: () => doc, importDocument: () => true}), DOC);
    await retrySwitch.waitForFunction(() => !document.querySelector('[aria-label="Recovery-Paket"]').disabled);
    const pendingSync = await retrySwitch.evaluate(async doc => {
      const sync = window.ChartStudioDeviceSync, bundle = await sync.createRecoveryPackage('titan', 'XAUUSD');
      const envelope = await sync.encryptDocument(doc, bundle), key = `${bundle.bundleId}|${bundle.account}|${bundle.symbol}`;
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('2eas-chart-sync', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('encrypted-outbox');
        req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
      });
      await new Promise((resolve, reject) => {
        const tx = db.transaction('encrypted-outbox', 'readwrite');
        tx.objectStore('encrypted-outbox').put({account: bundle.account, symbol: bundle.symbol,
          bundleId: bundle.bundleId, envelope, baseRevision: 0, queuedUtc: Date.now()}, key);
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
      });
      db.close(); return bundle.recoveryPackage;
    }, DOC);
    let releaseConflict;
    let markConflictStarted;
    const conflictStarted = new Promise(resolve => { markConflictStarted = resolve; });
    await retrySwitch.route('**/api/chart/v1/device-sync/**', async route => {
      if (route.request().method() === 'GET') return route.fulfill({status: 404, contentType: 'application/json', body: JSON.stringify({detail: 'missing'})});
      markConflictStarted();
      await new Promise(resolve => { releaseConflict = resolve; });
      return route.fulfill({status: 409, contentType: 'application/json', body: JSON.stringify({detail: {code: 'REVISION_CONFLICT', message: 'changed', currentRevision: 1}})});
    });
    await retrySwitch.locator('[aria-label="Recovery-Paket"]').fill(pendingSync);
    await retrySwitch.getByRole('button', {name: 'Recovery-Paket importieren'}).click();
    await conflictStarted;
    await retrySwitch.evaluate(() => window.ChartStudioServerSync.scope('icmarkets10k', 'XAUUSD'));
    releaseConflict();
    await retrySwitch.waitForTimeout(100);
    assert.equal(await retrySwitch.locator('.cs-sync-conflict').isHidden(), true);
    await retrySwitch.close();

    // A race after reading the head must expose all three explicit recovery choices.
    for (const choice of ['mine', 'remote', 'copy']) {
      const conflictPage = await browser.newPage();
      conflictPage.setDefaultTimeout(5000);
      await conflictPage.goto(`http://127.0.0.1:${address.port}/`);
      await conflictPage.evaluate(doc => {
        window.importedLayouts = [];
        window.ChartStudioServerSync.mount({panel: document.querySelector('#panel'), account: 'titan',
          getSymbol: () => 'XAUUSD', exportDocument: () => doc,
          importDocument: value => (window.importedLayouts.push(value), true)});
      }, DOC);
      await conflictPage.waitForFunction(() => !document.querySelector('[aria-label="Recovery-Paket"]').disabled);
      const remote = await conflictPage.evaluate(async () => {
        const sync = window.ChartStudioDeviceSync;
        const bundle = await sync.createRecoveryPackage('titan', 'XAUUSD');
        const document = {schemaVersion: 1, timeframe: 'H1', drawings: [], options: {ema20: false}, indicators: {}};
        return {recoveryPackage: bundle.recoveryPackage, envelope: await sync.encryptDocument(document, bundle), document};
      });
      let mode = 'conflict';
      await conflictPage.route('**/api/chart/v1/device-sync/**', async route => {
        const req = route.request(), bundleId = new URL(req.url()).pathname.split('/').pop();
        if (req.method() === 'GET') return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({
          bundleId, account: 'titan', symbol: 'XAUUSD', ...remote.envelope,
          revision: mode === 'mine' ? 3 : 2, createdUtc: Math.floor(Date.now() / 1000),
        })});
        if (mode === 'conflict') return route.fulfill({status: 409, contentType: 'application/json', body: JSON.stringify({detail: {
          code: 'REVISION_CONFLICT', message: 'changed elsewhere', currentRevision: 3,
        }})});
        const body = req.postDataJSON();
        return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({
          bundleId, account: body.account, symbol: body.symbol, ...body,
          revision: mode === 'mine' ? 4 : 1, createdUtc: Math.floor(Date.now() / 1000),
        })});
      });
      await conflictPage.locator('[aria-label="Recovery-Paket"]').fill(remote.recoveryPackage);
      await conflictPage.getByRole('button', {name: 'Recovery-Paket importieren'}).click();
      await conflictPage.waitForFunction(() => document.querySelector('[role="status"]').textContent.includes('geladen'));
      await conflictPage.getByRole('button', {name: 'Aktuelles Layout verschlüsselt speichern'}).click();
      await conflictPage.waitForFunction(() => !document.querySelector('.cs-sync-conflict').hidden);
      assert.equal(await conflictPage.locator('.cs-sync-conflict button').count(), 3);
      if (choice === 'remote') {
        await conflictPage.locator('.cs-sync-conflict').getByRole('button', {name: 'Serverstand'}).click();
        await conflictPage.waitForFunction(() => document.querySelector('[role="status"]').textContent.includes('Serverstand v2'));
        assert.deepEqual(await conflictPage.evaluate(() => window.importedLayouts.at(-1)), remote.document);
        const pending = await conflictPage.evaluate(() => new Promise(resolve => {
          const open = indexedDB.open('2eas-chart-sync', 1);
          open.onsuccess = () => { const db = open.result, req = db.transaction('encrypted-outbox').objectStore('encrypted-outbox').getAll(); req.onsuccess = () => { db.close(); resolve(req.result.length); }; };
        }));
        assert.equal(pending, 0, 'choosing the server version discards the stale encrypted pending write');
      } else if (choice === 'mine') {
        mode = 'mine';
        await conflictPage.locator('.cs-sync-conflict').getByRole('button', {name: 'Meine Änderungen'}).click();
        await conflictPage.waitForFunction(() => document.querySelector('[role="status"]').textContent.includes('v4 gespeichert'));
      } else {
        mode = 'copy';
        await conflictPage.locator('.cs-sync-conflict').getByRole('button', {name: 'Als Kopie speichern'}).click();
        await conflictPage.waitForFunction(() => document.querySelector('[role="status"]').textContent.includes('Kopie gespeichert'));
        assert.notEqual(await conflictPage.locator('[aria-label="Recovery-Paket"]').inputValue(), remote.recoveryPackage);
      }
      await conflictPage.close();
    }

    // Key rotation re-encrypts and verifies every retained revision into a new bundle.
    const rotatePage = await browser.newPage();
    rotatePage.setDefaultTimeout(5000);
    await rotatePage.goto(`http://127.0.0.1:${address.port}/`);
    await rotatePage.evaluate(doc => window.ChartStudioServerSync.mount({panel: document.querySelector('#panel'), account: 'titan',
      getSymbol: () => 'XAUUSD', exportDocument: () => doc, importDocument: () => true}), DOC);
    await rotatePage.waitForFunction(() => !document.querySelector('[aria-label="Recovery-Paket"]').disabled);
    const rotation = await rotatePage.evaluate(async doc => {
      const sync = window.ChartStudioDeviceSync, bundle = await sync.createRecoveryPackage('titan', 'XAUUSD');
      const first = await sync.encryptDocument(doc, bundle);
      const secondDoc = {...doc, options: {ema20: false}};
      const second = await sync.encryptDocument(secondDoc, bundle);
      return {recoveryPackage: bundle.recoveryPackage, bundleId: bundle.bundleId, first, second, secondDoc};
    }, DOC);
    let rotatedWrites = [];
    await rotatePage.route('**/api/chart/v1/device-sync/**', async route => {
      const req = route.request(), url = new URL(req.url()), bundleId = url.pathname.split('/').pop();
      if (req.method() === 'GET' && url.pathname.endsWith('/history')) {
        return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({items: [
          {revision: 2, formatVersion: 1, ...rotation.second, createdUtc: 2},
          {revision: 1, formatVersion: 1, ...rotation.first, createdUtc: 1},
        ]})});
      }
      if (req.method() === 'GET') return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({
        bundleId, account: 'titan', symbol: 'XAUUSD', ...rotation.second, revision: 2, createdUtc: 2,
      })});
      const body = req.postDataJSON();rotatedWrites.push({bundleId,body});
      return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({
        bundleId, account: body.account, symbol: body.symbol, ...body,
        revision: body.expectedRevision + 1, createdUtc: body.expectedRevision + 1,
      })});
    });
    await rotatePage.locator('[aria-label="Recovery-Paket"]').fill(rotation.recoveryPackage);
    await rotatePage.getByRole('button', {name: 'Recovery-Paket importieren'}).click();
    await rotatePage.waitForFunction(() => document.querySelector('[role="status"]').textContent.includes('geladen'));
    await rotatePage.getByRole('button', {name: 'Schlüssel rotieren'}).click();
    await rotatePage.waitForFunction(() => document.querySelector('[role="status"]').textContent.includes('2 Revisionen mit neuem Schlüssel verifiziert'));
    assert.equal(rotatedWrites.length, 2);
    assert.equal(rotatedWrites[0].body.expectedRevision, 0);
    assert.equal(rotatedWrites[1].body.expectedRevision, 1);
    assert.notEqual(rotatedWrites[0].bundleId, rotation.bundleId);
    assert.notEqual(await rotatePage.locator('[aria-label="Recovery-Paket"]').inputValue(), rotation.recoveryPackage);
    await rotatePage.close();

    // Unsupported remote versions are archived and never silently overwritten.
    const futurePage = await browser.newPage();
    futurePage.setDefaultTimeout(5000);
    await futurePage.goto(`http://127.0.0.1:${address.port}/`);
    await futurePage.evaluate(doc => window.ChartStudioServerSync.mount({panel: document.querySelector('#panel'), account: 'titan',
      getSymbol: () => 'XAUUSD', exportDocument: () => doc, importDocument: () => true}), DOC);
    await futurePage.waitForFunction(() => !document.querySelector('[aria-label="Recovery-Paket"]').disabled);
    let futurePutCount = 0;
    await futurePage.route('**/api/chart/v1/device-sync/**', async route => {
      if (route.request().method() === 'PUT') { futurePutCount++; return route.fulfill({status: 500, body: 'must not write'}); }
      const bundleId = new URL(route.request().url()).pathname.split('/').pop();
      return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({
        bundleId, account: 'titan', symbol: 'XAUUSD', formatVersion: 2,
        nonce: cryptoResult.envelope.nonce, ciphertext: cryptoResult.envelope.ciphertext,
        revision: 7, createdUtc: 7,
      })});
    });
    await futurePage.getByRole('button', {name: 'Neuen Sync-Schlüssel erstellen'}).click();
    await futurePage.waitForFunction(() => document.querySelector('[aria-label="Recovery-Paket"]').value.length > 0);
    const firstArchive = futurePage.waitForEvent('download');
    await futurePage.getByRole('button', {name: 'Serverstand laden'}).click();
    assert.match((await firstArchive).suggestedFilename(), /2eas-sync-.*-r7\.json/);
    const secondArchive = futurePage.waitForEvent('download');
    await futurePage.getByRole('button', {name: 'Aktuelles Layout verschlüsselt speichern'}).click();
    assert.match((await secondArchive).suggestedFilename(), /2eas-sync-.*-r7\.json/);
    await futurePage.waitForFunction(() => !document.querySelector('.cs-sync-conflict').hidden);
    assert.equal(futurePutCount, 0);
    await futurePage.close();

    // Legacy/plain local layouts remain exportable and can be imported without overwriting their source.
    const migrationPage = await browser.newPage();
    migrationPage.setDefaultTimeout(5000);
    await migrationPage.goto(`http://127.0.0.1:${address.port}/`);
    await migrationPage.evaluate(doc => {
      window.currentDoc = doc;window.importedLayouts = [];
      window.ChartStudioServerSync.mount({panel: document.querySelector('#panel'), account: 'titan',
        getSymbol: () => 'XAUUSD', exportDocument: () => window.currentDoc,
        importDocument: value => (window.importedLayouts.push(value), window.currentDoc = value, true)});
    }, DOC);
    await migrationPage.waitForFunction(() => !document.querySelector('[aria-label="Recovery-Paket"]').disabled);
    const layoutDownload = migrationPage.waitForEvent('download');
    await migrationPage.getByRole('button', {name: 'Lokales Layout exportieren'}).click();
    const filePath = await (await layoutDownload).path();
    const exported = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(exported.account, 'titan');
    assert.equal(exported.symbol, 'XAUUSD');
    assert.deepEqual(exported.document, {...DOC, symbol: 'XAUUSD'});
    assert.equal(JSON.stringify(exported).includes('positionDraft'), false);
    await migrationPage.locator('[aria-label="Layoutdatei importieren"]').setInputFiles({
      name: 'legacy-layout.json', mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({format: '2eas-chart-layout:v1', account: 'titan', symbol: 'XAUUSD', document: {...DOC, symbol: 'XAUUSD', timeframe: 'H1'}})),
    });
    await migrationPage.getByText('Layoutdatei importieren', {exact: true}).click();
    await migrationPage.waitForFunction(() => document.querySelector('[role="status"]').textContent.includes('Layout lokal geladen'));
    assert.equal((await migrationPage.evaluate(() => window.importedLayouts.at(-1))).timeframe, 'H1');
    await migrationPage.close();
    console.log('Chart Studio device-sync browser contracts passed');
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });

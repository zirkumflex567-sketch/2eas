const assert = require('node:assert/strict');
const path = require('node:path');

global.window = globalThis;
require(path.join(__dirname, '..', 'static', 'chart-studio-server-sync.js'));

async function main() {
  const sync = globalThis.ChartStudioDeviceSync;
  assert.ok(sync, 'encrypted sync client is installed');
  const source = {schemaVersion: 1, timeframe: 'M15', drawings: [], options: {}, indicators: {}};
  const created = await sync.createRecoveryPackage('titan', 'XAUUSD');
  assert.match(created.recoveryPackage, /^2eas-sync:v1:/);
  const imported = await sync.parseRecoveryPackage(created.recoveryPackage);
  assert.equal(imported.bundleId, created.bundleId);
  assert.equal(imported.account, 'titan');
  assert.equal(imported.symbol, 'XAUUSD');

  const encrypted = await sync.encryptDocument(source, imported);
  assert.equal(encrypted.formatVersion, 1);
  assert.equal(JSON.stringify(encrypted).includes('M15'), false);
  assert.deepEqual(await sync.decryptDocument(encrypted, imported), source);
  await assert.rejects(sync.encryptDocument({...source, symbol: 'EURUSD'}, imported), /Symbol/i);
  await assert.rejects(sync.decryptDocument({...encrypted, formatVersion: 2}, imported), /nicht unterstützt/);

  const otherKey = await sync.createRecoveryPackage('titan', 'XAUUSD');
  await assert.rejects(sync.decryptDocument(encrypted,
    await sync.parseRecoveryPackage(otherKey.recoveryPackage)));
  await assert.rejects(sync.decryptDocument(encrypted,
    {...imported, account: 'xau5m_m5'}));
  const tampered = {...encrypted, ciphertext: encrypted.ciphertext.slice(0, -1) +
    (encrypted.ciphertext.endsWith('A') ? 'B' : 'A')};
  await assert.rejects(sync.decryptDocument(tampered, imported));

  assert.throws(() => sync.validateDocument({
    ...source, positions: [{ticket: 123}],
  }), /broker|position|order/i);
  assert.throws(() => sync.validateDocument({
    ...source, drawings: [{kind: 'text', label: 'ticket:123', anchors: [{time: 1, price: 1}], orderId: 123}],
  }), /broker|position|order/i);
  console.log('Chart Studio device-sync crypto contracts passed');
}

main().catch(error => { console.error(error); process.exitCode = 1; });

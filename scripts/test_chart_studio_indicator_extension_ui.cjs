"use strict";

const assert = require("node:assert/strict");
const { generateKeyPairSync } = require("node:crypto");
const { spawn, spawnSync } = require("node:child_process");
const { chromium } = require("playwright");

(async () => {
  const server = spawn("python", ["-m", "http.server", "8872", "--bind", "127.0.0.1"],
    { cwd: process.cwd(), windowsHide: true, stdio: "ignore" });
  let browser;
  try {
    await waitForServer(server);
    browser = await chromium.launch({ headless: true, executablePath: process.env.CHART_STUDIO_CHROMIUM_PATH || undefined });
    const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
    const errors = [];
    const posts = [];
    const apiRequests=[];
    const keyPair=generateKeyPairSync("ed25519");
    const privateKey=keyPair.privateKey.export({type:"pkcs8",format:"der"});
    const publicKey=keyPair.publicKey.export({type:"spki",format:"der"}).subarray(-32).toString("base64");
    const signingKeyId="browser-test";
    page.on("request",request=>{if(new URL(request.url()).pathname.startsWith("/api/"))apiRequests.push({method:request.method(),url:request.url(),body:request.postData()||""})});
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/api/chart/v1/indicator-extensions/preview", async route => {
      assert.equal(route.request().method(), "POST");
      const body = route.request().postDataJSON();
      posts.push(body);
      assert.equal(body.account, "titan");
      assert.equal(body.symbol, "XAUUSD");
      assert.equal(body.timeframe, "M15");
      assert.equal(body.bars.length, 120);
      assert.equal(body.bars[0].time, 1700000000);
      assert.deepEqual(body.parameters, {});
      assert.ok(!body.package.includes(privateKey.toString("base64")),"private key bytes never reach the API");
      const verifyCode=[
        "import base64,json,sys",
        "from chart_studio.indicator_extensions import parse_signed_package",
        "parsed=parse_signed_package(sys.stdin.buffer.read(),trusted_keys={"+JSON.stringify(signingKeyId)+":base64.b64decode("+JSON.stringify(publicKey)+")})",
        "print(json.dumps(parsed['manifest'],ensure_ascii=False,sort_keys=True,separators=(',',':')))",
      ].join("; ");
      const verification=spawnSync(process.env.PYTHON||"python",["-c",verifyCode],
        {cwd:process.cwd(),input:Buffer.from(body.package),encoding:"utf8"});
      assert.equal(verification.status,0,verification.stderr||"browser-exported signature verifies in Python");
      assert.equal(JSON.parse(verification.stdout).id,"close-copy");
      await route.fulfill({ status: 200, contentType: "application/json", headers: { "cache-control": "no-store" },
        body: JSON.stringify({
          account: "titan", symbol: "XAUUSD", timeframe: "M15",
          indicator: { id: "close-copy", version: "1.0.0", name: "Close copy" },
          source: "CALLER_SUPPLIED_BARS", canExecute: false,
          series: body.bars.map(bar => ({ time: bar.time, value: bar.close }))
        })
      });
    });
    await page.goto("http://127.0.0.1:8872/static/chart-studio-fixture.html", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__chartSmokeReady === true);
    await page.locator("#cs-beta-toggle").click();
    await page.locator(".cs-indicator-extension-panel > summary").click();
    await page.locator(".cs-indicator-extension-export > summary").click();
    const storageBefore=await page.evaluate(()=>JSON.stringify({local:Object.keys(localStorage).sort(),session:Object.keys(sessionStorage).sort()}));
    await page.locator("[data-extension-manifest]").fill(JSON.stringify({
      id:"close-copy",version:"1.0.0",name:"Close copy",parameters:[
        {id:"scale",min:0.00001,max:0.0002,default:0.00011,step:0.00001}
      ],expression:{op:"add",left:{op:"mul",left:{source:"close"},right:{parameter:"scale"}},right:{constant:0.00001}}
    }));
    await page.locator("[data-extension-key-id]").fill(signingKeyId);
    await page.locator("[data-extension-signing-key]").setInputFiles({name:"invalid.pk8",mimeType:"application/octet-stream",buffer:Buffer.from("not a pkcs8 key")});
    await page.locator("[data-extension-export]").click();
    await page.waitForFunction(()=>document.querySelector("[data-extension-export-status]")?.textContent.includes("INVALID_PKCS8"));
    assert.deepEqual(apiRequests.filter(request=>request.method!=="GET"),[],"invalid signing key is rejected locally");
    assert.deepEqual(await page.evaluate(()=>JSON.stringify({local:Object.keys(localStorage).sort(),session:Object.keys(sessionStorage).sort()})),storageBefore,
      "a rejected private key is not stored");
    await page.locator("[data-extension-signing-key]").setInputFiles({name:"publisher.pk8",mimeType:"application/octet-stream",buffer:privateKey});
    const downloadPromise=page.waitForEvent("download");
    await page.locator("[data-extension-export]").click();
    const download=await downloadPromise;
    const downloadStream=await download.createReadStream();
    const packageChunks=[];
    for await(const chunk of downloadStream)packageChunks.push(chunk);
    const exportedBytes=Buffer.concat(packageChunks);
    const exportedPackage=JSON.parse(exportedBytes.toString("utf8"));
    assert.equal(exportedPackage.schemaVersion,1);
    assert.equal(exportedPackage.keyId,signingKeyId);
    assert.equal(exportedPackage.manifest.id,"close-copy");
    assert.deepEqual(apiRequests.filter(request=>request.method!=="GET"),[],"local signing makes no API write or upload");
    assert.ok(apiRequests.every(request=>!request.body.includes(privateKey.toString("base64"))),"private key bytes never appear in API request bodies");
    assert.equal(await page.locator("[data-extension-signing-key]").inputValue(),"");
    await page.evaluate(() => {
      const chart = window.__chart;
      const add = chart.addLineSeries.bind(chart);
      const remove = chart.removeSeries.bind(chart);
      window.__extensionSeries = [];
      window.__extensionSeriesRemoved = 0;
      chart.addLineSeries = options => {
        const series = add(options);
        if (options.title?.endsWith("· Erweiterung")) window.__extensionSeries.push(series);
        return series;
      };
      chart.removeSeries = series => {
        if (window.__extensionSeries.includes(series)) window.__extensionSeriesRemoved += 1;
        return remove(series);
      };
    });
    await page.locator("[data-extension-file]").setInputFiles({ name: "close-copy.json", mimeType: "application/json", buffer: exportedBytes });
    await page.locator("[data-extension-preview]").click();
    await page.waitForFunction(() => document.querySelector("[data-extension-status]")?.textContent.includes("signiert und verifiziert"));
    assert.equal(await page.evaluate(() => window.__extensionSeries.length), 1);
    assert.equal(posts.length, 1);
    assert.match(await page.locator("[data-extension-status]").textContent(), /120 Werte.*CALLER_SUPPLIED_BARS.*nicht ausführbar.*nur aktuelle Sitzung/);
    const catalog=page.locator(".cs-catalog");
    await catalog.getByRole("searchbox",{name:"Indikator suchen"}).fill("Close copy");
    const extensionEntry=catalog.locator('.cs-catalog-entry[data-indicator="extension-close-copy"]');
    assert.equal(await extensionEntry.count(),1,"a verified signed extension appears in the searchable indicator catalog");
    assert.match(await extensionEntry.textContent(),/Close copy.*Benutzerdefiniert.*1\.0\.0.*Sitzung/);
    const catalogPreview=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith("/api/chart/v1/indicator-extensions/preview")&&response.request().method()==="POST");
    await extensionEntry.getByRole("button",{name:"Vorschau"}).click();
    assert.equal((await catalogPreview).ok(),true);
    assert.equal(posts.length,2,"catalog preview reuses the verified package preview route");
    await catalog.getByRole("searchbox",{name:"Indikator suchen"}).fill("");
    assert.equal(await page.evaluate(() => JSON.stringify({local:Object.keys(localStorage).sort(),session:Object.keys(sessionStorage).sort()})), storageBefore,
      "private keys, extension packages, and preview output remain session-only");

    await page.evaluate(() => ChartStudioBeta.account("xau5m_m5"));
    assert.equal(await page.evaluate(() => window.__extensionSeriesRemoved), 2,
      "account switch removes the rendered extension from the price chart");
    assert.equal(await page.locator('.cs-catalog-entry[data-indicator="extension-close-copy"]').count(),0,
      "session extension is removed from the catalog when chart scope changes");
    assert.match(await page.locator("[data-extension-status]").textContent(), /Konten- oder Zeitrahmenwechsel/);
    assert.deepEqual(errors, []);
    console.log("PASS signed extension browser preview: verified-result rendering, demo account isolation, session-only state");
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});

async function waitForServer(server) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (server.exitCode !== null) throw new Error("fixture server exited before startup");
    try {
      const response = await fetch("http://127.0.0.1:8872/static/chart-studio-fixture.html");
      if (response.ok) return;
    } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error("fixture server startup timed out");
}

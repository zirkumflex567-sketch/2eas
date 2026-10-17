/* Read-only MTF panel: strict source scope, explicit refresh, stale-response cancellation. */
(()=>{
"use strict";
const FRAMES=window.ChartStudioMTF?.FRAMES||["D1","H4","H1","M15","M5"];
const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const endpoint=()=>window.location.pathname.startsWith("/stt")?"/stt":"";
function mount({panel,account,symbol,timeframe}){
 if(!panel||!window.ChartStudioMTF)return null;
 const section=document.createElement("details");section.className="cs-mtf-panel";section.innerHTML=
  '<summary>MTF-Konfluenz · geschlossene MT5-Kerzen · read-only</summary><div class="cs-mtf-controls">'+
  '<label>Stichtag UTC <input type="datetime-local" step="60" data-mtf-asof></label> '+
  '<button type="button" data-mtf-refresh>Aktualisieren</button></div>'+
  '<p data-mtf-status role="status" aria-live="polite">Noch nicht geladen. Nach Stichtag werden ausschließlich bereits geschlossene Kerzen verwendet.</p>'+
  '<div class="cs-mtf-table-wrap"><table><thead><tr><th>TF</th><th>Status / Grund</th><th>Richtung</th><th>EMA 20 / 50 / 200</th><th>Letzte geschlossene Kerze (UTC)</th><th>Bars</th></tr></thead><tbody data-mtf-rows></tbody></table></div>'+
  '<p>Quelle: MT5 Verified. EMA-Ausrichtung ist Kontext, kein Handelssignal. Es wird kein Gesamtscore berechnet.</p>';
 panel.prepend(section);
 const rows=section.querySelector("[data-mtf-rows]"),status=section.querySelector("[data-mtf-status]"),asof=section.querySelector("[data-mtf-asof]");
 let scope={account,symbol,timeframe},generation=0,controller=null;
 function clear(message="Kontext geändert. Aktualisieren, um den neuen Scope zu laden."){
  generation++;controller?.abort();controller=null;rows.replaceChildren();for(const tf of FRAMES){const tr=document.createElement("tr");tr.innerHTML=`<th>${tf}</th><td>UNKNOWN · nicht geladen</td><td>UNKNOWN</td><td>—</td><td>—</td><td>0</td>`;rows.append(tr)}status.textContent=message;
 }
 function setContext(next){if(!next||next.account===scope.account&&next.symbol===scope.symbol&&next.timeframe===scope.timeframe)return;
  scope={...next};clear();}
 const date=new Date();date.setSeconds(0,0);asof.value=date.toISOString().slice(0,16);
 async function refresh(asOfOverride){
  controller?.abort();controller=new AbortController();const local=controller,requestGeneration=++generation,capturedScope={...scope};rows.replaceChildren();
  const asOfMs=asOfOverride===undefined?Date.parse(asof.value+"Z"):typeof asOfOverride==="string"&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(asOfOverride)?Date.parse(asOfOverride):NaN;
  if(!Number.isFinite(asOfMs)){status.textContent="UNKNOWN · ungültiger UTC-Stichtag";return false;}
  if(asOfOverride!==undefined)asof.value=new Date(asOfMs).toISOString().slice(0,16);
  const asOfUtc=asOfMs/1000,beforeCursor=Math.floor(asOfUtc);status.textContent="MT5-Kerzen werden read-only geladen …";
  const input={};const sourceErrors=[];let timedOut=false;const timeout=setTimeout(()=>{timedOut=true;local.abort()},12000);
  await Promise.all(FRAMES.map(async tf=>{
   try{
    const params=new URLSearchParams({account:capturedScope.account,symbol:capturedScope.symbol,tf,count:"1000"});if(asOfOverride!==undefined)params.set("before",String(beforeCursor));
    const url=new URL(endpoint()+"/api/candles",location.origin);url.search=params.toString();
    const response=await fetch(url.pathname+url.search,{method:"GET",cache:"no-store",credentials:"same-origin",signal:local.signal});
    if(!response.ok)throw new Error("HTTP "+response.status);
    const data=await response.json();
    if(data.accountId!==capturedScope.account||data.symbol!==capturedScope.symbol||data.timeframe!==tf||data.source!=="MT5_VERIFIED"||data.canExecute!==false||!Array.isArray(data.candles))throw new Error("Provenienz-/Scope-Prüfung fehlgeschlagen");
    window.ChartStudioMTF.frame(data.candles,tf,asOfUtc,capturedScope.symbol);input[tf]=data.candles;
   }catch(error){if(error.name!=="AbortError"||timedOut){sourceErrors.push(`${tf}: ${timedOut?"timeout":error.message}`);input[tf]=undefined}}
  }));
  clearTimeout(timeout);
  if(requestGeneration!==generation||local.signal.aborted&&!timedOut)return false;
  const result=window.ChartStudioMTF.calculate(input,asOfUtc,capturedScope.symbol);rows.replaceChildren();
  for(const tf of FRAMES){const f=result.frames[tf],tr=document.createElement("tr"),time=f.sourceTime?new Date(f.sourceTime*1000).toISOString():"—";
   const qualityWarning=f.dataQuality==="SESSION_HEURISTIC"?" · SESSION_HEURISTIC: Broker-Sitzung ungeprüft (Sessionlücke heuristisch toleriert)":"";
   tr.innerHTML=`<th>${tf}</th><td>${esc(f.status)} · ${esc(f.reason)}${esc(qualityWarning)}</td><td>${esc(f.bias)}</td><td>${f.status==="READY"?[f.ema20,f.ema50,f.ema200].map(x=>Number(x).toPrecision(7)).join(" / "):"—"}</td><td>${esc(time)}</td><td>${f.closedBars}</td>`;rows.append(tr);
  }
  status.textContent=sourceErrors.length?`Unvollständige Quellenantwort (${sourceErrors.join("; ")}); betroffene Zeile bleibt UNKNOWN.`:`Abfrage abgeschlossen · as-of ${asOfOverride??new Date(asOfMs).toISOString()} · ${result.ready}/5 Zeitrahmen mit ausreichender Historie.`;return true;
 }
 section.querySelector("[data-mtf-refresh]").addEventListener("click",()=>void refresh());
 clear("Noch nicht geladen. Stichtag wird als UTC interpretiert; nur geschlossene MT5-Kerzen zählen.");
 function refreshAt(asOfUtc){section.open=true;return refresh(asOfUtc)}
 return Object.freeze({setContext,clear,refreshAt});
}
window.ChartStudioMTFPanel=Object.freeze({mount});
})();

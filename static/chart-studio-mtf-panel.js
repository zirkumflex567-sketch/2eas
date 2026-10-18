/* Read-only MTF panel with manually stored, account+symbol scoped criteria. */
(()=>{
"use strict";
const FRAMES=window.ChartStudioMTF?.FRAMES||["D1","H4","H1","M15","M5"],CHOICES=["ANY","UP","DOWN","NEUTRAL"];
const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const endpoint=()=>window.location.pathname.startsWith("/stt")?"/stt":"";
const keyFor=scope=>`chart-studio-mtf-rules:v1:${encodeURIComponent(scope.account)}:${encodeURIComponent(scope.symbol.toUpperCase())}`;
function parseStrictUtc(value){
 const match=typeof value==="string"&&/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|\+00:00)$/.exec(value);if(!match)return NaN;
 const ms=Date.parse(value);if(!Number.isFinite(ms))return NaN;const date=new Date(ms);
 return date.getUTCFullYear()===Number(match[1])&&date.getUTCMonth()+1===Number(match[2])&&date.getUTCDate()===Number(match[3])&&date.getUTCHours()===Number(match[4])&&date.getUTCMinutes()===Number(match[5])&&date.getUTCSeconds()===Number(match[6])?ms:NaN;
}
function mount({panel,account,symbol,timeframe}){
 if(!panel||!window.ChartStudioMTF)return null;
 const section=document.createElement("details");section.className="cs-mtf-panel";section.innerHTML=
  '<summary>MTF-Konfluenz · geschlossene MT5-Kerzen · read-only</summary><div class="cs-mtf-controls">'+
  '<label>Stichtag UTC <input type="datetime-local" step="60" data-mtf-asof></label> '+
  '<button type="button" data-mtf-refresh>Aktualisieren</button></div>'+
  '<p data-mtf-status role="status" aria-live="polite">Noch nicht geladen. Nach Stichtag werden ausschließlich bereits geschlossene Kerzen verwendet.</p>'+
  '<div class="cs-mtf-table-wrap"><table><thead><tr><th>TF</th><th>Status / Grund</th><th>Richtung</th><th>EMA 20 / 50 / 200 · EMA20 Δ vs. vorherige geschlossene Kerze (%)</th><th>Volatilität · market-regime-v1</th><th>Letzte geschlossene Kerze (UTC)</th><th>Bars</th></tr></thead><tbody data-mtf-rows></tbody></table></div>'+
  '<details data-mtf-rule-editor><summary>Manuelle EMA-Kontextregeln</summary><p>Manueller EMA-Kontext, keine EA-Regel und keine Strategie. Lokal in diesem Browser für Konto und Symbol gespeichert.</p><div data-mtf-rule-fields></div><button type="button" data-mtf-save>Regeln lokal speichern</button><p data-mtf-rule-status role="status" aria-live="polite"></p><div class="cs-mtf-rule-result" data-mtf-rule-result aria-live="polite"></div></details>'+
  '<p>Quelle: MT5 Verified. EMA-Ausrichtung ist Kontext, kein Handelssignal. Es wird kein Gesamtscore berechnet.</p>';
 panel.prepend(section);
 const rows=section.querySelector("[data-mtf-rows]"),status=section.querySelector("[data-mtf-status]"),asof=section.querySelector("[data-mtf-asof]"),ruleStatus=section.querySelector("[data-mtf-rule-status]"),resultBox=section.querySelector("[data-mtf-rule-result]"),fields=section.querySelector("[data-mtf-rule-fields]");
 fields.innerHTML=FRAMES.map(tf=>`<label>${tf} <select aria-label="${tf}" data-mtf-rule="${tf}">${CHOICES.map(c=>`<option value="${c}">${c==="ANY"?"Keine Anforderung (ANY)":c}</option>`).join("")}</select></label>`).join(" ");
 let scope={account,symbol,timeframe},generation=0,controller=null,currentProfile=null,featureCache=null,profileLoadError=false;
 function clear(message="Kontext geändert. Aktualisieren, um den neuen Scope zu laden."){
  generation++;controller?.abort();controller=null;featureCache=null;rows.replaceChildren();for(const tf of FRAMES){const tr=document.createElement("tr");tr.innerHTML=`<th>${tf}</th><td>UNKNOWN · nicht geladen</td><td>UNKNOWN</td><td>—</td><td>UNKNOWN · nicht geladen</td><td>—</td><td>0</td>`;rows.append(tr)}status.textContent=message;resultBox.replaceChildren();
 }
 function readProfile(){
  currentProfile=null;profileLoadError=false;for(const s of fields.querySelectorAll("select"))s.value="ANY";const k=keyFor(scope);
  try{const raw=localStorage.getItem(k);if(raw===null){ruleStatus.textContent="UNCONFIGURED · keine lokalen Regeln gespeichert.";for(const s of fields.querySelectorAll("select"))s.value="ANY";renderRuleResult();return;}
   let parsed;try{parsed=JSON.parse(raw)}catch(_){throw Error("Ungültiges gespeichertes JSON; unverändert belassen.")}
   try{window.ChartStudioMTF.validateRuleSet(parsed)}catch(error){throw Error("Ungültiges gespeichertes Profil: "+error.message)}
   if(parsed.accountId!==scope.account||parsed.symbol.toUpperCase()!==scope.symbol.toUpperCase())throw Error("Profil-Scope stimmt nicht überein; unverändert belassen.");
   currentProfile=parsed;for(const tf of FRAMES)fields.querySelector(`[data-mtf-rule="${tf}"]`).value=parsed.predicates[tf];ruleStatus.textContent=`Lokales Profil geladen · Revision ${parsed.revision}.`;renderRuleResult();
  }catch(error){profileLoadError=true;ruleStatus.textContent="Profil ungültig oder Speicher nicht lesbar · "+error.message;resultBox.textContent="UNKNOWN · Profil konnte nicht gelesen werden.";}
 }
 function renderRuleResult(){
  if(!currentProfile){if(!profileLoadError)resultBox.textContent="UNCONFIGURED · keine Anforderung konfiguriert.";return;}
  if(!featureCache||featureCache.account!==scope.account||featureCache.symbol!==scope.symbol||!Number.isFinite(featureCache.asOfUtc)){resultBox.textContent="Regeln gespeichert · Feature-Daten für diesen Scope und Stichtag noch nicht geladen.";return;}
  try{const evaluated=window.ChartStudioMTF.evaluateRuleSet(currentProfile,featureCache.features,{accountId:scope.account,symbol:scope.symbol,asOfUtc:featureCache.asOfUtc});
   resultBox.replaceChildren();const heading=document.createElement("p");heading.textContent=`Aggregate: ${evaluated.status} · Revision ${evaluated.revision} · as-of ${new Date(evaluated.asOfUtc*1000).toISOString()}`;resultBox.append(heading);
   const table=document.createElement("table");table.innerHTML='<thead><tr><th>TF</th><th>Expected</th><th>Actual</th><th>Status</th><th>Reason</th><th>Source time</th></tr></thead><tbody></tbody>';for(const tf of FRAMES){const c=evaluated.criteria[tf],tr=document.createElement("tr");tr.innerHTML=`<th>${tf}</th><td>${esc(c.expected)}</td><td>${esc(c.actual)}</td><td>${esc(c.status)}</td><td>${esc(c.reason||"—")}</td><td>${esc(c.sourceTime?new Date(c.sourceTime*1000).toISOString():"—")}</td>`;table.querySelector("tbody").append(tr)}resultBox.append(table);
  }catch(error){resultBox.textContent="UNKNOWN · Regelbewertung nicht verfügbar: "+error.message;}
 }
 function setContext(next){if(!next||next.account===scope.account&&next.symbol===scope.symbol&&next.timeframe===scope.timeframe)return;const dataScopeChanged=next.account!==scope.account||next.symbol!==scope.symbol;scope={...next};clear();if(dataScopeChanged)readProfile();}
 const date=new Date();date.setSeconds(0,0);asof.value=date.toISOString().slice(0,16);
 async function refresh(asOfOverride){
  controller?.abort();controller=new AbortController();const local=controller,requestGeneration=++generation,capturedScope={account:scope.account,symbol:scope.symbol};rows.replaceChildren();featureCache=null;resultBox.textContent="Feature-Daten werden geladen …";
  const asOfMs=asOfOverride===undefined?parseStrictUtc(asof.value.length===16?asof.value+":00Z":asof.value+"Z"):parseStrictUtc(asOfOverride);
  if(!Number.isFinite(asOfMs)){status.textContent="UNKNOWN · ungültiger UTC-Stichtag";return false;}
  if(asOfOverride!==undefined)asof.value=new Date(asOfMs).toISOString().slice(0,16);
  const asOfUtc=asOfMs/1000,beforeCursor=Math.floor(asOfUtc);status.textContent="MT5-Kerzen werden read-only geladen …";
  const input={};const sourceErrors=[];let timedOut=false;const timeout=setTimeout(()=>{timedOut=true;local.abort()},12000);
  await Promise.all(FRAMES.map(async tf=>{
   try{
    const params=new URLSearchParams({account:capturedScope.account,symbol:capturedScope.symbol,tf,count:"1000",before:String(beforeCursor)});
    const url=new URL(endpoint()+"/api/candles",location.origin);url.search=params.toString();
    const response=await fetch(url.pathname+url.search,{method:"GET",cache:"no-store",credentials:"same-origin",signal:local.signal});
    if(!response.ok)throw new Error("HTTP "+response.status);const data=await response.json();
    if(data.accountId!==capturedScope.account||data.symbol!==capturedScope.symbol||data.timeframe!==tf||data.source!=="MT5_VERIFIED"||data.canExecute!==false||!Array.isArray(data.candles))throw new Error("Provenienz-/Scope-Prüfung fehlgeschlagen");
    window.ChartStudioMTF.frame(data.candles,tf,asOfUtc,capturedScope.symbol);input[tf]=data.candles;
   }catch(error){if(error.name!=="AbortError"||timedOut){sourceErrors.push(`${tf}: ${timedOut?"timeout":error.message}`);input[tf]=undefined}}
  }));
  if(requestGeneration!==generation||local.signal.aborted&&!timedOut){clearTimeout(timeout);return false;}
  const features=window.ChartStudioMTF.calculate(input,asOfUtc,capturedScope.symbol),volatility={};
  const durations={M1:60,M5:300,M15:900,M30:1800,H1:3600,H4:14400,D1:86400};
  await Promise.all(FRAMES.map(async tf=>{
   const frame=features.frames[tf];
   if(frame.status!=="READY"){volatility[tf]=`UNKNOWN · MTF_${frame.reason||frame.status}`;return;}
   try{
    const params=new URLSearchParams({account:capturedScope.account,symbol:capturedScope.symbol,timeframe:tf,at:new Date(asOfMs).toISOString()}),url=new URL(endpoint()+"/api/chart/v1/regimes",location.origin);url.search=params.toString();
    const response=await fetch(url.pathname+url.search,{method:"GET",cache:"no-store",credentials:"same-origin",signal:local.signal});
    if(!response.ok)throw new Error("HTTP "+response.status);const data=await response.json(),sourceMs=parseStrictUtc(data.sourceTimeUtc),responseAsOfMs=parseStrictUtc(data.asOfUtc),allowed=["HIGH","LOW","NORMAL","UNKNOWN"];
    if(data.account!==capturedScope.account||data.frame?.symbol!==capturedScope.symbol||data.frame?.timeframe!==tf||data.source!=="MT5_VERIFIED"||data.canExecute!==false||data.revision!=="market-regime-v1"||responseAsOfMs!==asOfMs||data.barDurationSeconds!==durations[tf]||!Number.isFinite(sourceMs)||sourceMs/1000!==frame.sourceTime||sourceMs/1000+durations[tf]>asOfUtc||!allowed.includes(data.regimeTags?.volatility))throw new Error("Provenienz-, Source-Bar- oder As-of-Prüfung fehlgeschlagen");
    volatility[tf]=data.regimeTags.volatility==="UNKNOWN"?`UNKNOWN · ${(data.qualityFlags||[]).join(", ")||"REGIME_UNKNOWN"}`:`${data.regimeTags.volatility} · ${data.revision}`;
   }catch(error){volatility[tf]=`UNKNOWN · ${timedOut?"timeout":error.name==="AbortError"?"abgebrochen":error.message}`;if(error.name!=="AbortError"||timedOut)sourceErrors.push(`${tf} regime: ${timedOut?"timeout":error.message}`);}
  }));
  clearTimeout(timeout);if(requestGeneration!==generation||local.signal.aborted&&!timedOut)return false;
  featureCache={account:capturedScope.account,symbol:capturedScope.symbol,asOfUtc,features};rows.replaceChildren();
  for(const tf of FRAMES){const f=features.frames[tf],tr=document.createElement("tr"),time=f.sourceTime?new Date(f.sourceTime*1000).toISOString():"—",qualityWarning=f.dataQuality==="SESSION_HEURISTIC"?" · SESSION_HEURISTIC: Broker-Sitzung ungeprüft (Sessionlücke heuristisch toleriert)":"";
   const emaValues=f.status==="READY"?[f.ema20,f.ema50,f.ema200].map(x=>Number(x).toPrecision(7)).join(" / "):"—";
   const slope=f.status==="READY"&&Number.isFinite(f.ema20SlopePercent)?`${f.ema20SlopePercent>=0?"+":""}${f.ema20SlopePercent.toFixed(5)}%`:"—";
   tr.innerHTML=`<th>${tf}</th><td>${esc(f.status)} · ${esc(f.reason)}${esc(qualityWarning)}</td><td>${esc(f.bias)}</td><td>${emaValues} · Δ ${esc(slope)}</td><td data-volatility>${esc(volatility[tf]||"UNKNOWN · API_UNAVAILABLE")}</td><td>${esc(time)}</td><td>${f.closedBars}</td>`;rows.append(tr);
  }
  status.textContent=sourceErrors.length?`Unvollständige Quellenantwort (${sourceErrors.join("; ")}); betroffene Zeile bleibt UNKNOWN.`:`Abfrage abgeschlossen · as-of ${new Date(asOfMs).toISOString()} · ${features.ready}/5 Zeitrahmen mit ausreichender Historie.`;renderRuleResult();return true;
 }
 section.querySelector("[data-mtf-refresh]").addEventListener("click",()=>void refresh());
 section.querySelector("[data-mtf-save]").addEventListener("click",()=>{
  const k=keyFor(scope);try{
   let stored=null;const raw=localStorage.getItem(k);if(raw!==null){try{stored=JSON.parse(raw)}catch(_){throw Error("Ungültiges gespeichertes JSON; Speichern abgebrochen.")};try{window.ChartStudioMTF.validateRuleSet(stored)}catch(error){throw Error("Ungültiges gespeichertes Profil; Speichern abgebrochen: "+error.message)};if(stored.accountId!==scope.account||stored.symbol.toUpperCase()!==scope.symbol.toUpperCase())throw Error("Profil-Scope stimmt nicht überein; Speichern abgebrochen.");}
   const predicates=Object.fromEntries(FRAMES.map(tf=>[tf,fields.querySelector(`[data-mtf-rule="${tf}"]`).value]));
   if(stored&&FRAMES.every(tf=>stored.predicates[tf]===predicates[tf])){currentProfile=stored;profileLoadError=false;ruleStatus.textContent=`Keine Änderungen · Revision ${stored.revision}.`;renderRuleResult();return;}
   const candidate=stored?{...stored,revision:stored.revision+1,predicates,updatedAtUtc:new Date().toISOString()}:{schemaVersion:1,ruleVersion:"1.0.0",revision:1,profileId:window.crypto?.randomUUID?.()||`mtf-${Date.now()}-${Math.random().toString(36).slice(2)}`,accountId:scope.account,symbol:scope.symbol,predicates,updatedAtUtc:new Date().toISOString()};
   window.ChartStudioMTF.validateRuleSet(candidate);if(stored)window.ChartStudioMTF.validateRuleSetTransition(stored,candidate);localStorage.setItem(k,JSON.stringify(candidate));currentProfile=candidate;profileLoadError=false;ruleStatus.textContent=`Regeln lokal gespeichert · Revision ${candidate.revision}.`;renderRuleResult();
  }catch(error){ruleStatus.textContent="Speichern fehlgeschlagen · "+error.message;}
 });
 clear("Noch nicht geladen. Stichtag wird als UTC interpretiert; nur geschlossene MT5-Kerzen zählen.");readProfile();
 function refreshAt(asOfUtc){section.open=true;return refresh(asOfUtc)}
 return Object.freeze({setContext,clear,refreshAt});
}
window.ChartStudioMTFPanel=Object.freeze({mount});
})();

/* Optional read-only renderer preview. The v4 dashboard stays mounted and
   authoritative; the v5 bundle is fetched only after an explicit user click. */
(function(){
  "use strict";
  if(window.CHART_STUDIO_V5_PREVIEW_ENABLED!==true)return;
  let button=null,panel=null,host=null,status=null,title=null,autoFibButton=null,autoFibStatus=null;

  let scope=null,latest=null,engine=null,bridge=null,active=false,loading=null,autoFibEnabled=false;
  let generation=0,sequence=0,latestSequence=0;
  const setStatus=value=>{if(status)status.textContent=value};
  const same=(a,b)=>!!a&&!!b&&a.account===b.account&&a.symbol===b.symbol&&a.timeframe===b.timeframe;
  function currentScope(){return scope?{...scope}:null}
  function asset(name){
    const prefix=window.location.pathname.startsWith("/stt")?"/stt":"";
    return `${prefix}/static/${name}`;
  }
  function loadScript(name,ready){
    return new Promise((resolve,reject)=>{
      if(ready()){resolve();return}
      const script=document.createElement("script");script.src=asset(name);script.async=true;
      script.onload=()=>ready()?resolve():reject(new Error("V5-Renderer nicht verfügbar"));
      script.onerror=()=>reject(new Error("V5-Asset konnte nicht geladen werden"));
      document.head.appendChild(script);
    });
  }
  function ensureBundle(){
    if(window.ChartStudioV5?.createStudioV5)return Promise.resolve();
    if(!loading)loading=loadScript("chart-studio-v5.js",()=>!!window.ChartStudioV5?.createStudioV5)
      .catch(error=>{loading=null;throw error});
    return loading;
  }
  function destroyRenderer(){
    try{engine?.destroy()}catch(_){}
    engine=null;bridge=null;autoFibEnabled=false;if(autoFibButton){autoFibButton.setAttribute("aria-pressed","false");autoFibButton.textContent="Auto-Fibonacci einblenden";autoFibButton.disabled=!latest}if(autoFibStatus)autoFibStatus.textContent="";if(host)host.replaceChildren();
  }
  function timeframeSeconds(timeframe){return ({M1:60,M5:300,M15:900,M30:1800,H1:3600,H4:14400,D1:86400,W1:604800})[timeframe]||null}
  function renderAutoFib(){
    if(!engine||!scope||!latest||!Number.isSafeInteger(latest.snapshotAsOfUtc)||latest.snapshotAsOfUtc<=0)throw new Error("Server-Snapshot-Cutoff fehlt");
    const seconds=timeframeSeconds(scope.timeframe);if(!seconds)throw new Error("Timeframe nicht unterstützt");
    const value=engine.setAutoFibonacci({timeframeSeconds:seconds,visible:true},{source:"MT5_VERIFIED",account:scope.account,symbol:scope.symbol,timeframe:scope.timeframe,timeUtc:latest.snapshotAsOfUtc});
    autoFibEnabled=true;if(autoFibButton){autoFibButton.setAttribute("aria-pressed","true");autoFibButton.textContent="Auto-Fibonacci ausblenden"}
    if(autoFibStatus)autoFibStatus.textContent=value.result.available?`Auto-Fibonacci · ${value.result.direction==="UP"?"Aufwärtsimpuls":"Abwärtsimpuls"} · 7 Level · Kerzenquelle MT5_VERIFIED · Cutoff Server-UTC · Kerzenfrische ungeprüft`:`Auto-Fibonacci nicht verfügbar · ${value.result.reason||"WARMUP_OR_MISSING"}`;
    return value;
  }
  function clearAutoFib(){
    try{engine?.clearAutoFibonacci()}catch(_){}
    autoFibEnabled=false;if(autoFibButton){autoFibButton.setAttribute("aria-pressed","false");autoFibButton.textContent="Auto-Fibonacci einblenden"}if(autoFibStatus)autoFibStatus.textContent="";
    return true;
  }
  function mountRenderer(){
    if(!active||!scope||bridge||!window.ChartStudioV5?.createStudioV5||!window.ChartStudioV5Feed?.create)return;
    try{
      engine=window.ChartStudioV5.createStudioV5(host,scope.account,{symbol:scope.symbol,timeframe:scope.timeframe});
      bridge=window.ChartStudioV5Feed.create(engine,scope);
      setStatus("Warte auf verifizierte MT5-Kerzen …");
      if(latest){const token=bridge.beginRead();const result=bridge.update(latest,token);
        if(autoFibButton)autoFibButton.disabled=!Number.isSafeInteger(latest.snapshotAsOfUtc);
        setStatus(result.applied?`${result.candleCount} verifizierte Kerzen · read-only · Kerzenfrische ungeprüft`:"V5-Daten abgelehnt: "+result.reason)}
    }catch(error){destroyRenderer();setStatus("V5-Vorschau nicht verfügbar: "+String(error?.message||error).slice(0,160))}
  }
  function setScope(next){
    if(!window.ChartStudioV5Feed?.validScope(next))return false;
    if(same(scope,next))return true;
    scope={account:next.account,symbol:next.symbol,timeframe:next.timeframe};
    if(title)title.textContent=`Native v5 · ${scope.symbol} ${scope.timeframe} · ${scope.account}`;
    generation++;sequence=0;latestSequence=0;latest=null;
    if(bridge)bridge.clear();
    destroyRenderer();
    if(active&&window.ChartStudioV5?.createStudioV5)mountRenderer();
    setStatus("Scope gewechselt · warte auf verifizierte MT5-Kerzen …");
    return true;
  }
  function beginRead(){
    latestSequence=++sequence;
    return Object.freeze({generation,sequence:latestSequence});
  }
  function update(snapshot,token){
    if(!token||token.generation!==generation)return {applied:false,reason:"STALE_SCOPE"};
    if(token.sequence!==latestSequence)return {applied:false,reason:"STALE_REQUEST"};
    if(!snapshot||snapshot.accountId!==scope?.account||snapshot.symbol!==scope?.symbol||snapshot.timeframe!==scope?.timeframe){
      clear("Chartscope stimmt nicht überein");return {applied:false,reason:"SCOPE_MISMATCH"};
    }
    if(snapshot.source!=="MT5_VERIFIED"||snapshot.canExecute!==false){clear("Datenquelle nicht verifiziert");return {applied:false,reason:"UNVERIFIED_SOURCE"}}
    if(!window.ChartStudioV5Feed?.validCandles(snapshot.candles)){clear("MT5-Kerzen sind ungültig oder außerhalb des Limits");return {applied:false,reason:"INVALID_CANDLES"}}
    if(!Number.isSafeInteger(snapshot.snapshotAsOfUtc)||snapshot.snapshotAsOfUtc<=0){clear("Server-Snapshot-Cutoff fehlt");return {applied:false,reason:"INVALID_AS_OF"}}
    latest={...snapshot,candles:Array.isArray(snapshot.candles)?snapshot.candles.map(row=>({...row})):snapshot.candles};
    if(!active)return {applied:true,candleCount:latest.candles.length};
    if(!bridge)mountRenderer();
    if(!bridge)return {applied:false,reason:"ENGINE_UNAVAILABLE"};
    const result=bridge.update(latest,bridge.beginRead());
    if(!result.applied){clear("V5-Daten abgelehnt: "+result.reason);return result}
    if(autoFibButton)autoFibButton.disabled=false;
    if(autoFibEnabled)renderAutoFib();
    setStatus(`${result.candleCount} verifizierte Kerzen · read-only · Kerzenfrische ungeprüft`);
    return result;
  }
  function clear(message){
    latest=null;latestSequence=++sequence;
    clearAutoFib();try{bridge?.clear()}catch(_){}if(autoFibButton)autoFibButton.disabled=true;
    setStatus(message||"MT5-Kerzen derzeit nicht verfügbar");
  }
  window.ChartStudioV5Preview=Object.freeze({setScope,beginRead,update,clear,renderAutoFib,clearAutoFib,readAutoFibonacci:()=>engine?.readAutoFibonacci?.()||null,inspect:()=>({active,scope:currentScope(),generation,status:status?.textContent||"",autoFibonacci:!!engine?.readAutoFibonacci?.()})});
  function boot(){
    button=document.getElementById("chart-v5-preview-btn");panel=document.getElementById("chart-v5-preview-panel");
    host=document.getElementById("chart-v5-preview-host");status=document.getElementById("chart-v5-preview-status");
    title=document.getElementById("chart-v5-preview-title");
    autoFibButton=document.getElementById("chart-v5-auto-fib-btn");autoFibStatus=document.getElementById("chart-v5-auto-fib-status");
    if(!button||!panel||!host||!status)return;
    button.hidden=false;if(scope&&title)title.textContent=`Native v5 · ${scope.symbol} ${scope.timeframe} · ${scope.account}`;
    if(autoFibButton)autoFibButton.addEventListener("click",()=>{if(autoFibEnabled)clearAutoFib();else try{renderAutoFib()}catch(error){clearAutoFib();if(autoFibStatus)autoFibStatus.textContent="Auto-Fibonacci nicht verfügbar · "+String(error?.message||error).slice(0,120)}});
    button.addEventListener("click",async()=>{
      if(active){active=false;panel.hidden=true;button.setAttribute("aria-expanded","false");button.textContent="V5 Vorschau";destroyRenderer();return}
      active=true;panel.hidden=false;button.setAttribute("aria-expanded","true");button.textContent="V5 schließen";
      setStatus("Lade lokale v5-Vorschau …");
      try{await ensureBundle();mountRenderer();if(!bridge)throw new Error("Renderer konnte nicht erstellt werden")}
      catch(error){destroyRenderer();setStatus("V5-Vorschau nicht verfügbar: "+String(error?.message||error).slice(0,160))}
    });
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();

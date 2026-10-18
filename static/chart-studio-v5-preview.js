/* Optional read-only renderer preview. The v4 dashboard stays mounted and
   authoritative; the v5 bundle is fetched only after an explicit user click. */
(function(){
  "use strict";
  if(window.CHART_STUDIO_V5_PREVIEW_ENABLED!==true)return;
  let button=null,panel=null,host=null,status=null,title=null,dataWindow=null,dataWindowPinButton=null,liveQuote=null,autoFibButton=null,autoFibStatus=null,trendButton=null,rayButton=null,priceButton=null,timeButton=null,rectButton=null,fiboButton=null,measureButton=null,channelButton=null,pitchforkButton=null,riskRewardButton=null,textButton=null,textInput=null,drawingStatus=null,layoutButton=null,layoutImportButton=null,layoutReplaceButton=null,layoutImportFile=null;

  let scope=null,latest=null,engine=null,bridge=null,indicatorBridge=null,oscillatorBridge=null,active=false,loading=null,autoFibEnabled=false,dataWindowHover=null,dataWindowPinned=null,dataWindowCrosshairActive=false;
  let generation=0,sequence=0,latestSequence=0,positionSequence=0,positionsSnapshot=null,brokerDealMarkersSnapshot=null,positionsEnabled=true,drawingTool=null,pendingImportMode=null,quoteTimer=null,quoteRequest=0;
  const setStatus=value=>{if(status)status.textContent=value};
  function renderDataWindow(event){
    if(!dataWindow)return;
    if(event.detail===null)dataWindowCrosshairActive=false;
    else{dataWindowHover=event.detail;dataWindowCrosshairActive=true}
    const value=dataWindowPinned||(dataWindowCrosshairActive?dataWindowHover:null);
    if(dataWindowPinButton){dataWindowPinButton.disabled=!dataWindowPinned&&dataWindowHover?.state!=="AVAILABLE";dataWindowPinButton.setAttribute("aria-pressed",dataWindowPinned?"true":"false");dataWindowPinButton.textContent=dataWindowPinned?"Fixierung lösen":"Kerze fixieren"}
    if(!value){dataWindow.textContent="Fadenkreuz auf eine Kerze bewegen.";return}
    if(value.state!=="AVAILABLE"||!value.ohlc){dataWindow.textContent=`Kerze nicht verfügbar · ${value.reason||value.state||"UNKNOWN"}`;return}
    const {open,high,low,close}=value.ohlc,volume=value.volume;
    const indicators=(value.indicators||[]).map(item=>`${item.title}: ${item.value===null?item.state:item.value}${item.direction?" "+item.direction:""}`);
    dataWindow.textContent=[`${dataWindowPinned?"FIXIERT · ":""}${value.source} · ${value.timeUtc}`,`O ${open} · H ${high} · L ${low} · C ${close}`,
      `Volumen ${volume?.value??"—"} · ${volume?.source||"UNAVAILABLE"}`,...indicators].join(" | ");
  }
  function toggleDataWindowPin(){
    if(dataWindowPinned)dataWindowPinned=null;
    else if(dataWindowHover?.state==="AVAILABLE")dataWindowPinned=dataWindowHover;
    renderDataWindow({detail:null});
  }
  async function refreshLiveQuote(){
    const request=++quoteRequest,selected=currentScope();
    if(!selected||!active||!liveQuote)return;
    liveQuote.textContent="Aktuelle MT5-Quote: wird read-only abgerufen …";
    const prefix=window.location.pathname.startsWith("/stt")?"/stt":"";
    const query=new URLSearchParams({account:selected.account,symbol:selected.symbol});
    try{
      const response=await fetch(`${prefix}/api/chart/v1/quotes?${query}`,{method:"GET",cache:"no-store",headers:{Accept:"application/json"}});
      const value=await response.json();
      if(request!==quoteRequest||!same(selected,scope))return;
      const quoteEpoch=typeof value?.quoteTimeUtc==="number"?value.quoteTimeUtc:
        typeof value?.quoteTimeUtc==="string"?Date.parse(value.quoteTimeUtc)/1000:NaN;
      const quoteDate=Number.isFinite(quoteEpoch)?new Date(quoteEpoch*1000):null;
      if(!response.ok||value?.account!==selected.account||value?.symbol!==selected.symbol||value?.source!=="MT5_VERIFIED"||value?.canExecute!==false||
         !Number.isFinite(value.bid)||!Number.isFinite(value.ask)||value.bid<=0||value.ask<value.bid||!quoteDate||!Number.isFinite(quoteDate.getTime())||
         !Number.isFinite(value.ageSeconds)||!['FRESH','STALE','FUTURE'].includes(value.freshness))throw new Error("Quote nicht verifiziert oder nicht verfügbar");
      const spread=(value.ask-value.bid).toFixed(Number.isInteger(value.digits)?Math.min(value.digits,8):2);
      liveQuote.textContent=`Aktuelle MT5-Quote beim Abruf · ${value.freshness} · Bid ${value.bid} / Ask ${value.ask} / Spread ${spread} · ${quoteDate.toISOString()} UTC · Alter ${Math.round(value.ageSeconds)} s · ${value.source} · keine historische Kerze`;
    }catch(error){if(request===quoteRequest&&same(selected,scope))liveQuote.textContent=`Aktuelle MT5-Quote: nicht verfügbar · ${String(error?.message||error).slice(0,100)}`}
  }
  function refreshPinnedDataWindow(){
    if(!dataWindowPinned)return;
    try{const refreshed=engine?.readDataWindow?.(dataWindowPinned.time);dataWindowPinned=refreshed?.state==="AVAILABLE"?refreshed:null}
    catch(_){dataWindowPinned=null}
    renderDataWindow({detail:null});
  }
  const same=(a,b)=>!!a&&!!b&&a.account===b.account&&a.symbol===b.symbol&&a.timeframe===b.timeframe;
  function currentScope(){return scope?{...scope}:null}
  const marketLevelKeys=["daily_high","daily_low","daily_poc","daily_vah","daily_val","weekly_high","weekly_low","weekly_poc","weekly_vah","weekly_val"];
  function syncMarketLevels(){
    if(!engine||!scope||!latest||!latest.sr_levels||typeof latest.sr_levels!=="object"){
      try{engine?.clearMarketLevels?.()}catch(_){}
      return {applied:false,reason:"LEVELS_UNAVAILABLE"};
    }
    const levels=Object.fromEntries(marketLevelKeys.map(key=>{
      const value=latest.sr_levels[key];return [key,value===null||value===undefined||value===0?null:value];
    }));
    const preferences=window.DashboardChartLevelVisibility?.read?.(scope.account)||Object.fromEntries(marketLevelKeys.map(key=>[key,true]));
    const hasChoice=key=>window.DashboardChartLevelVisibility?.hasChoice?.(scope.account,key)===true;
    const reference=Number(latest.candles?.at(-1)?.close)||Number(levels.daily_poc)||0;
    const visible=Object.fromEntries(marketLevelKeys.map(key=>{
      const weeklyExtreme=key==="weekly_high"||key==="weekly_low";
      const nearChart=!weeklyExtreme||reference<=0||levels[key]===null||Math.abs(levels[key]-reference)<=35;
      return [key,preferences[key]===true&&(nearChart||hasChoice(key))];
    }));
    try{return engine.setMarketLevels({scope:{...scope},source:"MT5_VERIFIED",canExecute:false,asOfUtc:latest.snapshotAsOfUtc,levels,visible})}
    catch(_){try{engine.clearMarketLevels()}catch(__){}return {applied:false,reason:"INVALID_LEVELS"}}
  }
  function syncMovingAverages(){
    if(!indicatorBridge||!active||!latest||!scope)return {applied:false,reason:"PREVIEW_NOT_READY"};
    const source=window.ChartStudioAverages;
    if(!source||typeof source.getConfigs!=="function"||typeof source.getAccount!=="function")return {applied:false,reason:"CONFIG_UNAVAILABLE"};
    if(source.getAccount()!==scope.account){indicatorBridge.clear();return {applied:false,reason:"ACCOUNT_SCOPE_MISMATCH"};}
    return indicatorBridge.update({account:scope.account,symbol:scope.symbol,timeframe:scope.timeframe,
      source:"CHART_STUDIO_LOCAL",canExecute:false,configs:source.getConfigs()},indicatorBridge.beginRead());
  }
  function onAverageConfigsChanged(event){
    const changed=event?.detail;
    if(!changed||changed.account!==scope?.account||changed.symbol!==scope?.symbol)return;
    syncMovingAverages();
  }
  function syncOscillators(){
    if(!oscillatorBridge||!active||!latest||!scope)return {applied:false,reason:"PREVIEW_NOT_READY"};
    const indicators=window.ChartStudioIndicators,oscillators=window.ChartStudioOscillators;
    if(!indicators||typeof indicators.getScope!=="function"||typeof indicators.settings!=="function"||
       !oscillators||typeof oscillators.getAccount!=="function"||typeof oscillators.settings!=="function"){
      oscillatorBridge.clear();return {applied:false,reason:"CONFIG_UNAVAILABLE"};
    }
    const configuredScope=indicators.getScope();
    if(!same(configuredScope,scope)||oscillators.getAccount()!==scope.account){
      oscillatorBridge.clear();return {applied:false,reason:"CONFIG_SCOPE_MISMATCH"};
    }
    return oscillatorBridge.update({scope:{...scope},source:"CHART_STUDIO_LOCAL",canExecute:false,
      oscillatorAccount:oscillators.getAccount(),settings:indicators.settings(),instances:oscillators.settings()},oscillatorBridge.beginRead());
  }
  function onOscillatorConfigsChanged(event){
    const changed=event?.detail;
    if(!changed)return;
    if(changed.account!==scope?.account||changed.symbol!==scope?.symbol||changed.timeframe!==scope?.timeframe){
      try{oscillatorBridge?.clear()}catch(_){}
      return;
    }
    syncOscillators();
  }
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
    if(host)host.removeEventListener("chartstudio-v5-drawing-state",drawingState);
    try{indicatorBridge?.clear()}catch(_){}indicatorBridge=null;
    try{oscillatorBridge?.clear()}catch(_){}oscillatorBridge=null;
    dataWindowHover=null;dataWindowPinned=null;dataWindowCrosshairActive=false;
    renderDataWindow({detail:null});
    try{engine?.destroy()}catch(_){}
    engine=null;bridge=null;autoFibEnabled=false;drawingTool=null;if(autoFibButton){autoFibButton.setAttribute("aria-pressed","false");autoFibButton.textContent="Auto-Fibonacci einblenden";autoFibButton.disabled=!latest}if(autoFibStatus)autoFibStatus.textContent="";updateDrawingButtons();if(drawingStatus)drawingStatus.textContent="Zeichenwerkzeug aus.";if(host)host.replaceChildren();
  }
  function updateDrawingButtons(){for(const [button,kind] of [[trendButton,"TREND"],[rayButton,"RAY"],[priceButton,"PRICE"],[timeButton,"TIME"],[rectButton,"RECT"],[fiboButton,"FIBO"],[measureButton,"MEASURE"],[channelButton,"CHANNEL"],[pitchforkButton,"PITCHFORK"],[riskRewardButton,"RISK_REWARD"],[textButton,"TEXT"]])if(button){button.disabled=!engine||!latest||(kind==="TEXT"&&!/^[\x20-\x7E]{1,40}$/.test(textInput?.value||""));button.setAttribute("aria-pressed",drawingTool===kind?"true":"false")}for(const item of [layoutButton,layoutImportButton,layoutReplaceButton])if(item)item.disabled=!engine||!latest}
  function exportLayout(){
    if(!engine||!scope)return null;
    const serialized=engine.exportLayout(),layout=JSON.parse(serialized);
    if(layout.schemaVersion!==2||layout.symbol!==scope.symbol||layout.timeframe!==scope.timeframe)throw new Error("Layoutscope stimmt nicht überein");
    return serialized;
  }
  function downloadLayout(){
    try{
      const serialized=exportLayout();if(!serialized)return false;
      const symbol=scope.symbol.replace(/[^A-Za-z0-9._-]/g,"_");
      const blob=new Blob([serialized],{type:"application/json;charset=utf-8"}),url=URL.createObjectURL(blob),link=document.createElement("a");
      link.href=url;link.download=`chart-studio-layout-${symbol}-${scope.timeframe}.json`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),0);
      setStatus("Layoutdatei heruntergeladen · ohne Konto- und Brokerzustand");return true;
    }catch(error){setStatus("Layoutexport nicht verfügbar: "+String(error?.message||error).slice(0,120));return false}
  }
  const portableKeys="drawings,schemaVersion,symbol,timeframe,view";
  const viewKeys="displayTimeZone,movingAverages,oscillators,paneHeights,paneLines,parabolicSars,sessionVwaps,supertrends,visibleRange,volumePaneIndex,volumeVisible";
  function parseLayout(serialized){
    if(typeof serialized!=="string"||new TextEncoder().encode(serialized).length>512*1024)throw new Error("Layoutdatei ungültig oder zu groß");
    let layout;try{layout=JSON.parse(serialized)}catch(_){throw new Error("Layout-JSON ist ungültig")}
    if(!layout||typeof layout!=="object"||Array.isArray(layout)||Object.keys(layout).sort().join(",")!==portableKeys||layout.schemaVersion!==2||
       typeof layout.symbol!=="string"||typeof layout.timeframe!=="string"||!Array.isArray(layout.drawings)||!layout.view||typeof layout.view!=="object"||Array.isArray(layout.view)||
       Object.keys(layout.view).sort().join(",")!==viewKeys)throw new Error("Nicht unterstütztes Layoutformat");
    if(!scope||layout.symbol!==scope.symbol||layout.timeframe!==scope.timeframe)throw new Error("Layoutscope stimmt nicht mit dem aktiven Chart überein");
    return layout;
  }
  function layoutIds(layout){
    const ids=new Set();
    const add=options=>{if(options&&typeof options.id==="string")ids.add(options.id)};
    for(const item of layout.drawings)add(item?.options);
    for(const item of layout.view.movingAverages)add(item);
    for(const item of layout.view.oscillators)add(item?.options);
    for(const item of layout.view.paneLines)add(item?.options);
    for(const item of layout.view.supertrends)add(item);
    for(const item of layout.view.parabolicSars)add(item);
    for(const item of layout.view.sessionVwaps)add(item);
    return ids;
  }
  function mergeLayouts(target,source){
    const merged=JSON.parse(JSON.stringify(target)),incoming=JSON.parse(JSON.stringify(source)),used=layoutIds(merged);
    const rename=options=>{
      if(!options||typeof options.id!=="string")return;
      const original=options.id;if(!used.has(original)){used.add(original);return}
      for(let suffix=1;suffix<10000;suffix++){
        const id=`${original.slice(0,20)}-imported-${suffix}`;
        if(!used.has(id)){options.id=id;used.add(id);return}
      }
      throw new Error("Layout enthält zu viele kollidierende IDs");
    };
    const targetPaneMap=new Map([[0,0]]),sourcePaneMap=new Map([[0,0]]),heights=[merged.view.paneHeights[0]];
    for(let index=1;index<merged.view.paneHeights.length;index++)if(index!==merged.view.volumePaneIndex){targetPaneMap.set(index,heights.length);heights.push(merged.view.paneHeights[index])}
    for(let index=1;index<incoming.view.paneHeights.length;index++)if(index!==incoming.view.volumePaneIndex){sourcePaneMap.set(index,heights.length);heights.push(incoming.view.paneHeights[index])}
    const volumeVisible=merged.view.volumeVisible||incoming.view.volumeVisible;
    const volumeHeight=merged.view.volumeVisible?merged.view.paneHeights[merged.view.volumePaneIndex]:incoming.view.paneHeights[incoming.view.volumePaneIndex];
    const volumePaneIndex=volumeVisible?heights.length:null;if(volumeVisible)heights.push(volumeHeight);
    if(merged.view.volumeVisible)targetPaneMap.set(merged.view.volumePaneIndex,volumePaneIndex);
    if(incoming.view.volumeVisible)sourcePaneMap.set(incoming.view.volumePaneIndex,volumePaneIndex);
    for(const item of merged.view.oscillators)item.paneIndex=targetPaneMap.get(item.paneIndex);
    for(const item of merged.view.paneLines)item.paneIndex=targetPaneMap.get(item.paneIndex);
    for(const item of incoming.view.oscillators)item.paneIndex=sourcePaneMap.get(item.paneIndex);
    for(const item of incoming.view.paneLines)item.paneIndex=sourcePaneMap.get(item.paneIndex);
    merged.view.paneHeights=heights;merged.view.volumeVisible=volumeVisible;merged.view.volumePaneIndex=volumePaneIndex;
    for(const item of incoming.drawings){rename(item.options);merged.drawings.push(item)}
    for(const item of incoming.view.movingAverages){rename(item);merged.view.movingAverages.push(item)}
    for(const item of incoming.view.oscillators){rename(item.options);merged.view.oscillators.push(item)}
    for(const item of incoming.view.paneLines){rename(item.options);merged.view.paneLines.push(item)}
    for(const item of incoming.view.supertrends){rename(item);merged.view.supertrends.push(item)}
    for(const item of incoming.view.parabolicSars){rename(item);merged.view.parabolicSars.push(item)}
    for(const item of incoming.view.sessionVwaps){rename(item);merged.view.sessionVwaps.push(item)}
    merged.view.visibleRange=target.view.visibleRange;merged.view.displayTimeZone=target.view.displayTimeZone;
    return merged;
  }
  function storedLayout(layout){return JSON.stringify({schemaVersion:4,account:scope.account,symbol:scope.symbol,timeframe:scope.timeframe,
    drawings:layout.drawings,undoStack:[],redoStack:[],...layout.view})}
  function validateLayoutSnapshot(serialized){
    const frame=document.createElement("iframe");frame.style.cssText="position:absolute;left:-10000px;top:0;width:920px;height:540px;opacity:0;pointer-events:none";document.body.append(frame);
    let candidate=null;
    try{
      const child=frame.contentWindow,doc=frame.contentDocument,records=new Map([[layoutStorageKey(),serialized]]),memoryStorage={
        getItem:key=>records.has(key)?records.get(key):null,setItem:(key,value)=>records.set(String(key),String(value)),removeItem:key=>records.delete(key),clear:()=>records.clear(),key:index=>[...records.keys()][index]??null,get length(){return records.size}
      };
      Object.defineProperty(child,"localStorage",{configurable:true,value:memoryStorage});
      const candidateHost=doc.createElement("div");candidateHost.style.cssText="width:900px;height:520px";doc.body.append(candidateHost);
      candidate=window.ChartStudioV5.createStudioV5(candidateHost,scope.account,{symbol:scope.symbol,timeframe:scope.timeframe});
      candidate.setCandles(latest.candles);
      const state=candidate.inspect();
      if(state.persistenceStatus!=="READY"||state.persistenceError!==null)throw new Error(`Layoutinhalt oder Chartlimits sind ungültig (${state.persistenceStatus}/${state.persistenceError})`);
      return JSON.parse(candidate.exportLayout());
    }finally{try{candidate?.destroy()}catch(_){}frame.remove()}
  }
  function layoutStorageKey(){return `2eas.chartstudio.v5.drawings:v5:${encodeURIComponent(scope.account)}:${encodeURIComponent(scope.symbol)}:${encodeURIComponent(scope.timeframe)}`}
  function importLayout(serialized,mode="merge"){
    if(!engine||!scope||!latest)throw new Error("Layoutimport benötigt verifizierte Chartdaten");
    if(mode!=="merge"&&mode!=="replace")throw new Error("Unbekannter Importmodus");
    if(mode==="replace"&&!window.confirm("Das aktuelle lokale Layout dieses Kontos, Symbols und Zeitrahmens ersetzen?"))throw new Error("Import abgebrochen");
    if(!engine.verifyPersistence())throw new Error("Lokaler Layoutspeicher ist nicht bereit oder wurde parallel geändert");
    const storage=window.localStorage,key=layoutStorageKey(),previous=storage.getItem(key);
    const importedFile=parseLayout(serialized),imported=validateLayoutSnapshot(storedLayout(importedFile)),current=JSON.parse(engine.exportLayout());
    const next=mode==="merge"?mergeLayouts(current,imported):imported;
    const candidate=mode==="merge"?validateLayoutSnapshot(storedLayout(next)):imported;
    if(previous!==storage.getItem(key))throw new Error("Layout wurde parallel geändert; Import abgebrochen");
    const normalized=storedLayout(candidate);
    try{
      storage.setItem(key,normalized);destroyRenderer();mountRenderer();
      const state=engine?.inspect();
      if(!state||state.persistenceStatus!=="READY"||state.persistenceError!==null)throw new Error(`Layout konnte nicht wiederhergestellt werden (${state?.persistenceStatus||"NO_ENGINE"}/${state?.persistenceError||"NO_ERROR"})`);
      return {mode,importedDrawings:imported.drawings.length,drawings:state.nativeDrawingCount};
    }catch(error){
      let rollbackFailed=false;
      try{if(storage.getItem(key)!==previous){if(previous===null)storage.removeItem(key);else storage.setItem(key,previous)}}catch(_){rollbackFailed=true}
      destroyRenderer();mountRenderer();
      const restored=engine?.inspect();
      if(rollbackFailed||!restored||restored.persistenceStatus!=="READY"||restored.persistenceError!==null)throw new Error("Import fehlgeschlagen; das vorherige lokale Layout konnte nicht wiederhergestellt werden");
      throw error;
    }
  }
  function chooseLayoutFile(mode){if(!engine||!latest||!layoutImportFile)return false;pendingImportMode=mode;layoutImportFile.value="";layoutImportFile.click();return true}
  async function readLayoutFile(){
    const file=layoutImportFile?.files?.[0],mode=pendingImportMode;pendingImportMode=null;if(!file)return;
    try{
      if(file.size>512*1024)throw new Error("Layoutdatei ist größer als 512 KiB");
      const result=importLayout(await file.text(),mode);setStatus(`Layout ${result.mode==="merge"?"zusammengeführt":"ersetzt"} · ${result.drawings} Zeichnungen · lokal gespeichert`);
    }catch(error){setStatus("Layoutimport abgelehnt: "+String(error?.message||error).slice(0,140))}
  }
  function setDrawingTool(kind){
    if(kind!==null&&!["TREND","RAY","PRICE","TIME","RECT","FIBO","MEASURE","CHANNEL","PITCHFORK","RISK_REWARD","TEXT"].includes(kind))return false;
    if(!engine||(kind!==null&&!latest))return false;
    if(kind==="TEXT"&&!/^[\x20-\x7E]{1,40}$/.test(textInput?.value||"")){if(drawingStatus)drawingStatus.textContent="Text muss 1–40 druckbare ASCII-Zeichen enthalten.";return false}
    drawingTool=kind;engine.setDrawingTool(kind,kind==="TEXT"?textInput.value:undefined);updateDrawingButtons();
    if(drawingStatus)drawingStatus.textContent=kind?`${({TREND:"Trendlinie",RAY:"Strahl",PRICE:"Preislinie",TIME:"Zeitlinie",RECT:"Rechteck",FIBO:"Fibonacci",MEASURE:"Messung",CHANNEL:"Kanal",PITCHFORK:"Pitchfork",RISK_REWARD:"Risiko/Ertrag",TEXT:"Text"})[kind]}: ${kind==="PRICE"||kind==="TIME"||kind==="TEXT"?"Kerze wählen.":"ersten Anker wählen."}`:"Zeichenwerkzeug aus.";
    return true;
  }
  function drawingState(event){const detail=event?.detail;if(!detail)return;
    if(detail.phase==="FIRST_ANCHOR"){if(drawingStatus)drawingStatus.textContent="Ersten Anker gesetzt · zweiten Anker wählen."}
    else if(detail.phase==="SECOND_ANCHOR"){if(drawingStatus)drawingStatus.textContent=detail.kind==="CHANNEL"?"Dritten Kanalanker wählen.":detail.kind==="PITCHFORK"?"Dritten Pitchfork-Anker wählen.":detail.kind==="RISK_REWARD"?"Dritten Anker für das Ziel wählen.":"Zweiten Anker wählen."}
    else if(detail.phase==="CREATED"){drawingTool=null;window.__chartStudioV5LastDrawingId=detail.id;window.__chartStudioV5LastDrawingKind=detail.kind;updateDrawingButtons();if(drawingStatus)drawingStatus.textContent="Zeichnung erstellt."}
    else if(detail.phase==="CANCELLED"){drawingTool=null;updateDrawingButtons();if(drawingStatus)drawingStatus.textContent="Zeichenwerkzeug abgebrochen."}
    else if(detail.phase==="ERROR"){if(drawingStatus)drawingStatus.textContent="Anker ungültig · gültige Kerze und Preis wählen."}
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
  function clearRenderedPositions(){
    if(!engine||!scope)return;
    try{engine.clearPositionOverlays()}catch(_){}
  }
  function renderPositions(){
    if(!engine||!scope||!positionsEnabled||!positionsSnapshot){clearRenderedPositions();return {count:0,lines:[]}}
    return engine.setPositionOverlays(positionsSnapshot);
  }
  function beginPositionRead(){return Object.freeze({generation,sequence:++positionSequence})}
  function setPositions(snapshot,token){
    if(!token||token.generation!==generation)return {applied:false,reason:"STALE_SCOPE"};
    if(token.sequence!==positionSequence)return {applied:false,reason:"STALE_REQUEST"};
    if(!scope||!snapshot?.scope||!same(scope,snapshot.scope)){
      positionsSnapshot=null;clearRenderedPositions();return {applied:false,reason:"SCOPE_MISMATCH"};
    }
    if(snapshot.source!=="MT5_VERIFIED"||snapshot.canExecute!==false){
      positionsSnapshot=null;clearRenderedPositions();return {applied:false,reason:"UNVERIFIED_SOURCE"};
    }
    if(typeof snapshot.currency!=="string"||!/^[A-Z]{3}$/.test(snapshot.currency)||![0,1,2].includes(snapshot.marginMode)||!Array.isArray(snapshot.positions)||snapshot.positions.length>500){
      positionsSnapshot=null;clearRenderedPositions();return {applied:false,reason:"INVALID_POSITIONS"};
    }
    const tickets=new Set(),positions=[];
    for(const row of snapshot.positions){
      const ticket=String(row?.ticket??""),side=row?.side??row?.type,entry=Number(row?.priceOpen??row?.entryPrice);
      const stop=row?.sl??row?.stopLoss??null,target=row?.tp??row?.takeProfit??null;
      const volume=Number(row?.volume),profit=Number(row?.profit),swap=Number(row?.swap),currency=row?.currency??snapshot.currency;
      if(!/^[A-Za-z0-9_-]{1,64}$/.test(ticket)||tickets.has(ticket)||(side!=="BUY"&&side!=="SELL")||!Number.isFinite(entry)||entry<=0||
         !Number.isFinite(volume)||volume<0||!Number.isFinite(profit)||!Number.isFinite(swap)||currency!==snapshot.currency||
         (stop!==null&&(!Number.isFinite(Number(stop))||Number(stop)<=0))||(target!==null&&(!Number.isFinite(Number(target))||Number(target)<=0))){
        positionsSnapshot=null;clearRenderedPositions();return {applied:false,reason:"INVALID_POSITIONS"};
      }
      tickets.add(ticket);positions.push({ticket,side,entryPrice:entry,stopLoss:stop===null?null:Number(stop),takeProfit:target===null?null:Number(target),volume,profit,swap,currency,usdConversion:row?.usdConversion});
    }
    positionsSnapshot={scope:{...scope},source:"MT5_VERIFIED",canExecute:false,currency:snapshot.currency,marginMode:snapshot.marginMode,positions};
    try{return {applied:true,count:renderPositions().count}}
    catch(_){positionsSnapshot=null;clearRenderedPositions();return {applied:false,reason:"INVALID_POSITIONS"}}
  }
  function showPositions(enabled){
    if(typeof enabled!=="boolean")return false;
    positionsEnabled=enabled;
    try{renderPositions();return true}catch(_){positionsSnapshot=null;clearRenderedPositions();return false}
  }
  function readPositions(){return engine?.readPositionOverlays?.()||{count:0,lines:[]}}
  function renderBrokerDealMarkers(){
    if(!engine||!scope||!brokerDealMarkersSnapshot)return {plotted:0,unplotted:0,markers:[]};
    return engine.setBrokerDealMarkers(brokerDealMarkersSnapshot);
  }
  function setBrokerDealMarkers(snapshot){
    if(snapshot?.source!=="MT5_VERIFIED"||snapshot?.canExecute!==false)return {applied:false,reason:"UNVERIFIED_SOURCE"};
    if(!scope||!snapshot?.scope||!same(scope,snapshot.scope))return {applied:false,reason:"SCOPE_MISMATCH"};
    if(!latest||!Array.isArray(snapshot.markers)||snapshot.markers.length>500)return {applied:false,reason:"INVALID_MARKERS"};
    const tickets=new Set(),markers=[];
    for(const row of snapshot.markers){
      const ticket=String(row?.ticket??"");
      if(!/^[1-9][0-9]{0,19}$/.test(ticket)||tickets.has(ticket)||row?.account!==scope.account||row?.symbol!==scope.symbol||row?.timeframe!==scope.timeframe||
        !["BUY","SELL"].includes(row?.side)||!["IN","OUT","INOUT","OUT_BY"].includes(row?.entry)||!Number.isFinite(row?.price)||row.price<=0||
        !Number.isSafeInteger(row?.fillTimeUtcMs)||row.fillTimeUtcMs<=0||row.chartTimeSeconds!==Math.floor(row.fillTimeUtcMs/1000)||typeof row.plotted!=="boolean"||typeof row.label!=="string"||row.label.length>100)
        return {applied:false,reason:"INVALID_MARKERS"};
      tickets.add(ticket);markers.push({...row,ticket});
    }
    const candidate={scope:{...scope},source:"MT5_VERIFIED",canExecute:false,markers};
    try{
      const result=engine?engine.setBrokerDealMarkers(candidate):null;
      brokerDealMarkersSnapshot=candidate;
      const state=result||{plotted:markers.filter(row=>latest.candles.some(candle=>candle.time===row.chartTimeSeconds)).length,unplotted:markers.filter(row=>!latest.candles.some(candle=>candle.time===row.chartTimeSeconds)).length};
      return {applied:true,plotted:state.plotted,unplotted:state.unplotted};
    }catch(_){return {applied:false,reason:"INVALID_MARKERS"}}
  }
  function readBrokerDealMarkers(){
    if(engine)return engine.readBrokerDealMarkers?.()||{plotted:0,unplotted:0,markers:[]};
    const markers=(brokerDealMarkersSnapshot?.markers||[]).map(row=>({...row,plotted:!!latest?.candles.some(candle=>candle.time===row.chartTimeSeconds)}));
    return {plotted:markers.filter(row=>row.plotted).length,unplotted:markers.filter(row=>!row.plotted).length,markers};
  }
  function clearPositions(){positionSequence++;positionsSnapshot=null;clearRenderedPositions();return true}
  function mountRenderer(){
    if(!active||!scope||bridge||!window.ChartStudioV5?.createStudioV5||!window.ChartStudioV5Feed?.create)return;
    try{
      engine=window.ChartStudioV5.createStudioV5(host,scope.account,{symbol:scope.symbol,timeframe:scope.timeframe});
      host.addEventListener("chartstudio-v5-drawing-state",drawingState);
      bridge=window.ChartStudioV5Feed.create(engine,scope);
      if(!window.ChartStudioV5IndicatorFeed?.create)throw new Error("Indikatorbrücke nicht verfügbar");
      indicatorBridge=window.ChartStudioV5IndicatorFeed.create(engine,scope);
      if(!window.ChartStudioV5OscillatorFeed?.create)throw new Error("Oszillatorbrücke nicht verfügbar");
      oscillatorBridge=window.ChartStudioV5OscillatorFeed.create(engine,scope);
      setStatus("Warte auf verifizierte MT5-Kerzen …");
      if(latest){const token=bridge.beginRead();const result=bridge.update(latest,token);
        if(autoFibButton)autoFibButton.disabled=!Number.isSafeInteger(latest.snapshotAsOfUtc);
        updateDrawingButtons();
        if(result.applied){refreshPinnedDataWindow();renderPositions();renderBrokerDealMarkers();syncMarketLevels();syncMovingAverages();syncOscillators()}
        setStatus(result.applied?`${result.candleCount} verifizierte Kerzen · read-only · Kerzenfrische ungeprüft`:"V5-Daten abgelehnt: "+result.reason)}
    }catch(error){destroyRenderer();setStatus("V5-Vorschau nicht verfügbar: "+String(error?.message||error).slice(0,160))}
  }
  function setScope(next){
    if(!window.ChartStudioV5Feed?.validScope(next))return false;
    if(same(scope,next))return true;
    scope={account:next.account,symbol:next.symbol,timeframe:next.timeframe};
    if(title)title.textContent=`Native v5 · ${scope.symbol} ${scope.timeframe} · ${scope.account}`;
    generation++;sequence=0;latestSequence=0;positionSequence=0;positionsSnapshot=null;brokerDealMarkersSnapshot=null;latest=null;
    if(bridge)bridge.clear();
    destroyRenderer();
    if(active&&window.ChartStudioV5?.createStudioV5)mountRenderer();
    if(active)refreshLiveQuote();
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
    const indicatorResult=syncMovingAverages();syncOscillators();
    syncMarketLevels();
    refreshPinnedDataWindow();
    renderPositions();renderBrokerDealMarkers();
    if(autoFibButton)autoFibButton.disabled=false;
    updateDrawingButtons();
    if(autoFibEnabled)renderAutoFib();
    setStatus(`${result.candleCount} verifizierte Kerzen · ${indicatorResult.applied?indicatorResult.count+" benutzerdefinierte MAs":indicatorResult.reason||"MAs nicht synchronisiert"} · read-only · Kerzenfrische ungeprüft`);
    return result;
  }
  function clear(message){
    latest=null;latestSequence=++sequence;brokerDealMarkersSnapshot=null;dataWindowHover=null;dataWindowPinned=null;dataWindowCrosshairActive=false;renderDataWindow({detail:null});try{engine?.setBrokerDealMarkers({scope:{...scope},source:"MT5_VERIFIED",canExecute:false,markers:[]})}catch(_){}try{engine?.clearMarketLevels?.()}catch(_){}
    clearAutoFib();clearPositions();try{bridge?.clear()}catch(_){}try{indicatorBridge?.clear()}catch(_){}try{oscillatorBridge?.clear()}catch(_){}if(autoFibButton)autoFibButton.disabled=true;
    setDrawingTool(null);updateDrawingButtons();
    setStatus(message||"MT5-Kerzen derzeit nicht verfügbar");
  }
  window.ChartStudioV5Preview=Object.freeze({setScope,beginRead,update,clear,renderAutoFib,clearAutoFib,beginPositionRead,setPositions,showPositions,readPositions,clearPositions,setBrokerDealMarkers,readBrokerDealMarkers,readMarketLevels:()=>engine?.readMarketLevels?.()||{source:"NONE",asOfUtc:null,count:0,levels:{}},syncMarketLevels,setDrawingTool,syncMovingAverages,syncOscillators,readMovingAverage:id=>engine?.movingAverageOptions?.("preview-ma-"+id)||null,readOscillator:id=>oscillatorBridge?.read(id)||null,exportLayout,importLayout,readDrawing:id=>engine?.readDrawing?.(id)||null,drawingAnchorPosition:(id,anchor)=>engine?.drawingAnchorPosition?.(id,anchor)||null,drawingGeometry:id=>engine?.drawingGeometry?.(id)||null,readAutoFibonacci:()=>engine?.readAutoFibonacci?.()||null,inspect:()=>({active,scope:currentScope(),generation,status:status?.textContent||"",autoFibonacci:!!engine?.readAutoFibonacci?.(),priceAxisWidth:engine?.inspect?.().priceAxisWidth||0,customMovingAverageCount:indicatorBridge?.inspect?.().count||0,customOscillatorCount:oscillatorBridge?.inspect?.().count||0,positionOverlayCount:readPositions().count,marketLevelCount:engine?.readMarketLevels?.().count||0,brokerDealMarkerCount:readBrokerDealMarkers().plotted,nativeDrawingCount:engine?.inspect?.().nativeDrawingCount||0,persistenceStatus:engine?.inspect?.().persistenceStatus||null,persistenceError:engine?.inspect?.().persistenceError||null,drawingTool,placement:engine?.drawingToolState?.()||null,positionsEnabled,dataWindowPinned:!!dataWindowPinned,brokerDealMarkers:readBrokerDealMarkers()})});
  function boot(){
    button=document.getElementById("chart-v5-preview-btn");panel=document.getElementById("chart-v5-preview-panel");
    host=document.getElementById("chart-v5-preview-host");status=document.getElementById("chart-v5-preview-status");dataWindow=document.getElementById("chart-v5-data-window");dataWindowPinButton=document.getElementById("chart-v5-data-window-pin");liveQuote=document.getElementById("chart-v5-live-quote");
    title=document.getElementById("chart-v5-preview-title");
    autoFibButton=document.getElementById("chart-v5-auto-fib-btn");autoFibStatus=document.getElementById("chart-v5-auto-fib-status");
    trendButton=document.getElementById("chart-v5-trend-btn");rayButton=document.getElementById("chart-v5-ray-btn");priceButton=document.getElementById("chart-v5-price-btn");timeButton=document.getElementById("chart-v5-time-btn");rectButton=document.getElementById("chart-v5-rect-btn");fiboButton=document.getElementById("chart-v5-fibo-btn");measureButton=document.getElementById("chart-v5-measure-btn");channelButton=document.getElementById("chart-v5-channel-btn");pitchforkButton=document.getElementById("chart-v5-pitchfork-btn");riskRewardButton=document.getElementById("chart-v5-risk-reward-btn");textButton=document.getElementById("chart-v5-text-btn");textInput=document.getElementById("chart-v5-text-input");drawingStatus=document.getElementById("chart-v5-drawing-status");layoutButton=document.getElementById("chart-v5-layout-export-btn");
    if(!button||!panel||!host||!status)return;
    window.addEventListener("chart-studio-averages-change",onAverageConfigsChanged);
    window.addEventListener("chart-studio-indicators-change",onOscillatorConfigsChanged);
    window.addEventListener("chart-studio-oscillators-change",onOscillatorConfigsChanged);
    host.addEventListener("chartstudio-v5-data-window",renderDataWindow);
    if(dataWindowPinButton){dataWindowPinButton.disabled=true;dataWindowPinButton.addEventListener("click",toggleDataWindowPin)}
    button.hidden=false;if(scope&&title)title.textContent=`Native v5 · ${scope.symbol} ${scope.timeframe} · ${scope.account}`;
    if(autoFibButton)autoFibButton.addEventListener("click",()=>{if(autoFibEnabled)clearAutoFib();else try{renderAutoFib()}catch(error){clearAutoFib();if(autoFibStatus)autoFibStatus.textContent="Auto-Fibonacci nicht verfügbar · "+String(error?.message||error).slice(0,120)}});
    if(trendButton)trendButton.addEventListener("click",()=>setDrawingTool(drawingTool==="TREND"?null:"TREND"));
    if(rayButton)rayButton.addEventListener("click",()=>setDrawingTool(drawingTool==="RAY"?null:"RAY"));
    if(priceButton)priceButton.addEventListener("click",()=>setDrawingTool(drawingTool==="PRICE"?null:"PRICE"));
    if(timeButton)timeButton.addEventListener("click",()=>setDrawingTool(drawingTool==="TIME"?null:"TIME"));
    if(rectButton)rectButton.addEventListener("click",()=>setDrawingTool(drawingTool==="RECT"?null:"RECT"));
    if(fiboButton)fiboButton.addEventListener("click",()=>setDrawingTool(drawingTool==="FIBO"?null:"FIBO"));
    if(measureButton)measureButton.addEventListener("click",()=>setDrawingTool(drawingTool==="MEASURE"?null:"MEASURE"));
    if(channelButton)channelButton.addEventListener("click",()=>setDrawingTool(drawingTool==="CHANNEL"?null:"CHANNEL"));
    if(pitchforkButton)pitchforkButton.addEventListener("click",()=>setDrawingTool(drawingTool==="PITCHFORK"?null:"PITCHFORK"));
    if(riskRewardButton)riskRewardButton.addEventListener("click",()=>setDrawingTool(drawingTool==="RISK_REWARD"?null:"RISK_REWARD"));
    if(textButton)textButton.addEventListener("click",()=>setDrawingTool(drawingTool==="TEXT"?null:"TEXT"));
    if(textInput)textInput.addEventListener("input",updateDrawingButtons);
    layoutImportButton=document.getElementById("chart-v5-layout-import-btn");layoutReplaceButton=document.getElementById("chart-v5-layout-replace-btn");layoutImportFile=document.getElementById("chart-v5-layout-import-file");
    if(layoutButton)layoutButton.addEventListener("click",downloadLayout);
    if(layoutImportButton)layoutImportButton.addEventListener("click",()=>chooseLayoutFile("merge"));
    if(layoutReplaceButton)layoutReplaceButton.addEventListener("click",()=>chooseLayoutFile("replace"));
    if(layoutImportFile)layoutImportFile.addEventListener("change",readLayoutFile);
    document.addEventListener("keydown",event=>{if(event.key!=="Escape")return;if(dataWindowPinned){dataWindowPinned=null;renderDataWindow({detail:null});event.preventDefault();return}if(drawingTool){setDrawingTool(null);if(drawingStatus)drawingStatus.textContent="Zeichenwerkzeug abgebrochen."}});
    button.addEventListener("click",async()=>{
      if(active){active=false;quoteRequest++;clearInterval(quoteTimer);quoteTimer=null;panel.hidden=true;button.setAttribute("aria-expanded","false");button.textContent="V5 Vorschau";clearPositions();destroyRenderer();return}
      active=true;panel.hidden=false;button.setAttribute("aria-expanded","true");button.textContent="V5 schließen";
      window.dispatchEvent(new CustomEvent("chart-studio-v5-preview-opened",{detail:{scope:currentScope()}}));
      refreshLiveQuote();clearInterval(quoteTimer);quoteTimer=setInterval(refreshLiveQuote,15000);
      setStatus("Lade lokale v5-Vorschau …");
      try{await ensureBundle();mountRenderer();if(!bridge)throw new Error("Renderer konnte nicht erstellt werden")}
      catch(error){destroyRenderer();setStatus("V5-Vorschau nicht verfügbar: "+String(error?.message||error).slice(0,160))}
    });
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();

/* Optional read-only renderer preview. The v4 dashboard stays mounted and
   authoritative; the v5 bundle is fetched only after an explicit user click. */
(function(){
  "use strict";
  if(window.CHART_STUDIO_V5_PREVIEW_ENABLED!==true)return;
  let button=null,panel=null,host=null,status=null,title=null,chartTypeSelect=null,dataWindow=null,dataWindowPinButton=null,liveQuote=null,autoFibButton=null,autoFibStatus=null,trendButton=null,rayButton=null,priceButton=null,timeButton=null,rectButton=null,ellipseButton=null,fiboButton=null,fibFanButton=null,fibTrendButton=null,fibTimeButton=null,measureButton=null,channelButton=null,pitchforkButton=null,riskRewardButton=null,textButton=null,textInput=null,drawingStatus=null,layoutButton=null,layoutImportButton=null,layoutReplaceButton=null,layoutImportFile=null,profileSummary=null,profileName=null,profileList=null,profileSaveButton=null,profileLoadButton=null,profileRenameButton=null,profileCopyButton=null,profileDeleteButton=null,layoutResetButton=null,profileStatus=null,indicatorTemplateManager=null,indicatorTemplateName=null,indicatorTemplateList=null,indicatorTemplateSaveButton=null,indicatorTemplateApplyButton=null,indicatorTemplateRenameButton=null,indicatorTemplateCopyButton=null,indicatorTemplateDeleteButton=null,indicatorTemplateStatus=null;

  let scope=null,latest=null,engine=null,bridge=null,indicatorBridge=null,oscillatorBridge=null,active=false,loading=null,autoFibEnabled=false,dataWindowHover=null,dataWindowPinned=null,dataWindowCrosshairActive=false,indicatorTemplateStore=null;
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
  const drawingNames={PRICE:"Preislinie",TIME:"Zeitlinie",TEXT:"Text",TREND:"Trendlinie",RECT:"Rechteck",ELLIPSE:"Ellipse",RAY:"Strahl",FIBO:"Fibonacci",FIB_FAN:"Fibonacci-Fächer",FIB_TREND:"Trend-Fibonacci",CHANNEL:"Kanal",PITCHFORK:"Pitchfork",MEASURE:"Messung",RISK_REWARD:"Risiko/Ertrag"};
  function readNativeDrawingRows(){
    if(!engine)return [];
    const envelope=JSON.parse(engine.exportDrawings());
    if(!Array.isArray(envelope?.drawings))return [];
    return envelope.drawings.filter(row=>row&&typeof row.kind==="string"&&row.options&&typeof row.options.id==="string")
      .map(row=>({id:row.options.id,kind:row.kind,options:row.options}));
  }
  function refreshDrawingManager(statusOverride=null){
    const list=document.getElementById("chart-v5-object-list"),message=document.getElementById("chart-v5-object-status");
    if(!list)return;
    let rows=[],selected=[],readError="";
    try{rows=readNativeDrawingRows();selected=engine?.inspect?.().selectedDrawingIds||[]}catch(error){readError="Zeichnungsliste nicht verfügbar · "+String(error?.message||error).slice(0,100)}
    const selectedIds=new Set(selected);list.replaceChildren();
    for(const row of rows){
      const item=document.createElement("li");item.dataset.drawingId=row.id;
      const label=document.createElement("label"),checkbox=document.createElement("input");checkbox.type="checkbox";checkbox.checked=selectedIds.has(row.id);
      const customLabel=typeof row.options.text==="string"?row.options.text:typeof row.options.title==="string"?row.options.title:"";
      const drawingLabel=`${drawingNames[row.kind]||row.kind}${customLabel?` · ${customLabel}`:""}`,stateLabel=`${row.options.visible===false?" · verborgen":" · sichtbar"}${row.options.locked===true?" · gesperrt":" · entsperrt"}`;
      checkbox.setAttribute("aria-label",`Auswählen: ${drawingLabel} · ${row.id.slice(-8)}${stateLabel}`);checkbox.addEventListener("change",()=>{
        if(!engine)return;
        try{engine.selectDrawings([...list.querySelectorAll('input[type="checkbox"]:checked')].map(input=>input.closest("[data-drawing-id]")?.dataset.drawingId).filter(Boolean));refreshDrawingManager()}
        catch(error){refreshDrawingManager("Auswahl abgelehnt · "+String(error?.message||error).slice(0,100))}
      });
      const title=document.createElement("span");title.textContent=drawingLabel;label.append(checkbox,title);item.append(label);
      const state=document.createElement("span");state.textContent=stateLabel;item.append(state);list.append(item);
    }
    const hasSelection=selectedIds.size>0;
    for(const id of ["chart-v5-object-hide","chart-v5-object-show","chart-v5-object-lock","chart-v5-object-unlock","chart-v5-object-duplicate","chart-v5-object-delete"]){const control=document.getElementById(id);if(control)control.disabled=!engine||!hasSelection}
    for(const id of ["chart-v5-object-undo","chart-v5-object-redo"]){const control=document.getElementById(id);if(control)control.disabled=!engine}
    if(message)message.textContent=statusOverride||readError||(rows.length?`${rows.length} Zeichnungen · ${selectedIds.size} ausgewählt`:"Keine Zeichnungen in diesem Chart.");
  }
  function applyDrawingManagerAction(action){
    if(!engine)return;
    try{
      if(action==="hide")engine.setSelectedDrawingsVisible(false);
      else if(action==="show")engine.setSelectedDrawingsVisible(true);
      else if(action==="lock")engine.setSelectedDrawingsLocked(true);
      else if(action==="unlock")engine.setSelectedDrawingsLocked(false);
      else if(action==="duplicate")engine.duplicateSelectedDrawings();
      else if(action==="delete")engine.deleteSelectedDrawings();
      else if(action==="undo")engine.undo();
      else if(action==="redo")engine.redo();
      refreshDrawingManager();
    }catch(error){refreshDrawingManager(`Aktion abgelehnt · ${String(error?.message||error).slice(0,120)}`)}
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
    if(host){host.removeEventListener("pointerup",refreshDrawingManager);host.removeEventListener("pointercancel",refreshDrawingManager)}
    try{indicatorBridge?.clear()}catch(_){}indicatorBridge=null;
    try{oscillatorBridge?.clear()}catch(_){}oscillatorBridge=null;
    dataWindowHover=null;dataWindowPinned=null;dataWindowCrosshairActive=false;
    renderDataWindow({detail:null});
    try{engine?.destroy()}catch(_){}
    engine=null;bridge=null;autoFibEnabled=false;drawingTool=null;if(autoFibButton){autoFibButton.setAttribute("aria-pressed","false");autoFibButton.textContent="Auto-Fibonacci einblenden";autoFibButton.disabled=!latest}if(autoFibStatus)autoFibStatus.textContent="";updateDrawingButtons();if(drawingStatus)drawingStatus.textContent="Zeichenwerkzeug aus.";if(host)host.replaceChildren();refreshDrawingManager();
  }
  function updateDrawingButtons(){for(const [button,kind] of [[trendButton,"TREND"],[rayButton,"RAY"],[priceButton,"PRICE"],[timeButton,"TIME"],[rectButton,"RECT"],[ellipseButton,"ELLIPSE"],[fiboButton,"FIBO"],[fibFanButton,"FIB_FAN"],[fibTrendButton,"FIB_TREND"],[fibTimeButton,"FIB_TIME"],[measureButton,"MEASURE"],[channelButton,"CHANNEL"],[pitchforkButton,"PITCHFORK"],[riskRewardButton,"RISK_REWARD"],[textButton,"TEXT"]])if(button){button.disabled=!engine||!latest||(kind==="TEXT"&&!/^[\x20-\x7E]{1,40}$/.test(textInput?.value||""));button.setAttribute("aria-pressed",drawingTool===kind?"true":"false")}for(const item of [layoutButton,layoutImportButton,layoutReplaceButton,profileSaveButton,layoutResetButton])if(item)item.disabled=!engine||!latest;updateProfileButtons();updateIndicatorTemplateButtons()}
  function exactObject(value){return !!value&&typeof value==="object"&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null)}
  function normalizeTemplateIndicators(raw){
    const api=window.ChartStudioIndicators;
    if(!api||typeof api.settings!=="function"||!api.registry)throw new Error("INDICATORS_UNAVAILABLE");
    const defaults=api.settings(),keys=Object.keys(defaults);
    if(!exactObject(raw)||Object.keys(raw).sort().join(",")!==keys.slice().sort().join(","))throw new Error("INVALID_INDICATOR_SETTINGS");
    const result={};
    for(const kind of keys){
      const source=raw[kind],schema=defaults[kind];
      if(!exactObject(source)||!exactObject(schema))throw new Error("INVALID_INDICATOR_SETTINGS");
      const expected=Object.keys(schema).filter(key=>!(kind==="pivots"&&key==="sourceWindow"));
      if(Object.keys(source).some(key=>key==="sourceWindow")||Object.keys(source).sort().join(",")!==expected.slice().sort().join(","))throw new Error("INVALID_INDICATOR_SETTINGS");
      const item={};
      for(const key of expected){
        const value=source[key],baseline=schema[key];
        if(typeof value!==typeof baseline||typeof value==="number"&&!Number.isFinite(value))throw new Error("INVALID_INDICATOR_SETTINGS");
        if(typeof value==="number"){
          const minimum=key==="multiplier"?.1:key==="step"||key==="maxStep"?.01:key==="smoothK"||key==="smoothD"?1:key==="displacement"?0:2;
          const maximum=key==="multiplier"?10:key==="step"||key==="maxStep"?.5:key==="slow"?300:key==="smoothK"||key==="smoothD"?100:key==="displacement"?200:["period","atrPeriod","tenkanPeriod","kijunPeriod","senkouBPeriod","signal","fast"].includes(key)?api.registry[kind]?.max||200:300;
          if(value<minimum||value>maximum||["period","atrPeriod","fast","slow","signal","smoothK","smoothD","displacement","tenkanPeriod","kijunPeriod","senkouBPeriod"].includes(key)&&!Number.isInteger(value)||key==="multiplier"&&Math.abs(value*10-Math.round(value*10))>1e-8||["step","maxStep"].includes(key)&&Math.abs(value*100-Math.round(value*100))>1e-8)throw new Error("INVALID_INDICATOR_SETTINGS");
        }else if(typeof value==="string"){
          if(["upColor","downColor"].includes(key)&&!/^#[0-9a-fA-F]{6}$/.test(value))throw new Error("INVALID_INDICATOR_SETTINGS");
          if(key==="timeZone"){try{new Intl.DateTimeFormat("en-US",{timeZone:value})}catch(_){throw new Error("INVALID_INDICATOR_SETTINGS")}}
          if(key==="sessionStart"&&!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value))throw new Error("INVALID_INDICATOR_SETTINGS");
          if(key==="basis"&&!(["D1","W1"].includes(value)))throw new Error("INVALID_INDICATOR_SETTINGS");
          if(!["upColor","downColor","timeZone","sessionStart","basis"].includes(key)&&value!==baseline)throw new Error("INVALID_INDICATOR_SETTINGS");
        }else if(typeof value==="boolean"){}else if(value!==baseline)throw new Error("INVALID_INDICATOR_SETTINGS");
        item[key]=value;
      }
      if(kind==="macd"&&item.fast>=item.slow||kind==="sar"&&(item.step>item.maxStep||item.step>.1))throw new Error("INVALID_INDICATOR_SETTINGS");
      result[kind]=item;
    }
    return result;
  }
  function normalizeIndicatorTemplateSnapshot(raw){
    if(!exactObject(raw)||Object.keys(raw).sort().join(",")!=="indicators,movingAverages,oscillatorInstances")throw new Error("INVALID_SNAPSHOT");
    const indicators=normalizeTemplateIndicators(raw.indicators),averages=window.ChartStudioAverages,oscillators=window.ChartStudioOscillators;
    if(!averages||typeof averages.normalizeList!=="function"||typeof averages.getAccount!=="function"||averages.getAccount()!==scope?.account)throw new Error("AVERAGES_UNAVAILABLE");
    if(!oscillators||typeof oscillators.normalizeList!=="function"||typeof oscillators.getAccount!=="function"||oscillators.getAccount()!==scope?.account)throw new Error("OSCILLATORS_UNAVAILABLE");
    const movingAverages=averages.normalizeList(raw.movingAverages),oscillatorInstances=oscillators.normalizeList(raw.oscillatorInstances);
    if(!movingAverages||movingAverages.length!==raw.movingAverages.length||!oscillatorInstances||oscillatorInstances.length!==raw.oscillatorInstances.length)throw new Error("INVALID_INDICATOR_INSTANCES");
    const serialized=JSON.stringify({indicators,movingAverages,oscillatorInstances});
    if(new TextEncoder().encode(serialized).length>512*1024)throw new Error("SNAPSHOT_LIMIT");
    return JSON.parse(serialized);
  }
  function currentIndicatorTemplateSnapshot(){
    const indicators=window.ChartStudioIndicators?.settings?.(),movingAverages=window.ChartStudioAverages?.getConfigs?.(),oscillatorInstances=window.ChartStudioOscillators?.settings?.();
    if(!indicators||!Array.isArray(movingAverages)||!Array.isArray(oscillatorInstances))throw new Error("INDICATORS_UNAVAILABLE");
    const copy=JSON.parse(JSON.stringify(indicators));
    if(copy.pivots)delete copy.pivots.sourceWindow;
    return normalizeIndicatorTemplateSnapshot({indicators:copy,movingAverages,oscillatorInstances});
  }
  function applyIndicatorTemplateSnapshot(snapshot){
    const normalized=normalizeIndicatorTemplateSnapshot(snapshot),averages=window.ChartStudioAverages,indicators=window.ChartStudioIndicators,oscillators=window.ChartStudioOscillators;
    if(averages.applySettings(normalized.movingAverages)===false)throw new Error("APPLY_FAILED");
    indicators.applySettings(normalized.indicators);
    if(oscillators.applySettings(normalized.oscillatorInstances)===false)throw new Error("APPLY_FAILED");
    syncMovingAverages();syncOscillators();
    return true;
  }
  function ensureIndicatorTemplateStore(){
    if(!scope||!window.ChartStudioV5IndicatorTemplates?.createStore)throw new Error("TEMPLATE_STORE_UNAVAILABLE");
    indicatorTemplateStore=window.ChartStudioV5IndicatorTemplates.createStore({storage:window.localStorage,scope});
    return indicatorTemplateStore;
  }
  function selectedIndicatorTemplateId(){return indicatorTemplateList?.value||""}
  function indicatorTemplateCount(){try{return indicatorTemplateStore?.list?.().length||0}catch(_){return 0}}
  function updateIndicatorTemplateButtons(){
    const ready=!!engine&&!!latest,selected=!!selectedIndicatorTemplateId();
    if(indicatorTemplateSaveButton)indicatorTemplateSaveButton.disabled=!ready;
    for(const item of [indicatorTemplateApplyButton,indicatorTemplateRenameButton,indicatorTemplateCopyButton,indicatorTemplateDeleteButton])if(item)item.disabled=!ready||!selected;
  }
  function refreshIndicatorTemplateList(){
    if(!indicatorTemplateList)return;
    const previous=indicatorTemplateList.value;indicatorTemplateList.replaceChildren();
    const placeholder=document.createElement("option");placeholder.value="";placeholder.textContent="Template auswählen …";indicatorTemplateList.append(placeholder);
    try{
      const store=ensureIndicatorTemplateStore();
      if(indicatorTemplateManager&&scope)indicatorTemplateManager.querySelector("summary").textContent=`Indikator-Templates · ${scope.account} · ${scope.symbol} · ${scope.timeframe}`;
      for(const item of store.list()){const option=document.createElement("option");option.value=item.id;option.textContent=item.name;indicatorTemplateList.append(option)}
      if([...indicatorTemplateList.options].some(item=>item.value===previous))indicatorTemplateList.value=previous;
      if(indicatorTemplateStatus&&!indicatorTemplateStatus.textContent)indicatorTemplateStatus.textContent="Enthält nur Indikatoreinstellungen; lokale Speicherung pro Konto, Symbol und Zeitraum.";
    }catch(error){if(indicatorTemplateStatus)indicatorTemplateStatus.textContent="Template-Liste nicht verfügbar · "+String(error?.message||error).slice(0,120)}
    updateIndicatorTemplateButtons();
  }
  function installIndicatorTemplateControls(){
    const anchor=document.getElementById("chart-v5-profile-manager");if(!anchor||document.getElementById("chart-v5-indicator-template-manager"))return;
    indicatorTemplateManager=document.createElement("details");indicatorTemplateManager.id="chart-v5-indicator-template-manager";indicatorTemplateManager.className="w-full rounded border border-violet-400/20 bg-slate-950/50 p-2";
    const summary=document.createElement("summary");summary.className="cursor-pointer select-none font-bold text-violet-100";summary.textContent="Native v5 Indikator-Templates";indicatorTemplateManager.append(summary);
    const row=document.createElement("div");row.className="mt-2 flex flex-wrap items-end gap-2";
    const nameLabel=document.createElement("label");nameLabel.className="flex flex-col gap-1";nameLabel.append(document.createTextNode("Name "));
    indicatorTemplateName=document.createElement("input");indicatorTemplateName.id="chart-v5-indicator-template-name";indicatorTemplateName.maxLength=40;indicatorTemplateName.autocomplete="off";indicatorTemplateName.className="w-48 rounded border border-slate-600 bg-slate-900 px-2 py-1 text-slate-100";nameLabel.append(indicatorTemplateName);
    const listLabel=document.createElement("label");listLabel.className="flex flex-col gap-1";listLabel.append(document.createTextNode("Indikator-Template "));
    indicatorTemplateList=document.createElement("select");indicatorTemplateList.id="chart-v5-indicator-template-list";indicatorTemplateList.setAttribute("aria-label","Gespeichertes natives v5 Indikator-Template");indicatorTemplateList.className="min-w-40 rounded border border-slate-600 bg-slate-900 px-2 py-1 text-slate-100";listLabel.append(indicatorTemplateList);
    const makeButton=(id,label)=>{const item=document.createElement("button");item.type="button";item.id=id;item.textContent=label;item.className="rounded border border-violet-400/40 bg-violet-900/20 px-2 py-1 font-bold text-violet-100";return item};
    indicatorTemplateSaveButton=makeButton("chart-v5-indicator-template-save","Aktuelle Indikatoren speichern");
    indicatorTemplateApplyButton=makeButton("chart-v5-indicator-template-apply","Anwenden…");
    indicatorTemplateRenameButton=makeButton("chart-v5-indicator-template-rename","Umbenennen");
    indicatorTemplateCopyButton=makeButton("chart-v5-indicator-template-copy","Kopieren");
    indicatorTemplateDeleteButton=makeButton("chart-v5-indicator-template-delete","Löschen");
    row.append(nameLabel,listLabel,indicatorTemplateSaveButton,indicatorTemplateApplyButton,indicatorTemplateRenameButton,indicatorTemplateCopyButton,indicatorTemplateDeleteButton);
    indicatorTemplateManager.append(row);indicatorTemplateStatus=document.createElement("output");indicatorTemplateStatus.id="chart-v5-indicator-template-status";indicatorTemplateStatus.setAttribute("role","status");indicatorTemplateStatus.setAttribute("aria-live","polite");indicatorTemplateStatus.className="mt-1 block text-slate-300";indicatorTemplateManager.append(indicatorTemplateStatus);
    anchor.insertAdjacentElement("afterend",indicatorTemplateManager);
    indicatorTemplateSaveButton.addEventListener("click",()=>indicatorTemplateAction(()=>{const result=ensureIndicatorTemplateStore().save(indicatorTemplateName.value,currentIndicatorTemplateSnapshot());refreshIndicatorTemplateList();indicatorTemplateList.value=result.id;indicatorTemplateStatus.textContent=`Indikator-Template „${result.name}“ gespeichert.`}));
    indicatorTemplateApplyButton.addEventListener("click",()=>indicatorTemplateAction(()=>{const store=ensureIndicatorTemplateStore(),entry=store.get(selectedIndicatorTemplateId());if(!window.confirm(`Indikator-Template „${entry.name}“ für ${scope.account} · ${scope.symbol} · ${scope.timeframe} anwenden und aktuelle Indikatoreinstellungen ersetzen?`))return;store.apply(entry.id,{current:currentIndicatorTemplateSnapshot(),apply:applyIndicatorTemplateSnapshot});indicatorTemplateStatus.textContent=`Indikator-Template „${entry.name}“ angewendet.`}));
    indicatorTemplateRenameButton.addEventListener("click",()=>indicatorTemplateAction(()=>{const result=ensureIndicatorTemplateStore().rename(selectedIndicatorTemplateId(),indicatorTemplateName.value);refreshIndicatorTemplateList();indicatorTemplateList.value=result.id;indicatorTemplateStatus.textContent=`Indikator-Template in „${result.name}“ umbenannt.`}));
    indicatorTemplateCopyButton.addEventListener("click",()=>indicatorTemplateAction(()=>{const result=ensureIndicatorTemplateStore().copy(selectedIndicatorTemplateId(),indicatorTemplateName.value);refreshIndicatorTemplateList();indicatorTemplateList.value=result.id;indicatorTemplateStatus.textContent=`Indikator-Template „${result.name}“ kopiert.`}));
    indicatorTemplateDeleteButton.addEventListener("click",()=>indicatorTemplateAction(()=>{const entry=ensureIndicatorTemplateStore().get(selectedIndicatorTemplateId());if(!window.confirm(`Indikator-Template „${entry.name}“ löschen?`))return;ensureIndicatorTemplateStore().remove(entry.id);indicatorTemplateName.value="";refreshIndicatorTemplateList();indicatorTemplateStatus.textContent=`Indikator-Template „${entry.name}“ gelöscht.`}));
    indicatorTemplateList.addEventListener("change",()=>{try{indicatorTemplateName.value=selectedIndicatorTemplateId()?ensureIndicatorTemplateStore().get(selectedIndicatorTemplateId()).name:""}catch(_){indicatorTemplateName.value=""}updateIndicatorTemplateButtons()});
    indicatorTemplateSaveButton.disabled=true;updateIndicatorTemplateButtons();
  }
  function indicatorTemplateAction(action){try{action()}catch(error){if(indicatorTemplateStatus)indicatorTemplateStatus.textContent="Templateaktion nicht ausgeführt · "+String(error?.message||error).slice(0,140)}}
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
  const viewKeys="chartType,displayTimeZone,movingAverages,oscillators,paneHeights,paneLines,parabolicSars,sessionVwaps,supertrends,visibleRange,volumePaneIndex,volumeVisible";
  const legacyViewKeys="displayTimeZone,movingAverages,oscillators,paneHeights,paneLines,parabolicSars,sessionVwaps,supertrends,visibleRange,volumePaneIndex,volumeVisible";
  function parseLayout(serialized){
    if(typeof serialized!=="string"||new TextEncoder().encode(serialized).length>512*1024)throw new Error("Layoutdatei ungültig oder zu groß");
    let layout;try{layout=JSON.parse(serialized)}catch(_){throw new Error("Layout-JSON ist ungültig")}
    if(!layout||typeof layout!=="object"||Array.isArray(layout)||Object.keys(layout).sort().join(",")!==portableKeys||layout.schemaVersion!==2||
       typeof layout.symbol!=="string"||typeof layout.timeframe!=="string"||!Array.isArray(layout.drawings)||!layout.view||typeof layout.view!=="object"||Array.isArray(layout.view)||
       ![viewKeys,legacyViewKeys].includes(Object.keys(layout.view).sort().join(",")))throw new Error("Nicht unterstütztes Layoutformat");
    if(!scope||layout.symbol!==scope.symbol||layout.timeframe!==scope.timeframe)throw new Error("Layoutscope stimmt nicht mit dem aktiven Chart überein");
    if(!Object.hasOwn(layout.view,"chartType"))layout.view.chartType=engine?.readPricePresentation?.().type||"candles";
    if(!["candles","bars","line","area","heikin","hollow"].includes(layout.view.chartType))throw new Error("Layout enthält einen unbekannten Charttyp");
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
    merged.view.visibleRange=target.view.visibleRange;merged.view.displayTimeZone=target.view.displayTimeZone;merged.view.chartType=incoming.view.chartType;
    return merged;
  }
  function storedLayout(layout){return JSON.stringify({schemaVersion:6,account:scope.account,symbol:scope.symbol,timeframe:scope.timeframe,
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
  const PROFILE_LIMIT=20,PROFILE_BYTES_LIMIT=2*1024*1024;
  function profileStorageKey(){return `2eas.chartstudio.v5.profiles:v1:${encodeURIComponent(scope.account)}:${encodeURIComponent(scope.symbol)}:${encodeURIComponent(scope.timeframe)}`}
  function cleanProfileName(value){if(typeof value!=="string")throw new Error("Layoutname muss Text sein");const name=value.trim();if(name.length<1||name.length>40||/[\x00-\x1f\x7f]/.test(name))throw new Error("Layoutname muss 1–40 druckbare Zeichen enthalten");return name}
  function readProfileStore(){
    if(!scope)throw new Error("Kein aktiver Layoutscope");
    const raw=window.localStorage.getItem(profileStorageKey());if(raw===null)return {schemaVersion:1,account:scope.account,symbol:scope.symbol,timeframe:scope.timeframe,profiles:[]};
    if(new TextEncoder().encode(raw).length>PROFILE_BYTES_LIMIT)throw new Error("Lokaler Layoutspeicher überschreitet 2 MiB");
    let store;try{store=JSON.parse(raw)}catch(_){throw new Error("Lokaler Layoutspeicher ist beschädigt")}
    if(!store||typeof store!=="object"||Array.isArray(store)||Object.keys(store).sort().join(",")!=="account,profiles,schemaVersion,symbol,timeframe"||
      store.schemaVersion!==1||store.account!==scope.account||store.symbol!==scope.symbol||store.timeframe!==scope.timeframe||!Array.isArray(store.profiles)||store.profiles.length>PROFILE_LIMIT)
      throw new Error("Gespeicherte Layouts haben einen ungültigen Scope oder ein ungültiges Schema");
    const ids=new Set(),names=new Set();
    for(const profile of store.profiles){
      if(!profile||typeof profile!=="object"||Array.isArray(profile)||Object.keys(profile).sort().join(",")!=="id,layout,name"||
        typeof profile.id!=="string"||!/^[-_a-zA-Z0-9]{12,64}$/.test(profile.id)||ids.has(profile.id)||
        typeof profile.layout!=="string"||new TextEncoder().encode(profile.layout).length>512*1024)throw new Error("Gespeichertes Layout ist ungültig");
      const name=cleanProfileName(profile.name),folded=name.toLocaleLowerCase();if(names.has(folded))throw new Error("Gespeicherte Layoutnamen sind doppelt");
      parseLayout(profile.layout);ids.add(profile.id);names.add(folded);
    }
    return store;
  }
  function writeProfileStore(store){
    const key=profileStorageKey(),previous=window.localStorage.getItem(key),serialized=JSON.stringify(store);
    if(new TextEncoder().encode(serialized).length>PROFILE_BYTES_LIMIT)throw new Error("Lokale Layouts überschreiten 2 MiB");
    try{window.localStorage.setItem(key,serialized);if(window.localStorage.getItem(key)!==serialized)throw new Error("Layoutspeicher hat den Stand nicht bestätigt")}
    catch(error){try{if(previous===null)window.localStorage.removeItem(key);else window.localStorage.setItem(key,previous)}catch(_){}throw error}
  }
  function selectedProfileId(){return profileList?.value||""}
  function updateProfileButtons(){
    const selected=!!selectedProfileId(),ready=!!engine&&!!latest;
    if(profileSaveButton)profileSaveButton.disabled=!ready;
    for(const item of [profileLoadButton,profileRenameButton,profileCopyButton,profileDeleteButton])if(item)item.disabled=!ready||!selected;
    if(layoutResetButton)layoutResetButton.disabled=!ready;
  }
  function refreshProfileList(){
    if(profileSummary&&scope)profileSummary.textContent=`Lokale Layouts · ${scope.account} · ${scope.symbol} · ${scope.timeframe}`;
    if(!profileList)return;
    const prior=profileList.value;profileList.replaceChildren();
    const placeholder=document.createElement("option");placeholder.value="";placeholder.textContent="Layout auswählen …";profileList.append(placeholder);
    try{for(const profile of readProfileStore().profiles){const option=document.createElement("option");option.value=profile.id;option.textContent=profile.name;profileList.append(option)}
      if([...profileList.options].some(option=>option.value===prior))profileList.value=prior;
      if(profileStatus&&!profileStatus.textContent)profileStatus.textContent="Layouts werden nur in diesem Browser gespeichert.";
    }catch(error){if(profileStatus)profileStatus.textContent="Layoutliste nicht verfügbar · "+String(error?.message||error).slice(0,120)}
    updateProfileButtons();
  }
  function profileById(store,id){return store.profiles.find(profile=>profile.id===id)||null}
  function ensureUniqueProfileName(store,name,exceptId=""){
    const folded=name.toLocaleLowerCase();if(store.profiles.some(profile=>profile.id!==exceptId&&profile.name.toLocaleLowerCase()===folded))throw new Error("Ein Layout mit diesem Namen existiert bereits");
  }
  function newProfileId(){if(window.crypto?.randomUUID)return window.crypto.randomUUID();const bytes=new Uint8Array(16);window.crypto.getRandomValues(bytes);return [...bytes].map(value=>value.toString(16).padStart(2,"0")).join("")}
  function saveProfile(){
    const store=readProfileStore(),name=cleanProfileName(profileName?.value||"");ensureUniqueProfileName(store,name);
    if(store.profiles.length>=PROFILE_LIMIT)throw new Error(`Höchstens ${PROFILE_LIMIT} Layouts pro Konto, Symbol und Zeitraum`);
    const layout=exportLayout();parseLayout(layout);store.profiles.push({id:newProfileId(),name,layout});writeProfileStore(store);refreshProfileList();profileList.value=store.profiles.at(-1).id;
    updateProfileButtons();if(profileStatus)profileStatus.textContent=`Layout „${name}“ gespeichert.`;return {name,count:store.profiles.length};
  }
  function renameProfile(){
    const store=readProfileStore(),profile=profileById(store,selectedProfileId());if(!profile)throw new Error("Bitte zuerst ein Layout auswählen");
    const name=cleanProfileName(profileName?.value||"");ensureUniqueProfileName(store,name,profile.id);profile.name=name;writeProfileStore(store);refreshProfileList();profileList.value=profile.id;
    if(profileStatus)profileStatus.textContent=`Layout in „${name}“ umbenannt.`;return {name,count:store.profiles.length};
  }
  function copyProfile(){
    const store=readProfileStore(),source=profileById(store,selectedProfileId());if(!source)throw new Error("Bitte zuerst ein Layout auswählen");
    const name=cleanProfileName(profileName?.value||"");ensureUniqueProfileName(store,name);if(store.profiles.length>=PROFILE_LIMIT)throw new Error(`Höchstens ${PROFILE_LIMIT} Layouts pro Konto, Symbol und Zeitraum`);
    const copy={id:newProfileId(),name,layout:source.layout};store.profiles.push(copy);writeProfileStore(store);refreshProfileList();profileList.value=copy.id;
    if(profileStatus)profileStatus.textContent=`Layout „${source.name}“ als „${name}“ kopiert.`;return {name,count:store.profiles.length};
  }
  function loadProfile(){
    const profile=profileById(readProfileStore(),selectedProfileId());if(!profile)throw new Error("Bitte zuerst ein Layout auswählen");
    if(!window.confirm(`Gespeichertes Layout „${profile.name}“ für ${scope.symbol} ${scope.timeframe} laden und die aktuelle Ansicht ersetzen?`))throw new Error("Laden abgebrochen");
    const result=importLayout(profile.layout,"replace",true);if(profileStatus)profileStatus.textContent=`Layout „${profile.name}“ geladen.`;return result;
  }
  function deleteProfile(){
    const store=readProfileStore(),profile=profileById(store,selectedProfileId());if(!profile)throw new Error("Bitte zuerst ein Layout auswählen");
    if(!window.confirm(`Gespeichertes Layout „${profile.name}“ löschen?`))throw new Error("Löschen abgebrochen");
    store.profiles=store.profiles.filter(item=>item.id!==profile.id);writeProfileStore(store);refreshProfileList();profileName.value="";
    if(profileStatus)profileStatus.textContent=`Layout „${profile.name}“ gelöscht.`;return {count:store.profiles.length};
  }
  function resetCurrentLayout(){
    if(!engine||!scope)throw new Error("Aktuelles Layout ist nicht verfügbar");
    if(!window.confirm(`Das aktuelle Arbeitslayout für ${scope.symbol} ${scope.timeframe} zurücksetzen? Gespeicherte Layouts bleiben erhalten.`))throw new Error("Zurücksetzen abgebrochen");
    const key=layoutStorageKey(),previous=window.localStorage.getItem(key);
    try{window.localStorage.removeItem(key);destroyRenderer();mountRenderer();const state=engine?.inspect();if(!state||state.persistenceStatus!=="READY"||state.persistenceError!==null)throw new Error("Standardlayout konnte nicht geladen werden")}
    catch(error){let rollbackFailed=false;try{if(previous!==null)window.localStorage.setItem(key,previous)}catch(_){rollbackFailed=true}destroyRenderer();mountRenderer();const state=engine?.inspect();if(rollbackFailed||!state||state.persistenceStatus!=="READY"||state.persistenceError!==null)throw new Error("Layout-Reset fehlgeschlagen; vorheriger Zustand konnte nicht wiederhergestellt werden");throw error}
    if(profileStatus)profileStatus.textContent="Aktuelles Layout zurückgesetzt · gespeicherte Layouts bleiben erhalten.";return true;
  }
  function profileAction(action){try{action()}catch(error){if(profileStatus)profileStatus.textContent="Layoutaktion nicht ausgeführt · "+String(error?.message||error).slice(0,140)}}
  function importLayout(serialized,mode="merge",replaceConfirmed=false){
    if(!engine||!scope||!latest)throw new Error("Layoutimport benötigt verifizierte Chartdaten");
    if(mode!=="merge"&&mode!=="replace")throw new Error("Unbekannter Importmodus");
    if(mode==="replace"&&!replaceConfirmed&&!window.confirm("Das aktuelle lokale Layout dieses Kontos, Symbols und Zeitrahmens ersetzen?"))throw new Error("Import abgebrochen");
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
      refreshDrawingManager();
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
    if(kind!==null&&!["TREND","RAY","PRICE","TIME","RECT","ELLIPSE","FIBO","FIB_FAN","FIB_TREND","FIB_TIME","MEASURE","CHANNEL","PITCHFORK","RISK_REWARD","TEXT"].includes(kind))return false;
    if(!engine||(kind!==null&&!latest))return false;
    if(kind==="TEXT"&&!/^[\x20-\x7E]{1,40}$/.test(textInput?.value||"")){if(drawingStatus)drawingStatus.textContent="Text muss 1–40 druckbare ASCII-Zeichen enthalten.";return false}
    drawingTool=kind;engine.setDrawingTool(kind,kind==="TEXT"?textInput.value:undefined);updateDrawingButtons();
    if(drawingStatus)drawingStatus.textContent=kind?`${({TREND:"Trendlinie",RAY:"Strahl",PRICE:"Preislinie",TIME:"Zeitlinie",RECT:"Rechteck",ELLIPSE:"Ellipse",FIBO:"Fibonacci",FIB_FAN:"Fibonacci-Fächer",FIB_TREND:"Trend-Fibonacci",FIB_TIME:"Fibonacci-Zeitzonen",MEASURE:"Messung",CHANNEL:"Kanal",PITCHFORK:"Pitchfork",RISK_REWARD:"Risiko/Ertrag",TEXT:"Text"})[kind]}: ${kind==="PRICE"||kind==="TIME"||kind==="TEXT"?"Kerze wählen.":"ersten Anker wählen."}`:"Zeichenwerkzeug aus.";
    return true;
  }
  function drawingState(event){const detail=event?.detail;if(!detail)return;
    if(detail.phase==="FIRST_ANCHOR"){if(drawingStatus)drawingStatus.textContent="Ersten Anker gesetzt · zweiten Anker wählen."}
    else if(detail.phase==="SECOND_ANCHOR"){if(drawingStatus)drawingStatus.textContent=detail.kind==="CHANNEL"?"Dritten Kanalanker wählen.":detail.kind==="PITCHFORK"?"Dritten Pitchfork-Anker wählen.":detail.kind==="RISK_REWARD"?"Dritten Anker für das Ziel wählen.":detail.kind==="FIB_TREND"?"Dritten Anker für die Projektionen wählen.":"Zweiten Anker wählen."}
    else if(detail.phase==="CREATED"){drawingTool=null;window.__chartStudioV5LastDrawingId=detail.id;window.__chartStudioV5LastDrawingKind=detail.kind;updateDrawingButtons();if(drawingStatus)drawingStatus.textContent="Zeichnung erstellt.";refreshDrawingManager()}
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
  function syncChartType(){if(!chartTypeSelect)return;const value=engine?.readPricePresentation?.();chartTypeSelect.disabled=!engine||!latest||!value;if(value&&["candles","bars","line","area","heikin","hollow"].includes(value.type))chartTypeSelect.value=value.type}
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
      host.addEventListener("pointerup",refreshDrawingManager);
      host.addEventListener("pointercancel",refreshDrawingManager);
      if(!window.ChartStudioV5IndicatorFeed?.create)throw new Error("Indikatorbrücke nicht verfügbar");
      indicatorBridge=window.ChartStudioV5IndicatorFeed.create(engine,scope);
      if(!window.ChartStudioV5OscillatorFeed?.create)throw new Error("Oszillatorbrücke nicht verfügbar");
      oscillatorBridge=window.ChartStudioV5OscillatorFeed.create(engine,scope);
      setStatus("Warte auf verifizierte MT5-Kerzen …");
      if(latest){const token=bridge.beginRead();const result=bridge.update(latest,token);
        if(autoFibButton)autoFibButton.disabled=!Number.isSafeInteger(latest.snapshotAsOfUtc);
        updateDrawingButtons();
        if(result.applied){refreshPinnedDataWindow();renderPositions();renderBrokerDealMarkers();syncMarketLevels();syncMovingAverages();syncOscillators();refreshDrawingManager()}syncChartType();
        setStatus(result.applied?`${result.candleCount} verifizierte Kerzen · read-only · Kerzenfrische ungeprüft`:"V5-Daten abgelehnt: "+result.reason)}
    }catch(error){destroyRenderer();setStatus("V5-Vorschau nicht verfügbar: "+String(error?.message||error).slice(0,160))}
  }
  function setScope(next){
    if(!window.ChartStudioV5Feed?.validScope(next))return false;
    if(same(scope,next))return true;
    scope={account:next.account,symbol:next.symbol,timeframe:next.timeframe};
    if(title)title.textContent=`Native v5 · ${scope.symbol} ${scope.timeframe} · ${scope.account}`;
    refreshProfileList();refreshIndicatorTemplateList();
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
    syncChartType();setStatus(`${result.candleCount} verifizierte Kerzen · ${indicatorResult.applied?indicatorResult.count+" benutzerdefinierte MAs":indicatorResult.reason||"MAs nicht synchronisiert"} · read-only · Kerzenfrische ungeprüft`);
    return result;
  }
  function clear(message){
    latest=null;latestSequence=++sequence;brokerDealMarkersSnapshot=null;dataWindowHover=null;dataWindowPinned=null;dataWindowCrosshairActive=false;renderDataWindow({detail:null});try{engine?.setBrokerDealMarkers({scope:{...scope},source:"MT5_VERIFIED",canExecute:false,markers:[]})}catch(_){}try{engine?.clearMarketLevels?.()}catch(_){}
    clearAutoFib();clearPositions();try{bridge?.clear()}catch(_){}try{indicatorBridge?.clear()}catch(_){}try{oscillatorBridge?.clear()}catch(_){}if(autoFibButton)autoFibButton.disabled=true;
    setDrawingTool(null);updateDrawingButtons();
    setStatus(message||"MT5-Kerzen derzeit nicht verfügbar");
  }
  window.ChartStudioV5Preview=Object.freeze({setScope,beginRead,update,clear,renderAutoFib,clearAutoFib,beginPositionRead,setPositions,showPositions,readPositions,clearPositions,setPricePresentation:value=>{if(!engine)return {applied:false,reason:"UNAVAILABLE"};try{const presentation=engine.setPricePresentation(value);syncChartType();return {applied:true,presentation}}catch(error){syncChartType();return {applied:false,reason:"INVALID_PRESENTATION",error:String(error?.message||error)}}},readPricePresentation:()=>engine?.readPricePresentation?.()||null,setBrokerDealMarkers,readBrokerDealMarkers,readMarketLevels:()=>engine?.readMarketLevels?.()||{source:"NONE",asOfUtc:null,count:0,levels:{}},syncMarketLevels,setDrawingTool,syncMovingAverages,syncOscillators,readMovingAverage:id=>engine?.movingAverageOptions?.("preview-ma-"+id)||null,readOscillator:id=>oscillatorBridge?.read(id)||null,exportLayout,importLayout,readDrawing:id=>engine?.readDrawing?.(id)||null,drawingAnchorPosition:(id,anchor)=>engine?.drawingAnchorPosition?.(id,anchor)||null,drawingGeometry:id=>engine?.drawingGeometry?.(id)||null,fibonacciTimeZoneGuides:id=>engine?.fibonacciTimeZoneGuides?.(id)||null,readAutoFibonacci:()=>engine?.readAutoFibonacci?.()||null,inspect:()=>({active,scope:currentScope(),generation,status:status?.textContent||"",chartType:engine?.readPricePresentation?.().type||"candles",autoFibonacci:!!engine?.readAutoFibonacci?.(),priceAxisWidth:engine?.inspect?.().priceAxisWidth||0,customMovingAverageCount:indicatorBridge?.inspect?.().count||0,customOscillatorCount:oscillatorBridge?.inspect?.().count||0,indicatorTemplateCount:indicatorTemplateCount(),positionOverlayCount:readPositions().count,marketLevelCount:engine?.readMarketLevels?.().count||0,brokerDealMarkerCount:readBrokerDealMarkers().plotted,nativeDrawingCount:engine?.inspect?.().nativeDrawingCount||0,selectedDrawingIds:engine?.inspect?.().selectedDrawingIds||[],persistenceStatus:engine?.inspect?.().persistenceStatus||null,persistenceError:engine?.inspect?.().persistenceError||null,drawingTool,placement:engine?.drawingToolState?.()||null,positionsEnabled,dataWindowPinned:!!dataWindowPinned,brokerDealMarkers:readBrokerDealMarkers()})});
  function boot(){
    button=document.getElementById("chart-v5-preview-btn");panel=document.getElementById("chart-v5-preview-panel");
    host=document.getElementById("chart-v5-preview-host");status=document.getElementById("chart-v5-preview-status");dataWindow=document.getElementById("chart-v5-data-window");dataWindowPinButton=document.getElementById("chart-v5-data-window-pin");liveQuote=document.getElementById("chart-v5-live-quote");
    chartTypeSelect=document.getElementById("chart-v5-chart-type");
    if(host&&!chartTypeSelect){const label=document.createElement("label");label.className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-cyan-100";label.textContent="Charttyp";chartTypeSelect=document.createElement("select");chartTypeSelect.id="chart-v5-chart-type";chartTypeSelect.className="rounded border border-cyan-400/40 bg-slate-950 px-2 py-1 text-slate-100";for(const [value,text] of [["candles","Kerzen"],["bars","Balken"],["line","Linie"],["area","Fläche"],["heikin","Heikin Ashi"],["hollow","Hollow Candles"]]){const option=document.createElement("option");option.value=value;option.textContent=text;chartTypeSelect.append(option)}label.append(chartTypeSelect);host.before(label);chartTypeSelect.disabled=true;chartTypeSelect.addEventListener("change",()=>{try{engine?.setPricePresentation?.(chartTypeSelect.value);syncChartType()}catch(_){syncChartType();setStatus("Charttyp konnte nicht geändert werden")}})}
    title=document.getElementById("chart-v5-preview-title");
    autoFibButton=document.getElementById("chart-v5-auto-fib-btn");autoFibStatus=document.getElementById("chart-v5-auto-fib-status");
    trendButton=document.getElementById("chart-v5-trend-btn");rayButton=document.getElementById("chart-v5-ray-btn");priceButton=document.getElementById("chart-v5-price-btn");timeButton=document.getElementById("chart-v5-time-btn");rectButton=document.getElementById("chart-v5-rect-btn");ellipseButton=document.getElementById("chart-v5-ellipse-btn");fiboButton=document.getElementById("chart-v5-fibo-btn");fibFanButton=document.getElementById("chart-v5-fib-fan-btn");fibTrendButton=document.getElementById("chart-v5-fib-trend-btn");fibTimeButton=document.getElementById("chart-v5-fib-time-btn");measureButton=document.getElementById("chart-v5-measure-btn");channelButton=document.getElementById("chart-v5-channel-btn");pitchforkButton=document.getElementById("chart-v5-pitchfork-btn");riskRewardButton=document.getElementById("chart-v5-risk-reward-btn");textButton=document.getElementById("chart-v5-text-btn");textInput=document.getElementById("chart-v5-text-input");drawingStatus=document.getElementById("chart-v5-drawing-status");layoutButton=document.getElementById("chart-v5-layout-export-btn");
    profileSummary=document.querySelector("#chart-v5-profile-manager > summary");profileName=document.getElementById("chart-v5-profile-name");profileList=document.getElementById("chart-v5-profile-list");profileSaveButton=document.getElementById("chart-v5-profile-save");profileLoadButton=document.getElementById("chart-v5-profile-load");profileRenameButton=document.getElementById("chart-v5-profile-rename");profileCopyButton=document.getElementById("chart-v5-profile-copy");profileDeleteButton=document.getElementById("chart-v5-profile-delete");layoutResetButton=document.getElementById("chart-v5-layout-reset");profileStatus=document.getElementById("chart-v5-profile-status");
    installIndicatorTemplateControls();
    if(!button||!panel||!host||!status)return;
    window.addEventListener("chart-studio-averages-change",onAverageConfigsChanged);
    window.addEventListener("chart-studio-indicators-change",onOscillatorConfigsChanged);
    window.addEventListener("chart-studio-oscillators-change",onOscillatorConfigsChanged);
    host.addEventListener("chartstudio-v5-data-window",renderDataWindow);
    document.addEventListener("keyup",()=>setTimeout(refreshDrawingManager,0));
    for(const [id,action] of [["chart-v5-object-hide","hide"],["chart-v5-object-show","show"],["chart-v5-object-lock","lock"],["chart-v5-object-unlock","unlock"],["chart-v5-object-duplicate","duplicate"],["chart-v5-object-delete","delete"],["chart-v5-object-undo","undo"],["chart-v5-object-redo","redo"]])
      document.getElementById(id)?.addEventListener("click",()=>applyDrawingManagerAction(action));
    if(dataWindowPinButton){dataWindowPinButton.disabled=true;dataWindowPinButton.addEventListener("click",toggleDataWindowPin)}
    button.hidden=false;if(scope&&title)title.textContent=`Native v5 · ${scope.symbol} ${scope.timeframe} · ${scope.account}`;
    if(autoFibButton)autoFibButton.addEventListener("click",()=>{if(autoFibEnabled)clearAutoFib();else try{renderAutoFib()}catch(error){clearAutoFib();if(autoFibStatus)autoFibStatus.textContent="Auto-Fibonacci nicht verfügbar · "+String(error?.message||error).slice(0,120)}});
    if(trendButton)trendButton.addEventListener("click",()=>setDrawingTool(drawingTool==="TREND"?null:"TREND"));
    if(rayButton)rayButton.addEventListener("click",()=>setDrawingTool(drawingTool==="RAY"?null:"RAY"));
    if(priceButton)priceButton.addEventListener("click",()=>setDrawingTool(drawingTool==="PRICE"?null:"PRICE"));
    if(timeButton)timeButton.addEventListener("click",()=>setDrawingTool(drawingTool==="TIME"?null:"TIME"));
    if(rectButton)rectButton.addEventListener("click",()=>setDrawingTool(drawingTool==="RECT"?null:"RECT"));
    if(ellipseButton)ellipseButton.addEventListener("click",()=>setDrawingTool(drawingTool==="ELLIPSE"?null:"ELLIPSE"));
    if(fiboButton)fiboButton.addEventListener("click",()=>setDrawingTool(drawingTool==="FIBO"?null:"FIBO"));
    if(fibFanButton)fibFanButton.addEventListener("click",()=>setDrawingTool(drawingTool==="FIB_FAN"?null:"FIB_FAN"));if(fibTrendButton)fibTrendButton.addEventListener("click",()=>setDrawingTool(drawingTool==="FIB_TREND"?null:"FIB_TREND"));
    if(fibTimeButton)fibTimeButton.addEventListener("click",()=>setDrawingTool(drawingTool==="FIB_TIME"?null:"FIB_TIME"));
    if(measureButton)measureButton.addEventListener("click",()=>setDrawingTool(drawingTool==="MEASURE"?null:"MEASURE"));
    if(channelButton)channelButton.addEventListener("click",()=>setDrawingTool(drawingTool==="CHANNEL"?null:"CHANNEL"));
    if(pitchforkButton)pitchforkButton.addEventListener("click",()=>setDrawingTool(drawingTool==="PITCHFORK"?null:"PITCHFORK"));
    if(riskRewardButton)riskRewardButton.addEventListener("click",()=>setDrawingTool(drawingTool==="RISK_REWARD"?null:"RISK_REWARD"));
    if(textButton)textButton.addEventListener("click",()=>setDrawingTool(drawingTool==="TEXT"?null:"TEXT"));
    if(textInput)textInput.addEventListener("input",updateDrawingButtons);
    layoutImportButton=document.getElementById("chart-v5-layout-import-btn");layoutReplaceButton=document.getElementById("chart-v5-layout-replace-btn");layoutImportFile=document.getElementById("chart-v5-layout-import-file");
    if(profileList)profileList.addEventListener("change",()=>{const profile=profileById(readProfileStore(),selectedProfileId());if(profileName)profileName.value=profile?.name||"";updateProfileButtons()});
    if(profileSaveButton)profileSaveButton.addEventListener("click",()=>profileAction(saveProfile));
    if(profileLoadButton)profileLoadButton.addEventListener("click",()=>profileAction(loadProfile));
    if(profileRenameButton)profileRenameButton.addEventListener("click",()=>profileAction(renameProfile));
    if(profileCopyButton)profileCopyButton.addEventListener("click",()=>profileAction(copyProfile));
    if(profileDeleteButton)profileDeleteButton.addEventListener("click",()=>profileAction(deleteProfile));
    if(layoutResetButton)layoutResetButton.addEventListener("click",()=>profileAction(resetCurrentLayout));
    if(profileName)profileName.addEventListener("input",updateProfileButtons);
    refreshProfileList();refreshIndicatorTemplateList();updateProfileButtons();
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

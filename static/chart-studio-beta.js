/* 2EAs Chart Studio (BETA, read-only v4 adapter).
   Actual v5, broker-confirmed SL/TP writes and server drawing storage follow PLAN.
   No broker write calls or chart trading mutations in this module. */
(()=>{
"use strict";
const prefix="2eas:studio:beta:", kinds=["cursor","edit","horizontal","vertical","text","trend","rect","fib","ray","ruler","channel","plan","position-draft"];
const preferenceTools=["cursor","edit","horizontal","vertical","text","trend","rect","ray","channel","fib","ruler"];
const defaultShortcuts=Object.freeze({cursor:"v",edit:"e",horizontal:"h",vertical:"",text:"",trend:"t",rect:"r",ray:"",channel:"c",fib:"f",ruler:"m"});
function normalizeFavorites(raw){
 if(!Array.isArray(raw))return [];
 return [...new Set(raw.filter(value=>preferenceTools.includes(value)))].slice(0,preferenceTools.length);
}
function normalizeShortcuts(raw){
 if(!raw||typeof raw!=="object"||Array.isArray(raw))return {};
 const result={},used=new Set();
 for(const tool of preferenceTools){
  if(!Object.hasOwn(raw,tool))continue;
  const value=raw[tool];if(value===""){result[tool]="";continue}
  if(typeof value!=="string")continue;
  const key=value.trim().toLowerCase();if(!/^[a-z]$/.test(key)||used.has(key))continue;
  result[tool]=key;used.add(key);
 }
 return result;
}
function resolveShortcut(event,raw){
 if(!event||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||typeof event.key!=="string"||! /^[a-z]$/i.test(event.key))return null;
 const shortcuts={...defaultShortcuts},custom=normalizeShortcuts(raw);
 for(const [tool,key] of Object.entries(custom)){
  if(key)for(const other of preferenceTools)if(other!==tool&&shortcuts[other]===key)shortcuts[other]="";
  shortcuts[tool]=key;
 }
 const key=event.key.toLowerCase();return preferenceTools.find(tool=>shortcuts[tool]===key)||null;
}
const MAX_DRAWINGS=1000;
const MAX_EVIDENCE_ROWS=500;
const ratios=[0,.236,.382,.5,.618,.786,1];
let s=null,requestId=0,scenarioGeneration=0,portfolioGeneration=0,planTimer=null;
function createChartCoordinates({apiVersion,chart,series,scope}){
 if(![4,5].includes(apiVersion)||!chart||typeof chart.timeScale!=="function"||
  typeof chart.subscribeCrosshairMove!=="function"||typeof chart.unsubscribeCrosshairMove!=="function"||
  !series||typeof series.priceToCoordinate!=="function"||typeof series.coordinateToPrice!=="function")
  throw new TypeError("Unsupported chart coordinate API");
 const timeScale=chart.timeScale();
 for(const method of ["timeToCoordinate","coordinateToTime","getVisibleLogicalRange","setVisibleLogicalRange","subscribeVisibleLogicalRangeChange","unsubscribeVisibleLogicalRangeChange"])
  if(typeof timeScale?.[method]!=="function")throw new TypeError("Incomplete chart time-scale API");
 if(typeof series.coordinateToPrice!=="function")throw new TypeError("Incomplete chart price-series API");
 function normalizeScope(value){
  if(!value||typeof value!=="object"||Array.isArray(value))throw new TypeError("Invalid chart scope");
  const result={};for(const key of ["account","symbol","timeframe"]){
   if(typeof value[key]!=="string"||!value[key].trim()||value[key].length>64)throw new TypeError("Invalid chart scope");
   result[key]=value[key];
  }
  return Object.freeze(result);
 }
 function normalizeTime(value){
  if(Number.isSafeInteger(value)&&value>0)return value;
  if(!value||typeof value!=="object"||Array.isArray(value)||
   !Number.isInteger(value.year)||value.year<1||value.year>9999||
   !Number.isInteger(value.month)||value.month<1||value.month>12||
   !Number.isInteger(value.day)||value.day<1||value.day>31)throw new TypeError("Invalid chart time");
  const date=new Date(0);date.setUTCFullYear(value.year,value.month-1,value.day);date.setUTCHours(0,0,0,0);
  if(date.getUTCFullYear()!==value.year||date.getUTCMonth()+1!==value.month||date.getUTCDate()!==value.day)
   throw new TypeError("Invalid chart business day");
  return Math.floor(date.getTime()/1000);
 }
 function logicalRange(value){
  if(!value||typeof value!=="object"||!Number.isFinite(value.from)||!Number.isFinite(value.to)||value.from>=value.to)
   throw new TypeError("Invalid visible logical range");
  return {from:value.from,to:value.to};
 }
 function coordinate(method,value){
  if(!Number.isFinite(value))throw new TypeError("Invalid chart coordinate input");
  const result=method(value);return result==null?null:Number.isFinite(result)?result:null;
 }
 let activeScope=normalizeScope(scope),revision=0,destroyed=false;
 const subscriptions=new Set();
 function requireActive(){if(destroyed)throw new TypeError("Chart coordinate adapter is disposed")}
 function detach(subscription){
  if(!subscription.handler)return;
  if(subscription.kind==="crosshair")chart.unsubscribeCrosshairMove(subscription.handler);
  else timeScale.unsubscribeVisibleLogicalRangeChange(subscription.handler);
  subscription.handler=null;
 }
 function attach(subscription){
  const generation=revision,capturedScope=activeScope;
  subscription.handler=subscription.kind==="crosshair"?event=>{
   if(!subscription.active||destroyed||generation!==revision)return;
   try{
    subscription.listener({scope:capturedScope,time:event?.time==null?null:normalizeTime(event.time),
     logical:Number.isFinite(event?.logical)?event.logical:null,
     seriesData:event?.seriesData instanceof Map?event.seriesData:new Map()});
   }catch(_){/* Malformed crosshair events are ignored without reaching UI state. */}
  }:range=>{
   if(!subscription.active||destroyed||generation!==revision)return;
   let normalized=null;try{if(range!=null)normalized=logicalRange(range)}catch(_){return}
   subscription.listener({scope:capturedScope,range:normalized});
  };
  if(subscription.kind==="crosshair")chart.subscribeCrosshairMove(subscription.handler);
  else timeScale.subscribeVisibleLogicalRangeChange(subscription.handler);
 }
 function subscribe(kind,listener){
  requireActive();if(typeof listener!=="function")throw new TypeError("Invalid chart event listener");
  const subscription={kind,listener,handler:null,active:true};subscriptions.add(subscription);attach(subscription);
  let removed=false;return ()=>{
   if(removed)return;removed=true;subscription.active=false;detach(subscription);subscriptions.delete(subscription);
  };
 }
 return Object.freeze({apiVersion,
  timeToX(time){requireActive();let input;try{input=normalizeTime(time)}catch(_){throw new TypeError("Invalid chart time")}
   const nativeTime=typeof time==="number"?input:time,result=timeScale.timeToCoordinate(nativeTime);
   return result==null?null:Number.isFinite(result)?result:null},
  xToTime(x){requireActive();if(!Number.isFinite(x))throw new TypeError("Invalid chart coordinate input");
   const value=timeScale.coordinateToTime(x);return value==null?null:normalizeTime(value)},
  priceToY(price){requireActive();return coordinate(value=>series.priceToCoordinate(value),price)},
  yToPrice(y){requireActive();return coordinate(value=>series.coordinateToPrice(value),y)},
  visibleLogicalRange(){requireActive();const value=timeScale.getVisibleLogicalRange();return value==null?null:logicalRange(value)},
  setVisibleLogicalRange(value){requireActive();timeScale.setVisibleLogicalRange(logicalRange(value))},
  subscribeCrosshair(listener){return subscribe("crosshair",listener)},
  subscribeVisibleLogicalRange(listener){return subscribe("range",listener)},
  setScope(value){requireActive();const next=normalizeScope(value);
   if(next.account===activeScope.account&&next.symbol===activeScope.symbol&&next.timeframe===activeScope.timeframe)return;
   revision++;activeScope=next;for(const subscription of subscriptions){detach(subscription);attach(subscription)}
  },
  destroy(){if(destroyed)return;revision++;destroyed=true;for(const subscription of subscriptions){subscription.active=false;detach(subscription)}subscriptions.clear()}
 });
}
const json=v=>JSON.parse(JSON.stringify(v));
const get=(k,df)=>{try{const v=JSON.parse(localStorage.getItem(prefix+k));return v??df}catch(_){return df}};
const save=(k,v)=>{try{localStorage.setItem(prefix+k,JSON.stringify(v))}catch(_){}};
const optsDefault=()=>({ema20:true,ema50:true,ema200:true,sma20:false,sma50:false,bb:false,bbPeriod:20,bbStdDev:2,bbFill:true,positions:false});
function cleanOptions(raw){const out=optsDefault();if(!raw||typeof raw!=="object"||Array.isArray(raw))return out;
 for(const key of ["ema20","ema50","ema200","sma20","sma50","bb","bbFill","positions"])if(typeof raw[key]==="boolean")out[key]=raw[key];
 if(Number.isInteger(raw.bbPeriod)&&raw.bbPeriod>=2&&raw.bbPeriod<=300)out.bbPeriod=raw.bbPeriod;
 if(typeof raw.bbStdDev==="number"&&Number.isFinite(raw.bbStdDev)&&raw.bbStdDev>=.1&&raw.bbStdDev<=10)out.bbStdDev=raw.bbStdDev;return out}
const chartSymbol=()=>s?.symbol||"XAUUSD";
const drawKey=()=>s.account+":draw:"+chartSymbol(),optKey=()=>s.account+":opts:"+chartSymbol();
const favoritesKey=()=>s.account+":favorite-tools",shortcutsKey=()=>s.account+":tool-shortcuts";
function effectiveShortcuts(raw){
 const result={...defaultShortcuts},custom=normalizeShortcuts(raw);
 for(const [tool,key] of Object.entries(custom)){
  if(key)for(const other of preferenceTools)if(other!==tool&&result[other]===key)result[other]="";
  result[tool]=key;
 }
 return result;
}
function renderToolPreferences(){
 if(!s?.panel)return;
 const labels={cursor:"Navigation",edit:"Griffe bearbeiten",horizontal:"Preislinie",vertical:"Zeitlinie",text:"Text",trend:"Trendlinie",rect:"Zone",ray:"Strahl",channel:"Parallelkanal",fib:"Fibonacci",ruler:"Preis-/Zeitmessung"};
 const favorites=s.panel.querySelector("#cs-favorite-tools");
 if(favorites){favorites.replaceChildren();for(const tool of s.favorites){const button=document.createElement("button");button.type="button";button.dataset.tool=tool;button.textContent=labels[tool];favorites.append(button)}
  if(!s.favorites.length){const empty=document.createElement("span");empty.textContent="Noch keine Favoriten ausgewählt.";favorites.append(empty)}}
 for(const input of s.panel.querySelectorAll("[data-favorite-tool]"))input.checked=s.favorites.includes(input.dataset.favoriteTool);
 const bindings=s.panel.querySelector("#cs-tool-shortcuts");if(bindings){const effective=effectiveShortcuts(s.shortcuts);for(const input of bindings.querySelectorAll("[data-shortcut-tool]"))input.value=effective[input.dataset.shortcutTool]||""}
}
const profileKey=()=>s.account+":profiles:"+chartSymbol()+":"+(s.tf||"M15"),legacyProfileKey=()=>s.account+":profiles:XAUUSD",magnetKey=()=>s.account+":magnet:"+chartSymbol(),fibKey=()=>s.account+":fibLevels:"+chartSymbol();
const scenarioSnapshotsKey=(account,symbol=chartSymbol())=>account+":whatif-snapshots:"+symbol;
const validProfileScope=item=>item&&typeof item==="object"&&!Array.isArray(item)&&item.schemaVersion===1&&item.symbol===chartSymbol()&&item.timeframe===(s.tf||"M15");
function profiles(){
 const key=profileKey();let p=get(key,null);
 if(p===null&&chartSymbol()==="XAUUSD"&&s.tf==="M15"){
  const legacy=get(legacyProfileKey(),null);
  if(legacy&&typeof legacy==="object"&&!Array.isArray(legacy)){
   p={};for(const [name,item] of Object.entries(legacy))if(item&&typeof item==="object"&&!Array.isArray(item))p[name]={...item,schemaVersion:1,symbol:"XAUUSD",timeframe:"M15"};
   save(key,p);
  }
 }
 if(!p||typeof p!=="object"||Array.isArray(p))return{};
 return Object.fromEntries(Object.entries(p).filter(([,item])=>validProfileScope(item)))
}
function saveProfiles(value){const current=get(profileKey(),{}),preserved=current&&typeof current==="object"&&!Array.isArray(current)?Object.fromEntries(Object.entries(current).filter(([,item])=>!validProfileScope(item))):{};save(profileKey(),{...preserved,...value})}
function refreshProfiles(){
 if(!s)return;const sel=s.panel.querySelector("#cs-beta-profile");
 if(!sel)return;sel.replaceChildren();
 const empty=document.createElement("option");empty.value="";empty.textContent="Layout wählen";sel.append(empty);
 for(const name of Object.keys(profiles()).sort()){const option=document.createElement("option");option.value=name;option.textContent=name;sel.append(option)}
}
function saveProfile(){
 const name=window.prompt("Name des lokalen Chartlayouts (max. 40 Zeichen):","");
 if(!name)return;const trimmed=name.trim().slice(0,40);if(!trimmed)return;
 const all=profiles();if(Object.keys(all).length>=15&&!all[trimmed]){updateMessage("Maximal 15 lokale Layouts.");return}
 if(all[trimmed]&&!window.confirm("Gespeichertes Layout überschreiben?"))return;
 all[trimmed]={schemaVersion:1,symbol:chartSymbol(),timeframe:s.tf||"M15",draw:json(s.draw),opts:json(s.opts),
  indicators:window.ChartStudioIndicators?.settings()||null,
   movingAverages:window.ChartStudioAverages?.getConfigs()||[],
   chartAppearance:window.ChartStudioAppearance?.settings()||{},
   oscillatorInstances:window.ChartStudioOscillators?.settings()||[],
   chartType:window.ChartStudioChartTypes?.current()||"candles"};
 saveProfiles(all);refreshProfiles();s.panel.querySelector("#cs-beta-profile").value=trimmed;updateMessage("Layout '"+trimmed+"' lokal gesichert.");
}
function checkedProfileName(raw){
 if(typeof raw!=="string")return null;
 const name=raw.trim();return name&&name.length<=40&&!/\p{C}/u.test(name)?name:null;
}
function copyProfile(){
 const sourceName=s.panel.querySelector("#cs-beta-profile")?.value,all=profiles(),source=all[sourceName];
 if(!source){updateMessage("Zuerst ein gespeichertes Layout wählen.");return}
 const name=checkedProfileName(window.prompt("Name der Layoutkopie (max. 40 Zeichen):",sourceName+" Kopie"));
 if(!name)return;
 if(all[name]){updateMessage("Ein Layout mit diesem Namen existiert bereits.");return}
 if(Object.keys(all).length>=15){updateMessage("Maximal 15 lokale Layouts.");return}
 all[name]=json(source);saveProfiles(all);refreshProfiles();s.panel.querySelector("#cs-beta-profile").value=name;
 updateMessage("Layout '"+sourceName+"' als '"+name+"' kopiert.");
}
function renameProfile(){
 const select=s.panel.querySelector("#cs-beta-profile"),oldName=select?.value,all=profiles();
 if(!oldName||!all[oldName]){updateMessage("Zuerst ein gespeichertes Layout wählen.");return}
 const name=checkedProfileName(window.prompt("Neuer Layoutname (max. 40 Zeichen):",oldName));
 if(!name||name===oldName)return;
 if(all[name]){updateMessage("Ein Layout mit diesem Namen existiert bereits.");return}
 all[name]=all[oldName];delete all[oldName];saveProfiles(all);refreshProfiles();select.value=name;
 updateMessage("Layout in '"+name+"' umbenannt.");
}
function resetChart(){
 if(!window.confirm("Aktuelle Chartansicht auf Standard zurücksetzen? Gespeicherte Layouts bleiben erhalten."))return;
 setTool("cursor");
 snapshot();s.draw=[];s.selected=null;s.opts=optsDefault();persist();save(optKey(),s.opts);showOpts();updateSeries();
 window.ChartStudioIndicators?.applySettings({});
 window.ChartStudioAverages?.applySettings([]);
 window.ChartStudioAppearance?.applySettings({});
 window.ChartStudioOscillators?.applySettings([]);
 window.ChartStudioChartTypes?.applySettings("candles");
 requestDraw();updateMessage("Chartansicht auf Standard zurückgesetzt. Gespeicherte Layouts bleiben erhalten.");
}
function loadProfile(){
 const name=s.panel.querySelector("#cs-beta-profile")?.value;const item=profiles()[name];
 if(!item)return;if(item.schemaVersion!==1||item.symbol!==chartSymbol()||item.timeframe!==(s.tf||"M15")){updateMessage("Layout gehört zu einem anderen Symbol oder Timeframe.");return}snapshot();s.draw=safeDraw(item.draw);s.selected=null;
 s.opts=cleanOptions(item.opts);persist();save(optKey(),s.opts);showOpts();updateSeries();
 if(item.indicators)window.ChartStudioIndicators?.applySettings(item.indicators);
 window.ChartStudioAverages?.applySettings(item.movingAverages||[]);
 window.ChartStudioAppearance?.applySettings(item.chartAppearance||{});
 window.ChartStudioOscillators?.applySettings(item.oscillatorInstances||[]);
 window.ChartStudioChartTypes?.applySettings(item.chartType||"candles");
 requestDraw();
 updateMessage("Layout '"+name+"' geladen (nur lokal).");
}
function exportWorkspaceDocument(){
 if(!s)return null;
 return {schemaVersion:1,drawings:json(s.draw),options:json(s.opts),
  indicators:window.ChartStudioIndicators?.settings()||{},
   movingAverages:window.ChartStudioAverages?.getConfigs()||[],
  chartAppearance:window.ChartStudioAppearance?.settings()||{},
  oscillatorInstances:window.ChartStudioOscillators?.settings()||[],
  chartType:window.ChartStudioChartTypes?.current()||"candles",
  timeframe:s.tf||"M15"};
}
function importWorkspaceDocument(document){
 if(!s||!document||document.schemaVersion!==1||!Array.isArray(document.drawings))return false;
 if(document.symbol!==undefined?document.symbol!==chartSymbol():chartSymbol()!=="XAUUSD")return false;
 // Do not import scenarios, order tickets, account identity or executable text.
 const drawings=safeDraw(document.drawings);
 if(drawings.length!==document.drawings.length)return false;
 snapshot();s.draw=drawings;s.selected=null;s.opts=cleanOptions(document.options);
 persist();save(optKey(),s.opts);showOpts();updateSeries();
 window.ChartStudioIndicators?.applySettings(document.indicators||{});
 window.ChartStudioAverages?.applySettings(document.movingAverages||[]);
 window.ChartStudioAppearance?.applySettings(document.chartAppearance||{});
 window.ChartStudioOscillators?.applySettings(document.oscillatorInstances||[]);
 window.ChartStudioChartTypes?.applySettings(document.chartType||"candles");
 requestDraw();updateMessage("Serverlayout geladen. Brokerpositionen, What-if und aktiver Timeframe bleiben unverändert.");
 return true;
}
function deleteProfile(){
 const name=s.panel.querySelector("#cs-beta-profile")?.value;
 if(!name||!window.confirm("Layout '"+name+"' dauerhaft lokal löschen?"))return;
 const all=profiles();delete all[name];saveProfiles(all);refreshProfiles();updateMessage("Layout gelöscht.");
}
function updateMessage(x){if(s?.status)s.status.textContent=x}
function renderEvidence(){
 if(!s?.panel)return;const state=s.evidence,list=s.panel.querySelector("#cs-evidence-list"),status=s.panel.querySelector("#cs-evidence-status"),more=s.panel.querySelector("#cs-evidence-more");
 if(!list||!status||!more)return;list.replaceChildren();
 const meta=state.meta;
 status.textContent=state.loading?"Aufzeichnungen werden gelesen …":state.error|| (meta
  ? "Verfügbarkeit: "+meta.availability+" · Store: "+meta.storeState+" · Abdeckung: "+meta.coverage+" · Lücken seit Prozessstart: "+(meta.gaps?.knownLossSinceStart??0)+" · Historie außerhalb des Zeitraums: nicht bewertet"+(state.truncated?" · Anzeige auf "+MAX_EVIDENCE_ROWS+" begrenzt; Zeitraum verkleinern.":"")
  : "Keine Aufzeichnung abgefragt · Historie wird nicht rekonstruiert.");
 if(!state.loading&&!state.error&&meta?.availability==="NOT_RECORDED"&&state.rows.length===0){const empty=document.createElement("li");empty.textContent="NOT_RECORDED · Keine Aufzeichnung im gewählten Zeitraum; daraus folgt keine Aussage über ältere Zeiträume.";list.append(empty)}
 for(const record of state.rows){
  const p=record.payload||{},type=record.type||"UNKNOWN";let label;
  if(type==="DECISION")label=["DECISION",p.stage,p.outcome,p.symbol,p.timeframe,p.decisionTimeUtc,p.strategyId].filter(Boolean).join(" · ");
  else if(type==="LIFECYCLE")label=["LIFECYCLE",p.eventType,p.dealEntry&&("Deal "+p.dealEntry),p.dealSide,p.positionIdentifier&&("Position "+p.positionIdentifier),p.asOfUtc,p.price&&("@ "+p.price),p.volume&&("Vol "+p.volume),p.source,p.dataQuality].filter(Boolean).join(" · ");
  else if(type==="SNAPSHOT")label=["SNAPSHOT",p.captureType,p.positionIdentifier,p.asOfUtc,p.renderStatus].filter(Boolean).join(" · ");
  else label=type+" · "+record.id;
  const li=document.createElement("li"),details=document.createElement("details"),summary=document.createElement("summary"),pre=document.createElement("pre");
  summary.textContent=label;pre.textContent=JSON.stringify(record,null,2);details.append(summary,pre);li.append(details);list.append(li);
 }
 more.hidden=!state.cursor;more.disabled=state.loading;
}
function clearEvidence(){if(!s?.evidence)return;s.evidence.generation++;s.evidence={rows:[],cursor:null,query:null,meta:null,loading:false,error:"",truncated:false,generation:s.evidence.generation};renderEvidence()}
async function loadEvidence(morePage=false){
 if(!s?.evidence||s.evidence.loading)return;const selector=s.panel.querySelector("#cs-evidence-kind"),kind=selector?.value;
 const paths={DECISION:"decisions",LIFECYCLE:"lifecycle",SNAPSHOT:"snapshots"};if(!paths[kind])return;
 const account=s.account,generation=s.evidence.generation;
 if(!morePage){const days=Number(s.panel.querySelector("#cs-evidence-days")?.value)||30,to=new Date(),from=new Date(to.getTime()-days*86400000);s.evidence.rows=[];s.evidence.cursor=null;s.evidence.meta=null;s.evidence.truncated=false;s.evidence.query={account,kind,fromUtc:from.toISOString(),toUtc:to.toISOString()};s.evidence.error=""}
 const query=s.evidence.query;if(!query||query.account!==account||query.kind!==kind){clearEvidence();return}
 const params=new URLSearchParams({account,fromUtc:query.fromUtc,toUtc:query.toUtc,limit:"100"});
 if(kind!=="LIFECYCLE")params.set("symbol",chartSymbol());if(morePage&&s.evidence.cursor)params.set("cursor",s.evidence.cursor);
 const url=(window.location.pathname.startsWith("/stt")?"/stt":"")+"/api/chart/v1/"+paths[kind]+"?"+params.toString();
 s.evidence.loading=true;renderEvidence();
 try{
  let response;if(window.DashboardRuntime?.request)response=await window.DashboardRuntime.request(url,{method:"GET",cache:"no-store"},10000,false);
  else{const raw=await fetch(url,{method:"GET",cache:"no-store",credentials:"same-origin"});const body=await raw.json();response={ok:raw.ok,status:raw.status,json:async()=>body}}
  const data=await response.json();if(!response.ok)throw Error(data?.detail?.code||data?.detail||("HTTP "+response.status));
  if(!s?.evidence||s.account!==account||s.evidence.generation!==generation)return;
  if(data.accountId!==account||data.canExecute!==false||!Array.isArray(data.records))throw Error("Antwort ist keinem gültigen Read-Scope zugeordnet.");
  const seen=new Set(s.evidence.rows.map(row=>row.type+":"+row.id+":"+row.dataRevision));
  for(const row of data.records){const key=row?.type+":"+row?.id+":"+row?.dataRevision;if(!seen.has(key)&&s.evidence.rows.length<MAX_EVIDENCE_ROWS){s.evidence.rows.push(row);seen.add(key)}}
  s.evidence.meta=data;s.evidence.truncated=Boolean(data.nextCursor)&&s.evidence.rows.length>=MAX_EVIDENCE_ROWS;s.evidence.cursor=s.evidence.truncated?null:(data.nextCursor||null);s.evidence.error="";
 }catch(error){if(s?.evidence&&s.account===account&&s.evidence.generation===generation)s.evidence.error="Aufzeichnungen nicht verfügbar · "+String(error?.message||"Lesefehler")}
 finally{if(s?.evidence&&s.account===account&&s.evidence.generation===generation){s.evidence.loading=false;renderEvidence()}}
}
function validSavedPortfolioContext(context,account){
 if(context?.schemaVersion!==1||context.account!==account)return false;
 if(context.state==="UNAVAILABLE")return Object.keys(context).every(key=>["schemaVersion","account","state","reason"].includes(key))&&context.reason==="PORTFOLIO_NOT_CURRENT";
 const allowed=["schemaVersion","account","state","capturedAtUtc","source","canExecute","positionCount","currency","margin","stopRisk","symbols","correlation"];
 const onlyKeys=(value,keys)=>value&&typeof value==="object"&&!Array.isArray(value)&&Object.keys(value).every(key=>keys.includes(key));
 const nestedKeys=context.state==="AVAILABLE"&&onlyKeys(context.margin,["state","used","free","equity","balance","currency","scope"])&&
  onlyKeys(context.stopRisk,context.stopRisk?.state==="AVAILABLE"?["state","lossAtStops","currency","source"]:["state","reason"])&&
  Array.isArray(context.symbols)&&context.symbols.every(row=>onlyKeys(row,["symbol","buyLots","sellLots","netLots","floatingPnl","swap","currency"]))&&
  (context.correlation?.state==="AVAILABLE"?onlyKeys(context.correlation,["state","timeframe","source","scenarioSymbol","symbols","pairs"])&&Array.isArray(context.correlation.pairs)&&context.correlation.pairs.every(pair=>onlyKeys(pair,["symbols","coefficient","observations"])):
   onlyKeys(context.correlation,["state","reason","scenarioSymbol","symbols"]));
 return context.state==="AVAILABLE"&&Object.keys(context).every(key=>allowed.includes(key))&&
  typeof context.capturedAtUtc==="string"&&context.capturedAtUtc.length<=32&&Number.isFinite(Date.parse(context.capturedAtUtc))&&
  new Date(context.capturedAtUtc).toISOString()===context.capturedAtUtc&&nestedKeys&&validPortfolio(context,account);
}
function validSavedPreview(item,account,symbol=chartSymbol()){
 const resultSymbolMatches=item?.result?.symbol===symbol||(symbol==="XAUUSD"&&item?.schemaVersion===1&&item?.result?.symbol===undefined);
 const preview=item&&item.account===account&&item.symbol===symbol&&item.request?.account===account&&item.request?.symbol===symbol&&item.result?.account===account&&resultSymbolMatches&&item.result?.canExecute===false;
 return Boolean(preview&&((symbol==="XAUUSD"&&item.schemaVersion===1)||
  (symbol==="XAUUSD"&&item.schemaVersion===2&&validSavedPortfolioContext(item.portfolioContext,account))||
  (item.schemaVersion===3&&validSavedPortfolioContext(item.portfolioContext,account))));
}
function portfolioContextForSnapshot(account){
 if(!s||s.account!==account||!s.portfolio||s.portfolio.account!==account||!s.portfolioCapturedAtUtc||!validPortfolio(s.portfolio,account))
  return {schemaVersion:1,account,state:"UNAVAILABLE",reason:"PORTFOLIO_NOT_CURRENT"};
 const data=s.portfolio;
 const margin={state:data.margin.state,used:data.margin.used,free:data.margin.free,equity:data.margin.equity,balance:data.margin.balance,currency:data.margin.currency,scope:data.margin.scope};
 const stopRisk=data.stopRisk.state==="AVAILABLE"?
  {state:data.stopRisk.state,lossAtStops:data.stopRisk.lossAtStops,currency:data.stopRisk.currency,source:data.stopRisk.source}:
  {state:data.stopRisk.state,reason:data.stopRisk.reason};
 const symbols=data.symbols.map(row=>({symbol:row.symbol,buyLots:row.buyLots,sellLots:row.sellLots,netLots:row.netLots,floatingPnl:row.floatingPnl,swap:row.swap,currency:row.currency}));
 const correlation=data.correlation.state==="AVAILABLE"?
  {state:data.correlation.state,timeframe:data.correlation.timeframe,source:data.correlation.source,scenarioSymbol:data.correlation.scenarioSymbol,
   symbols:[...data.correlation.symbols],pairs:data.correlation.pairs.map(pair=>({symbols:[...pair.symbols],coefficient:pair.coefficient,observations:pair.observations}))}:
  {state:data.correlation.state,reason:data.correlation.reason,scenarioSymbol:data.correlation.scenarioSymbol,symbols:[...data.correlation.symbols]};
 return {schemaVersion:1,account,state:"AVAILABLE",capturedAtUtc:s.portfolioCapturedAtUtc,source:data.source,canExecute:data.canExecute,
  positionCount:data.positionCount,currency:data.currency,margin,stopRisk,symbols,correlation};
}
function savedPortfolioSummary(item){
 if(item.schemaVersion===1)return "Portfolio/Korrelation UNAVAILABLE · nicht im Schema v1 erfasst";
 const context=item.portfolioContext;
 if(context.state!=="AVAILABLE")return "Portfolio/Korrelation UNAVAILABLE · "+context.reason;
 const stop=context.stopRisk.state==="AVAILABLE"?context.stopRisk.lossAtStops+" "+context.currency:"UNAVAILABLE · "+context.stopRisk.reason;
 const pairs=context.correlation.state==="AVAILABLE"?context.correlation.pairs.filter(pair=>pair.symbols.includes(context.correlation.scenarioSymbol)).map(pair=>pair.symbols.join(" ↔ ")+" "+pair.coefficient+" · n="+pair.observations).join("; ")||"keine Paare":"UNAVAILABLE · "+context.correlation.reason;
 const exposure=context.symbols.slice(0,12).map(row=>row.symbol+" L/S "+row.buyLots+"/"+row.sellLots+" Lots, Netto "+row.netLots+" · P/L "+row.floatingPnl+" "+context.currency).join("; ")+(context.symbols.length>12?"; +"+(context.symbols.length-12)+" weitere Symbole":"");
 return "Portfolio "+context.positionCount+" Positionen · Exposure "+(exposure||"keine offenen Positionen")+" · Stoprisiko "+stop+" · Freie Margin "+context.margin.free+" "+context.currency+" · Korrelation "+pairs+" · gelesen "+context.capturedAtUtc;
}
function renderScenarioSnapshots(){
 if(!s)return;
 const account=s.account,label=account==="goldm15"?"GoldM15":account,host=s.panel.querySelector("#cs-scenario-ab");if(!host)return;
 const symbol=chartSymbol(),stored=get(scenarioSnapshotsKey(account,symbol),{}),snapshots={A:null,B:null};
 for(const slot of ["A","B"])if(validSavedPreview(stored?.[slot],account,symbol))snapshots[slot]=stored[slot];
 host.replaceChildren();let count=0;
 for(const slot of ["A","B"]){const item=snapshots[slot];if(!item)continue;count++;
  const section=document.createElement("section"),title=document.createElement("h4"),detail=document.createElement("p");
  const mode=item.result.positionSizing?.mode||"UNKNOWN",budget=item.result.positionSizing?.riskBudget;
  title.textContent=""+slot+" · "+(budget==null?mode:"Budget "+budget+" "+(item.result.pnlAtSl?.currency||""));
  const net=item.result.netEstimate,costs=item.result.estimatedCosts,currency=costs?.currency||item.result.pnlAtSl?.currency||"";
  const dd=item.result.dailyDrawdownProjection;
  const ddText=dd?.state==="AVAILABLE"?" · Tages-DD-Schätzung Rest "+dd.remainingToLimit+"/Limit "+dd.dailyLimit+" "+dd.currency+" · Quote "+dd.quoteTimeUtc+" · Guard UNKNOWN": " · Tages-DD UNAVAILABLE · Guard UNKNOWN";
  detail.textContent="Lots "+(item.result.positionSizing?.volumeLots??"UNKNOWN")+" · GROSS SL/TP "+(item.result.pnlAtSl?.amount??"UNKNOWN")+" / "+(item.result.pnlAtTp?.amount??"UNKNOWN")+" · NETTO-Annahme SL/TP "+(net?.pnlAtSl?.amount??"UNKNOWN")+" / "+(net?.pnlAtTp?.amount??"UNKNOWN")+" · R:R "+(item.result.riskRewardRatio??"UNKNOWN")+" / Netto "+(net?.riskRewardRatio??"UNKNOWN")+" · Gebührannahme "+(costs?.feesPerLot??"UNKNOWN")+" "+currency+"/Lot; Slippage "+(costs?.slippageTicks??"UNKNOWN")+" Ticks · Margin "+(item.result.margin?.amount??"UNKNOWN")+" "+(item.result.margin?.currency||"")+ddText+" · "+savedPortfolioSummary(item)+" · Preview "+item.savedAtUtc;
  section.append(title,detail);host.append(section);
 }
 if(!count){const empty=document.createElement("p");empty.textContent="Keine A/B-Snapshots für "+label+" / "+symbol+". Erst eine erfolgreiche Broker-Vorschau speichern.";host.append(empty)}
 const exportButton=s.panel.querySelector("#cs-scenario-export");if(exportButton)exportButton.disabled=count===0;
}
function saveScenarioSnapshot(slot){
 const status=s?.panel.querySelector("#cs-scenario-ab-status"),latest=s?.lastScenarioPreview;
 const symbol=chartSymbol();
 if(!latest||latest.account!==s.account||latest.symbol!==symbol||latest.result?.canExecute!==false){if(status)status.textContent="Bitte erst eine erfolgreiche Broker-Vorschau für dieses Konto und Symbol berechnen.";return}
 const key=scenarioSnapshotsKey(s.account,symbol),stored=get(key,{}),snapshots={A:null,B:null};
 for(const name of ["A","B"])if(validSavedPreview(stored?.[name],s.account,symbol))snapshots[name]=stored[name];
 snapshots[slot]={schemaVersion:symbol==="XAUUSD"?2:3,account:s.account,symbol,savedAtUtc:latest.savedAtUtc,request:latest.request,result:latest.result,portfolioContext:portfolioContextForSnapshot(s.account)};
 try{localStorage.setItem(prefix+key,JSON.stringify(snapshots));if(status)status.textContent=slot+" gespeichert · "+s.account+" · Nur lokaler Snapshot, keine Order.";renderScenarioSnapshots();}
 catch(_){if(status)status.textContent="Lokales Speichern fehlgeschlagen.";}
}
function exportScenarioSnapshots(){
 if(!s)return;
 const account=s.account,symbol=chartSymbol(),key=scenarioSnapshotsKey(account,symbol),stored=get(key,{}),snapshots={};
 for(const slot of ["A","B"])if(validSavedPreview(stored?.[slot],account,symbol))snapshots[slot]=stored[slot];
 if(!Object.keys(snapshots).length)return;
 const blob=new Blob([JSON.stringify({schemaVersion:symbol==="XAUUSD"?2:3,account,symbol,exportedAtUtc:new Date().toISOString(),snapshots},null,2)],{type:"application/json"});
 const url=URL.createObjectURL(blob),anchor=document.createElement("a");
 anchor.href=url;anchor.download="chartstudio-whatif-"+account.replace(/[^A-Za-z0-9_-]/g,"_")+ (symbol==="XAUUSD"?"":"-"+symbol.replace(/[^A-Za-z0-9_-]/g,"_"))+".json";anchor.click();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function validPortfolio(value,account){
 const amount=(v,signed=false)=>typeof v==="string"&&v.length<=32&&
  (signed?/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]{1,12})?$/:/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,12})?$/).test(v)&&v!=="-0";
 const correlation=value?.correlation,correlationNames=new Set(correlation?.symbols||[]);
 const validMarketSymbol=name=>typeof name==="string"&&/^[A-Za-z0-9](?:[A-Za-z0-9_.# /+:-]{0,62}[A-Za-z0-9_.#/+:-])?$/.test(name);
 const correlationValid=correlation?.state==="AVAILABLE"?
  correlation.timeframe==="H1"&&correlation.source==="MT5_COMPLETED_BARS"&&validMarketSymbol(correlation.scenarioSymbol)&&correlationNames.has(correlation.scenarioSymbol)&&
  Array.isArray(correlation.symbols)&&correlation.symbols.length>=2&&correlation.symbols.length<=12&&correlation.symbols.every(validMarketSymbol)&&new Set(correlation.symbols).size===correlation.symbols.length&&
  Array.isArray(correlation.pairs)&&correlation.pairs.length===correlation.symbols.length*(correlation.symbols.length-1)/2&&correlation.pairs.length<=66&&
  new Set(correlation.pairs.map(pair=>Array.isArray(pair?.symbols)?pair.symbols.join("\u0000"):"")).size===correlation.pairs.length&&
  correlation.pairs.every(pair=>Array.isArray(pair?.symbols)&&pair.symbols.length===2&&pair.symbols[0]<pair.symbols[1]&&correlationNames.has(pair.symbols[0])&&correlationNames.has(pair.symbols[1])&&
   typeof pair.coefficient==="string"&&pair.coefficient!=="-0"&&/^-?(?:0|1)(?:\.\d{1,6})?$/.test(pair.coefficient)&&Number(pair.coefficient)>=-1&&Number(pair.coefficient)<=1&&
   Number.isInteger(pair.observations)&&pair.observations>=60&&pair.observations<=256):
  correlation?.state==="UNAVAILABLE"&&validMarketSymbol(correlation.scenarioSymbol)&&Array.isArray(correlation.symbols)&&correlation.symbols.length<=12&&correlation.symbols.every(validMarketSymbol)&&
  (correlation.reason==="SYMBOL_LIMIT_EXCEEDED"?correlation.symbols.length===0:correlation.symbols.includes(correlation.scenarioSymbol))&&new Set(correlation.symbols).size===correlation.symbols.length&&
  ["NO_SYMBOL_PAIRS","SYMBOL_LIMIT_EXCEEDED","HISTORY_UNAVAILABLE","INSUFFICIENT_ALIGNED_HISTORY","INVALID_CORRELATION_SERIES"].includes(correlation.reason);
 return value&&value.account===account&&value.source==="MT5_VERIFIED"&&value.canExecute===false&&
  Number.isInteger(value.positionCount)&&value.positionCount>=0&&value.positionCount<=500&&
  /^[A-Z]{3,12}$/.test(value.currency||"")&&Array.isArray(value.symbols)&&value.symbols.length<=500&&
  value.symbols.length<=value.positionCount&&new Set(value.symbols.map(row=>row?.symbol)).size===value.symbols.length&&
  value.symbols.every(row=>row&&typeof row.symbol==="string"&&/^[A-Za-z0-9](?:[A-Za-z0-9_.# /+:-]{0,62}[A-Za-z0-9_.#/+:-])?$/.test(row.symbol)&&
   amount(row.buyLots)&&amount(row.sellLots)&&amount(row.netLots,true)&&amount(row.floatingPnl,true)&&amount(row.swap,true)&&
   row.currency===value.currency)&&value.margin?.state==="AVAILABLE"&&value.margin.scope==="ACCOUNT"&&
  amount(value.margin.used)&&amount(value.margin.free,true)&&amount(value.margin.equity,true)&&amount(value.margin.balance,true)&&
  value.margin.currency===value.currency&&
  (value.stopRisk?.state==="AVAILABLE"?amount(value.stopRisk.lossAtStops)&&value.stopRisk.currency===value.currency&&value.stopRisk.source==="MT5_ORDER_CALC_PROFIT":
  value.stopRisk?.state==="UNAVAILABLE"&&["MISSING_STOP","BROKER_CALCULATION_UNAVAILABLE"].includes(value.stopRisk.reason))&&correlationValid;
}
function renderPortfolio(){
 if(!s)return;
 const host=s.panel.querySelector("#cs-portfolio-summary");if(!host)return;
 host.replaceChildren();const data=s.portfolio;
 const status=document.createElement("p");status.setAttribute("role","status");status.setAttribute("aria-live","polite");
 if(!data){status.textContent=s.portfolioLoading?"Portfolio wird aus MT5 geladen …":s.portfolioError||"Portfolio noch nicht verfügbar.";host.append(status);return}
 status.textContent=data.account+" · "+data.positionCount+" offene Positionen · "+data.currency+" · nur lesend";host.append(status);
 const risk=document.createElement("p");
 risk.textContent="Account-Margin gebraucht/frei "+data.margin.used+" / "+data.margin.free+" "+data.currency+
  " · Equity "+data.margin.equity+" · Stop-Risiko "+(data.stopRisk.state==="AVAILABLE"?data.stopRisk.lossAtStops+" "+data.currency:"UNAVAILABLE · "+data.stopRisk.reason);
 host.append(risk);
 for(const row of data.symbols){
  const line=document.createElement("p");
  line.textContent=row.symbol+" · Long "+row.buyLots+" · Short "+row.sellLots+" · Netto "+row.netLots+
   " Lots · P/L "+row.floatingPnl+" · Swap "+row.swap+" "+row.currency;host.append(line);
 }
 const correlation=document.createElement("p");
 correlation.textContent=data.correlation.state==="AVAILABLE"?
  "What-if "+data.correlation.scenarioSymbol+" · H1-Korrelationen (abgeschlossene MT5-Bars; deskriptiv, kein Hedge-Kredit): "+data.correlation.pairs.filter(pair=>pair.symbols.includes(data.correlation.scenarioSymbol)).map(pair=>pair.symbols.join(" ↔ ")+" "+pair.coefficient+" · n="+pair.observations).join("; "):
  "Korrelation zu What-if "+data.correlation.scenarioSymbol+" UNAVAILABLE · "+data.correlation.reason+".";host.append(correlation);
}
function renderPortfolioImpact(preview){
 if(!s)return;
 const host=s.panel.querySelector("#cs-scenario-portfolio-impact");if(!host)return;
 const portfolio=s.portfolio,result=preview?.result;
 if(!portfolio||!result||preview.account!==s.account||preview.symbol!==chartSymbol()||preview.request?.symbol!==chartSymbol()||result.symbol!==chartSymbol()||portfolio.account!==s.account||portfolio.correlation?.scenarioSymbol!==chartSymbol()){host.textContent="Portfolio-Gesamtrisiko UNAVAILABLE · Portfolio und Vorschau für dasselbe Konto und Symbol erforderlich.";return}
 const summary=[];
 if(portfolio.stopRisk?.state==="AVAILABLE"&&portfolio.currency===result.pnlAtSl?.currency){
  const current=Number(portfolio.stopRisk.lossAtStops),proposed=Math.max(0,-Number(result.pnlAtSl?.amount));
  if(Number.isFinite(current)&&Number.isFinite(proposed))summary.push("Portfolio-Stop-Risiko inkl. neuem Trade: "+String(Number((current+proposed).toPrecision(12)))+" "+portfolio.currency+" · Brutto additiv; keine Korrelation oder Hedging-Anrechnung.");
  else summary.push("Portfolio-Stop-Risiko UNAVAILABLE · Brokerwerte ungültig.");
 }else summary.push("Portfolio-Stop-Risiko UNAVAILABLE · "+(portfolio.stopRisk?.reason||"gemeinsame Kontowährung fehlt"));
 const request=preview.request||{},symbol=request.symbol,side=request.side,volume=Number(result.positionSizing?.volumeLots);
 const row=portfolio.symbols.find(item=>item.symbol===symbol),currentLong=Number(row?.buyLots||0),currentShort=Number(row?.sellLots||0);
 if(typeof symbol==="string"&&(side==="BUY"||side==="SELL")&&Number.isFinite(volume)&&volume>0&&Number.isFinite(currentLong)&&Number.isFinite(currentShort)){
  const long=currentLong+(side==="BUY"?volume:0),short=currentShort+(side==="SELL"?volume:0),net=long-short;
  const format=value=>String(Number(value.toPrecision(12)));
  summary.push("Projektion "+symbol+" · Long "+format(long)+" · Short "+format(short)+" · Netto "+format(net)+" Lots (nur Lots, kein Notional).");
  const correlation=portfolio.correlation;
  if(correlation?.state==="AVAILABLE"&&correlation.scenarioSymbol===symbol){
   const pairs=correlation.pairs.filter(pair=>pair.symbols.includes(symbol));
   summary.push("Korrelation deskriptiv · "+(pairs.length?pairs.map(pair=>pair.symbols.join(" ↔ ")+" "+pair.coefficient+" · n="+pair.observations).join("; "):"keine Paare")+"; kein Hedge-Kredit.");
  }else summary.push("Korrelation deskriptiv UNAVAILABLE · "+(correlation?.reason||"kein passender Symbolkontext")+".");
 }else summary.push("Symbol-Exposure-Projektion UNAVAILABLE · Brokerpreview oder Positionsgröße fehlt.");
 host.textContent=summary.join(" ");
}
async function loadPortfolio(account,symbol=chartSymbol()){
 const nonce=++portfolioGeneration;s.portfolio=null;s.portfolioCapturedAtUtc=null;s.portfolioError="";s.portfolioLoading=true;renderPortfolio();
 try{
  const response=await fetch((window.location.pathname.startsWith("/stt")?"/stt":"")+
   "/api/chart/v1/portfolio?account="+encodeURIComponent(account)+"&scenarioSymbol="+encodeURIComponent(symbol),{cache:"no-store"});
  const data=await response.json();
  if(nonce!==portfolioGeneration||account!==s?.account||symbol!==chartSymbol())return;
  if(!response.ok||!validPortfolio(data,account)||data.correlation?.scenarioSymbol!==symbol)throw Error("MT5-Portfolio ungültig oder nicht verfügbar.");
  s.portfolio=json(data);s.portfolioCapturedAtUtc=new Date().toISOString();s.portfolioError="";
 }catch(error){
  if(nonce!==portfolioGeneration||account!==s?.account||symbol!==chartSymbol())return;
  s.portfolio=null;s.portfolioError="Portfolio UNAVAILABLE · "+(error?.message||"Lesefehler");
 }finally{
  if(nonce===portfolioGeneration&&account===s?.account&&symbol===chartSymbol()){s.portfolioLoading=false;renderPortfolio();renderPortfolioImpact(s.lastScenarioPreview)}
 }
}
function sma(c,n){const out=[];let sum=0;for(let i=0;i<c.length;i++){sum+=Number(c[i].close);if(i>=n)sum-=Number(c[i-n].close);if(i>=n-1)out.push({time:c[i].time,value:sum/n})}return out}
function bollinger(c,n=20,k=2){const hi=[],midline=[],lo=[];if(!Number.isInteger(n)||n<1||!Number.isFinite(k)||k<0)return {upper:hi,middle:midline,lower:lo};let sum=0,sq=0;for(let i=0;i<c.length;i++){let v=Number(c[i].close);sum+=v;sq+=v*v;if(i>=n){v=Number(c[i-n].close);sum-=v;sq-=v*v}if(i>=n-1){const mid=sum/n,sd=Math.sqrt(Math.max(0,sq/n-mid*mid));midline.push({time:c[i].time,value:mid});hi.push({time:c[i].time,value:mid+k*sd});lo.push({time:c[i].time,value:mid-k*sd})}}return {upper:hi,middle:midline,lower:lo}}
function safeDraw(list){
 if(!Array.isArray(list))return [];
 const reserved=new Set(list.filter(o=>o&&typeof o.id==="string"&&/^[A-Za-z0-9_-]{1,32}$/.test(o.id)).map(o=>o.id));
 const used=new Set(),allowed=new Set(["kind","anchors","id","label","visible","locked","levels"]);
 let serial=1;const result=[];
 for(const o of list.slice(0,MAX_DRAWINGS)){
  if(!window.ChartStudioDrawingGeometry?.validDrawing(o)||
   Object.keys(o).some(k=>!allowed.has(k)))continue;
  if(o.id!==undefined&&(typeof o.id!=="string"||
   !/^[A-Za-z0-9_-]{1,32}$/.test(o.id)||used.has(o.id)))continue;
  if(o.label!==undefined&&(typeof o.label!=="string"||o.label.length>40||
   /[\u0000-\u001f]/.test(o.label)))continue;
  if(o.kind==="text"&&(!o.label||!o.label.trim()))continue;
  if(o.visible!==undefined&&typeof o.visible!=="boolean")continue;
  if(o.locked!==undefined&&typeof o.locked!=="boolean")continue;
  if(o.levels!==undefined&&o.kind!=="fib")continue;
  const fibLevels=o.kind==="fib"&&o.levels!==undefined?
   window.ChartStudioFib?.normalizeLevels(o.levels):null;
  if(o.levels!==undefined&&!fibLevels)continue;
  let id=o.id;
  if(!id){do{id="obj_"+serial++}while(reserved.has(id)||used.has(id))}
  used.add(id);
  result.push({kind:o.kind,anchors:o.anchors.map(p=>({time:p.time,price:p.price})),
   id,label:o.label||"",visible:o.visible!==false,locked:o.locked===true,
   ...(fibLevels?{levels:fibLevels}:{})});
 }
 return result;
}
function snapshot(){s.undo.push(json(s.draw));if(s.undo.length>50)s.undo.shift();s.redo=[]}
function persist(){s.draw=safeDraw(s.draw);save(drawKey(),s.draw);window.ChartStudioObjectManager?.render();requestDraw()}
function undo(){if(!s?.undo.length)return;s.redo.push(json(s.draw));s.draw=s.undo.pop();s.selected=null;persist()}
function redo(){if(!s?.redo.length)return;s.undo.push(json(s.draw));s.draw=s.redo.pop();s.selected=null;persist()}
function setTool(kind){
 if(!s||!kinds.includes(kind))return;
 if(s.tool==="plan"&&kind!=="plan")cancelPlanPreview();
 s.tool=kind;s.begin=null;s.preview=null;s.pending=[];s.drag=null;s.selected=null;
 s.canvas.style.pointerEvents=kind==="cursor"?"none":"auto";
 s.canvas.style.cursor=kind==="edit"?"grab":kind==="plan"||kind==="position-draft"?"ns-resize":"crosshair";
 s.panel.querySelector('[data-cmd="drag-plan"]')?.setAttribute("aria-pressed",String(kind==="plan"));
 s.panel.querySelectorAll("[data-tool]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.tool===kind)));
 window.ChartStudioObjectManager?.render();
 updateMessage(kind==="cursor"?"Navigation":kind==="edit"?"Griff anklicken und ziehen":kind==="horizontal"?"Preislinie: einmal klicken":kind==="vertical"?"Zeitlinie: einmal klicken":kind==="plan"?"PLAN: SL oder TP am Chart ziehen · nur Broker-Vorschau":kind==="position-draft"?"Positionsentwurf: SL- oder TP-Griff ziehen · Vorschau bleibt read-only":"Zwei Anker setzen · Esc abbrechen");
 requestDraw();
}
function showOpts(){
 s.panel.querySelectorAll("[data-opt]").forEach(b=>b.setAttribute("aria-pressed",String(!!s.opts[b.dataset.opt])));
 const period=s.panel.querySelector("[data-bb-setting='bbPeriod']"),deviation=s.panel.querySelector("[data-bb-setting='bbStdDev']"),fill=s.panel.querySelector("[data-bb-setting='bbFill']");
 if(period)period.value=String(s.opts.bbPeriod);if(deviation)deviation.value=String(s.opts.bbStdDev);if(fill)fill.checked=s.opts.bbFill;
}
function updateSeries(){
 if(!s)return;
 s.emas.forEach((ser,i)=>{if(ser)ser.applyOptions({visible:!!s.opts[["ema20","ema50","ema200"][i]]})});
 if(!s.candles.length)return;
 const conf=[["sma20","SMA20","#76e9a8"],["sma50","SMA50","#ffb675"],["bbUpper","BB+","#b9a1ff"],["bbMiddle","BB Mitte","#9f8be0"],["bbLower","BB-","#b9a1ff"]];
 for(const [id,name,color] of conf)if(!s.extras[id])s.extras[id]=s.chart.addLineSeries({title:name,color,lineWidth:1,lastValueVisible:false,priceLineVisible:false});
 const latest=s.candles[s.candles.length-1];
 const optionKey=[s.opts.sma20,s.opts.sma50,s.opts.bb,s.opts.bbPeriod,s.opts.bbStdDev,s.opts.bbFill].join(":");
 const prefix=window.ChartStudioDataSignature?.signature(s.candles.slice(0,-1));
 const increment=!!prefix&&prefix===s.extraPrefix&&
  latest.time===s.extraTime&&optionKey===s.extraOptions&&s.candles.length>=Math.max(50,s.opts.bbPeriod);
 if(increment){
  const lastSma=n=>{
   let sum=0;for(let i=s.candles.length-n;i<s.candles.length;i++)sum+=Number(s.candles[i].close);
   return sum/n;
  };
  if(s.opts.sma20)s.extras.sma20.update({time:latest.time,value:lastSma(20)});
  if(s.opts.sma50)s.extras.sma50.update({time:latest.time,value:lastSma(50)});
  if(s.opts.bb){
   const n=s.opts.bbPeriod,mid=lastSma(n);let variance=0;
   for(let i=s.candles.length-n;i<s.candles.length;i++)
    variance+=(Number(s.candles[i].close)-mid)**2;
   const deviation=Math.sqrt(variance/n),width=s.opts.bbStdDev;
   s.extras.bbUpper.update({time:latest.time,value:mid+width*deviation});
   s.extras.bbMiddle.update({time:latest.time,value:mid});
   s.extras.bbLower.update({time:latest.time,value:mid-width*deviation});
   if(s.bbData?.upper?.length){s.bbData.upper[s.bbData.upper.length-1]={time:latest.time,value:mid+width*deviation};s.bbData.middle[s.bbData.middle.length-1]={time:latest.time,value:mid};s.bbData.lower[s.bbData.lower.length-1]={time:latest.time,value:mid-width*deviation}}
  }
  return;
 }
 s.extraPrefix=prefix;s.extraTime=latest.time;s.extraOptions=optionKey;
 const bb=s.opts.bb?bollinger(s.candles,s.opts.bbPeriod,s.opts.bbStdDev):null;s.bbData=bb;
 for(const [key,option,data] of [
  ["sma20","sma20",s.opts.sma20?sma(s.candles,20):[]],
  ["sma50","sma50",s.opts.sma50?sma(s.candles,50):[]],
  ["bbUpper","bb",bb?bb.upper:[]],["bbMiddle","bb",bb?bb.middle:[]],["bbLower","bb",bb?bb.lower:[]]]){
  s.extras[key].applyOptions({visible:!!s.opts[option]});
  s.extras[key].setData(data);
 }
 try{window.StoneCelebration?.refresh?.();}catch(_){}
}
function getLiveMAs(){
 if(!s)return null;
 const result=[];
 const getSma=n=>{
  if(!Array.isArray(s.candles)||s.candles.length<n)return null;
  let sum=0;for(let i=s.candles.length-n;i<s.candles.length;i++)sum+=Number(s.candles[i].close);
  return sum/n;
 };
 if(s.opts?.sma20){
  result.push({
   id:"sma20",
   type:"SMA",
   period:20,
   source:"close",
   label:"SMA20",
   color:"#76e9a8",
   value:getSma(20),
   visible:true
  });
 }
 if(s.opts?.sma50){
  result.push({
   id:"sma50",
   type:"SMA",
   period:50,
   source:"close",
   label:"SMA50",
   color:"#ffb675",
   value:getSma(50),
   visible:true
  });
 }
 return {
  opts:s.opts?{...s.opts}:{ema20:true,ema50:true,ema200:true},
  extras:result
 };
}
function drawBollingerFill(ctx){
 const points=s?.bbData;if(!s?.opts.bb||!s.opts.bbFill||!points?.upper?.length)return;
 const visible=s.coordinates.visibleLogicalRange(),offset=s.candles.length-points.upper.length;
 const start=Math.max(0,Math.floor(visible?.from??0)-offset-1),end=Math.min(points.upper.length-1,Math.ceil(visible?.to??s.candles.length)+1-offset);
 const upper=[],lower=[];for(let i=start;i<=end;i++){
  const x=s.coordinates.timeToX(points.upper[i].time),yu=s.coordinates.priceToY(points.upper[i].value),yl=s.coordinates.priceToY(points.lower[i].value);
  if(Number.isFinite(x)&&Number.isFinite(yu)&&Number.isFinite(yl)){upper.push([x,yu]);lower.push([x,yl])}
 }
 if(upper.length<2)return;ctx.save();ctx.beginPath();ctx.moveTo(...upper[0]);for(let i=1;i<upper.length;i++)ctx.lineTo(...upper[i]);for(let i=lower.length-1;i>=0;i--)ctx.lineTo(...lower[i]);ctx.closePath();ctx.fillStyle="rgba(185,161,255,.10)";ctx.fill();ctx.restore();
}
function project(anchor){
 let x=null,y=null;
 try{x=s.coordinates.timeToX(anchor.time);y=s.coordinates.priceToY(anchor.price)}catch(_){}
 return Number.isFinite(x)&&Number.isFinite(y)?{x,y}:null;
}
function snapAnchor(point){
 if(!s?.magnet||!point)return point;
 const c=window.ChartStudioDrawingGeometry?.nearestSnap(point,s.candles,
 time=>s.coordinates.timeToX(time),
 price=>s.coordinates.priceToY(price),12);
 return c?{time:c.time,price:c.price}:point;
}
function removeSelected(){
 if(!s||!Number.isInteger(s.selected)||s.selected<0||s.selected>=s.draw.length){
  updateMessage("Erst einen Zeichnungsgriff auswählen.");return;
 }
 if(s.draw[s.selected].locked){updateMessage("Objekt gesperrt: zuerst entsperren.");return}
 snapshot();s.draw.splice(s.selected,1);s.selected=null;persist();
 updateMessage("Ausgewählte Zeichnung gelöscht. Undo möglich.");
}
function operateObject(i,action,value){
 if(!s||!Number.isInteger(i)||i<0||i>=s.draw.length)return false;
 if(action==="select"){
  setTool("edit");s.selected=i;window.ChartStudioObjectManager?.render();requestDraw();return true;
 }
 const obj=s.draw[i];
 if(obj.locked&&!["visibility","lock","duplicate"].includes(action)){
  updateMessage("Zeichnung gesperrt: zum Bearbeiten erst entsperren.");return false;
 }
 if(action==="rename"&&
  (typeof value!=="string"||value.length>40||/[\u0000-\u001f]/.test(value))){
  updateMessage("Ungültiger Name (maximal 40 Zeichen).");return false;
 }
 if(action==="rename"&&obj.kind==="text"&&!value.trim()){
  updateMessage("Textannotation benötigt mindestens ein druckbares Zeichen.");
  window.ChartStudioObjectManager?.render();return false;
 }
 if(action==="duplicate"&&s.draw.length>=MAX_DRAWINGS){updateMessage("Maximal 1.000 Objekte.");return false}
 if(action==="up"&&i===s.draw.length-1)return false;
 if(action==="down"&&i===0)return false;
 if(!["rename","visibility","lock","duplicate","remove","up","down"].includes(action))return false;
 snapshot();
 if(action==="rename")obj.label=value.trim();
 if(action==="visibility"){obj.visible=obj.visible===false;if(!obj.visible&&s.selected===i)s.selected=null}
 if(action==="lock"){obj.locked=!obj.locked;if(obj.locked&&s.selected===i)s.selected=null}
 if(action==="remove"){s.draw.splice(i,1);s.selected=null}
 if(action==="duplicate"){const dup=json(obj);delete dup.id;s.draw.push(dup);s.selected=null}
 if(action==="up"||action==="down"){
  const next=i+(action==="up"?1:-1);
  [s.draw[i],s.draw[next]]=[s.draw[next],s.draw[i]];
  if(s.selected===i)s.selected=next;else if(s.selected===next)s.selected=i;
 }
 persist();return true;
}
function unproject(x,y){
 const time=s.coordinates.xToTime(x),price=s.coordinates.yToPrice(y);
 return Number.isSafeInteger(time)&&Number.isFinite(price)&&price>0?{time,price}:null;
}
function dims(){
 const root=s.host.getBoundingClientRect(),cell=s.host.querySelector("table tbody tr:first-child td:first-child");
 const pane=cell?cell.getBoundingClientRect():root;
 let width=pane.width;try{width=s.chart.timeScale().width()||width}catch(_){}
 const w=Math.floor(width),h=Math.floor(pane.height);
 return w>50&&h>50?{w,h,left:Math.max(0,Math.round(pane.left-root.left)),top:Math.max(0,Math.round(pane.top-root.top))}:null;
}
function requestDraw(){if(!s||requestId)return;requestId=requestAnimationFrame(()=>{requestId=0;render()})}
function drawObject(ctx,o,d){
 if(o.visible===false)return;
 const a=project(o.anchors[0]),b=o.anchors.length>1?project(o.anchors[1]):null;if(!a)return;
 ctx.save();ctx.lineWidth=o.selected?2.5:1.5;ctx.strokeStyle=o.preview?"#f7e1af":o.locked?"#8b9aa3":o.selected?"#ffe3a5":"#6fe6ed";ctx.fillStyle="rgba(48,190,230,.12)";
 if(o.kind==="horizontal"){ctx.setLineDash([5,4]);ctx.beginPath();ctx.moveTo(0,a.y);ctx.lineTo(d.w,a.y);ctx.stroke()}
 if(o.kind==="vertical"){ctx.setLineDash([5,4]);ctx.beginPath();ctx.moveTo(a.x,0);ctx.lineTo(a.x,d.h);ctx.stroke()}
 if(o.kind==="text"){ctx.fillStyle=o.selected?"#ffe3a5":o.locked?"#aab8bf":"#f3f7fa";ctx.font="12px sans-serif";ctx.textBaseline="bottom";ctx.fillText(o.label,a.x+5,a.y-5,260)}
 if(b&&o.kind==="trend"){ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke()}
 if(b&&o.kind==="rect"){ctx.fillRect(a.x,a.y,b.x-a.x,b.y-a.y);ctx.strokeRect(a.x,a.y,b.x-a.x,b.y-a.y)}
 if(b&&o.kind==="fib"){for(const k of (o.levels||ratios)){const y=a.y+(b.y-a.y)*k;ctx.strokeStyle=k===.618?"#f7c874":"#8da8f9";
 ctx.beginPath();ctx.moveTo(Math.min(a.x,b.x),y);ctx.lineTo(d.w-2,y);ctx.stroke();ctx.fillStyle="#f7f8ff";ctx.font="11px monospace";ctx.fillText((k*100).toLocaleString("de-DE",{maximumFractionDigits:2})+"%",Math.max(3,d.w-64),y-3)}}
 if(s.tool==="edit"&&!o.locked)for(const p of o.anchors.map(project).filter(Boolean)){ctx.fillStyle="#f3faff";ctx.fillRect(p.x-5,p.y-5,10,10);ctx.strokeRect(p.x-5,p.y-5,10,10)}

 if(b&&o.kind==="ray"){
  const segment=window.ChartStudioDrawingGeometry?.clipRay(a,b,d.w);
  if(segment){ctx.beginPath();ctx.moveTo(segment[0].x,segment[0].y);ctx.lineTo(segment[1].x,segment[1].y);ctx.stroke()}
 }
 if(b&&o.kind==="channel"){
  ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
  const c=o.anchors[2]?project(o.anchors[2]):null;
  if(c){
   const ch=window.ChartStudioDrawingGeometry?.parallelChannel(a,b,c);
   if(ch){
    ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);
    ctx.lineTo(ch.second[1].x,ch.second[1].y);ctx.lineTo(ch.second[0].x,ch.second[0].y);
    ctx.closePath();ctx.fill();ctx.stroke();
    ctx.save();ctx.setLineDash([3,4]);ctx.beginPath();
    ctx.moveTo(ch.mid[0].x,ch.mid[0].y);ctx.lineTo(ch.mid[1].x,ch.mid[1].y);
    ctx.stroke();ctx.restore();
   }
  }
 }
 if(b&&o.kind==="ruler"){
  ctx.strokeStyle="#f3d49a";ctx.setLineDash([4,3]);ctx.beginPath();
  ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
  const interval=({M1:60,M5:300,M15:900,M30:1800,H1:3600,H4:14400,D1:86400})[s.tf]||900;
  const m=window.ChartStudioDrawingGeometry?.measure(o.anchors[0],o.anchors[1],interval);
  if(m){
   const label="Preis: "+(m.delta>=0?"+":"")+m.delta.toFixed(2)+
     " ("+(m.percent>=0?"+":"")+m.percent.toFixed(2)+"%) | "+Math.abs(m.bars)+" Bars";
   ctx.font="11px monospace";
   const width=Math.min(d.w-12,ctx.measureText(label).width+12);
   const lx=Math.max(4,Math.min(d.w-width-4,(a.x+b.x)*.5-width*.5));
   const ly=Math.max(17,Math.min(d.h-10,(a.y+b.y)*.5-10));
   ctx.fillStyle="#132b35";ctx.fillRect(lx,ly-15,width,19);
   ctx.fillStyle="#ffe8b6";ctx.fillText(label,lx+5,ly-2,width-10);
  }
 }
 ctx.restore();
}
function drawPositions(ctx,d){
 const context=s.positionContext;if(!context)return;
 const modes={0:"NETTING",1:"EXCHANGE",2:"HEDGING"},mode=modes[context.marginMode]||"UNKNOWN";
 ctx.save();ctx.font="10px monospace";ctx.fillStyle="#e9f4fb";ctx.fillText(mode+" · "+context.currency+" · MT5_VERIFIED",5,12);ctx.restore();
 const fmt=n=>Number(n).toFixed(2);
 for(const p of s.verifiedPositions){
  const entry=Number(p.priceOpen),sl=Number(p.sl),tp=Number(p.tp);
  if(!Number.isFinite(entry)||entry<=0)continue;
  const yEntry=s.coordinates.priceToY(entry);if(!Number.isFinite(yEntry))continue;
  for(const [price,type] of [[sl,"SL"],[tp,"TP"]]){
   if(!Number.isFinite(price)||price<=0)continue;
   const y=s.coordinates.priceToY(price);if(!Number.isFinite(y))continue;
   ctx.fillStyle=type==="SL"?"rgba(236,80,92,.16)":"rgba(36,206,143,.13)";
   ctx.fillRect(0,Math.min(y,yEntry),d.w,Math.abs(y-yEntry));
   ctx.strokeStyle=type==="SL"?"#ff7e8e":"#60eabb";ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(d.w-62,y);ctx.stroke();
   ctx.fillStyle="#f6faff";ctx.font="11px monospace";ctx.fillText(type+" "+fmt(price),5,Math.max(11,Math.min(d.h-5,y-4)));
  }
  ctx.strokeStyle="#e6eef7";ctx.setLineDash([7,4]);ctx.beginPath();ctx.moveTo(0,yEntry);ctx.lineTo(d.w-70,yEntry);ctx.stroke();ctx.setLineDash([]);
  const profit=Number(p.profit),swap=Number(p.swap),volume=Number(p.volume);
  ctx.fillStyle="#f8fcff";ctx.font="10px monospace";
  const label=(p.side||p.type)+" "+volume.toFixed(2)+"L #"+p.ticket+" @ "+fmt(entry)+" · P/L "+fmt(profit)+" "+context.currency+" · Swap "+fmt(swap)+" "+context.currency;
  ctx.fillText(label,5,Math.max(12,Math.min(d.h-5,yEntry-4)),d.w-10);
 }
}
function drawBrokerDeals(ctx,d){
 for(const marker of s.brokerMarkers){
  if(!marker.plotted)continue;
  const point=project({time:marker.chartTimeSeconds,price:marker.price});
  if(!point||point.x<0||point.x>d.w||point.y<0||point.y>d.h)continue;
  ctx.save();ctx.fillStyle=marker.side==="BUY"?"#56e6af":"#ff8495";ctx.strokeStyle="#071721";ctx.lineWidth=1.5;
  ctx.beginPath();
  if(marker.entry==="IN"){ctx.moveTo(point.x,point.y-7);ctx.lineTo(point.x+7,point.y+6);ctx.lineTo(point.x-7,point.y+6)}
  else{ctx.moveTo(point.x-7,point.y-6);ctx.lineTo(point.x+7,point.y-6);ctx.lineTo(point.x,point.y+7)}
  ctx.closePath();ctx.fill();ctx.stroke();
  ctx.font="10px monospace";const label=marker.label,width=ctx.measureText(label).width+8;
  const x=Math.max(2,Math.min(d.w-width-2,point.x+8)),y=Math.max(12,Math.min(d.h-3,point.y-8));
  ctx.fillStyle="rgba(7,23,33,.88)";ctx.fillRect(x,y-11,width,14);ctx.fillStyle="#f3f8fb";ctx.fillText(label,x+4,y,width);
  ctx.restore();
 }
}
function drawPositionDraft(ctx,d){
 const draft=s.positionDraft;if(!draft)return;
 ctx.save();ctx.setLineDash([5,4]);ctx.font="11px monospace";
 for(const [leg,color] of [["slPrice","#ff7584"],["tpPrice","#5eeabb"]]){
  const price=draft[leg];if(!Number.isFinite(price)||price<=0)continue;
  const y=s.coordinates.priceToY(price);if(!Number.isFinite(y))continue;
  ctx.strokeStyle=color;ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(d.w-10,y);ctx.stroke();
  ctx.setLineDash([]);ctx.fillRect(d.w*.48-7,y-7,14,14);ctx.fillStyle="#071721";ctx.fillText(leg==="slPrice"?"SL":"TP",d.w*.48-5,y+4);ctx.setLineDash([5,4]);
  ctx.fillStyle=color;ctx.fillText("ENTWURF "+(leg==="slPrice"?"SL ":"TP ")+price.toFixed(draft.digits),5,Math.max(12,Math.min(d.h-4,y-5)));
 }
 ctx.restore();
}
function drawScenario(ctx,d){
 const plan=s.scenario;if(!plan)return;
  const entry=s.coordinates.priceToY(plan.entryPrice),sl=s.coordinates.priceToY(plan.slPrice),tp=s.coordinates.priceToY(plan.tpPrice);
 if(![entry,sl,tp].every(Number.isFinite))return;
 ctx.save();
 for(const [a,b,color] of [[entry,sl,"rgba(255,120,130,.21)"],[entry,tp,"rgba(60,223,178,.18)"]]){
  ctx.fillStyle=color;ctx.fillRect(0,Math.min(a,b),d.w,Math.abs(b-a));
 }
 ctx.setLineDash([3,4]);ctx.strokeStyle="#ffe1aa";ctx.beginPath();ctx.moveTo(0,entry);ctx.lineTo(d.w-56,entry);ctx.stroke();
 ctx.font="11px monospace";ctx.fillStyle="#ffe4b2";ctx.fillText("PLAN "+plan.side+" "+plan.volumeLots+"L",5,Math.max(12,Math.min(d.h-4,entry-5)));
 ctx.strokeStyle="#ff8992";ctx.beginPath();ctx.moveTo(0,sl);ctx.lineTo(d.w-56,sl);ctx.stroke();
 ctx.fillText("PLAN SL "+plan.slPrice.toFixed(2),5,Math.max(12,Math.min(d.h-4,sl-5)));
 ctx.strokeStyle="#6aefbd";ctx.beginPath();ctx.moveTo(0,tp);ctx.lineTo(d.w-56,tp);ctx.stroke();
 ctx.fillText("PLAN TP "+plan.tpPrice.toFixed(2),5,Math.max(12,Math.min(d.h-4,tp-5)));
 if(s.tool==="plan"){
  for(const [py,color] of [[sl,"#ff8c98"],[tp,"#70ecc5"]]){
   ctx.fillStyle=color;ctx.strokeStyle="#0a2431";ctx.lineWidth=2;
   ctx.fillRect(d.w*.45-8,py-8,16,16);ctx.strokeRect(d.w*.45-8,py-8,16,16);
  }
 }
 ctx.restore();
}
function drawPinnedDataWindow(ctx,d){
 const row=s?.dataWindow?.pinned?s.dataWindow.snapshot:null;if(!row)return;
  const x=s.coordinates.timeToX(row.time),y=s.coordinates.priceToY(row.close);
 if(!Number.isFinite(x)||!Number.isFinite(y))return;
 ctx.save();ctx.strokeStyle="#ffd166";ctx.lineWidth=1;ctx.setLineDash([3,3]);ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,d.h);ctx.moveTo(0,y);ctx.lineTo(d.w,y);ctx.stroke();ctx.restore();
}
function render(){
 if(!s)return;const d=dims();if(!d)return;
 const c=s.canvas,ratio=Math.min(2,window.devicePixelRatio||1);
 c.style.left=d.left+"px";c.style.top=d.top+"px";c.style.width=d.w+"px";c.style.height=d.h+"px";
 const pw=Math.ceil(d.w*ratio),ph=Math.ceil(d.h*ratio);if(c.width!==pw||c.height!==ph){c.width=pw;c.height=ph}
 const ctx=c.getContext("2d");ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,d.w,d.h);
 drawBollingerFill(ctx);
 if(s.opts.positions)drawPositions(ctx,d);
 drawPositionDraft(ctx,d);
 drawBrokerDeals(ctx,d);
 if(s.scenario)drawScenario(ctx,d);
 for(let i=0;i<s.draw.length;i++)drawObject(ctx,{...s.draw[i],selected:i===s.selected},d);
 if(s.pending.length&&s.preview)drawObject(ctx,{kind:s.tool,anchors:[...s.pending,s.preview],preview:true},d);
 drawPinnedDataWindow(ctx,d);
}
function xy(e){const r=s.canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top}}
function cancelPlanPreview(){
 if(planTimer){clearTimeout(planTimer);planTimer=null}
 if(s?.planOriginal){
  s.scenario=json(s.planOriginal);
  const form=s.panel.querySelector("#cs-scenario-form");
  if(form)for(const key of ["slPrice","tpPrice"])
   form.elements.namedItem(key).value=String(s.scenario[key]);
 }
 if(s){s.planDrag=null;s.planOriginal=null}
 scenarioGeneration++;requestDraw();
 try{window.StoneCelebration?.applyChartSettings()}catch(_){}
}
function validScenario(p){
 return p&&p.volumeLots>0&&p.entryPrice>0&&p.slPrice>0&&p.tpPrice>0&&
 (p.side==="BUY"?p.slPrice<p.entryPrice&&p.entryPrice<p.tpPrice:
  p.tpPrice<p.entryPrice&&p.entryPrice<p.slPrice);
}
function previewPlan(immediate=false){
 if(!s?.scenario||!validScenario(s.scenario))return;
 if(planTimer)clearTimeout(planTimer);
 planTimer=setTimeout(()=>{
  planTimer=null;
  s.panel.querySelector("#cs-scenario-form")?.requestSubmit();
 },immediate?0:260);
}
function findPlanGrip(x,y){
 if(!s?.scenario||!s.planTickSize)return null;
  const sl=s.coordinates.priceToY(s.scenario.slPrice),tp=s.coordinates.priceToY(s.scenario.tpPrice);
 const dsl=Number.isFinite(sl)?Math.abs(y-sl):Infinity,dtp=Number.isFinite(tp)?Math.abs(y-tp):Infinity;
 if(Math.min(dsl,dtp)>19)return null;
 return dsl<=dtp?"slPrice":"tpPrice";
}
function findPositionDraftGrip(y){
 if(!s?.positionDraft)return null;
 const points=["slPrice","tpPrice"].filter(leg=>s.positionDraft[leg]!=null)
  .map(leg=>({leg,y:s.coordinates.priceToY(s.positionDraft[leg])})).filter(x=>Number.isFinite(x.y));
 const hit=points.sort((a,b)=>Math.abs(a.y-y)-Math.abs(b.y-y))[0];return hit&&Math.abs(hit.y-y)<=20?hit.leg:null;
}
function closestHandle(x,y){for(let i=s.draw.length-1;i>=0;i--){if(s.draw[i].locked||s.draw[i].visible===false)continue;for(let j=0;j<s.draw[i].anchors.length;j++){const p=project(s.draw[i].anchors[j]);if(p&&Math.hypot(p.x-x,p.y-y)<11)return {i,j}}}return null}
function pointerdown(e){
 if(!s||s.tool==="cursor"||e.button!==0)return;
 const {x,y}=xy(e),raw=unproject(x,y);if(!raw)return;
 const p=s.tool==="plan"||s.tool==="position-draft"?raw:snapAnchor(raw);
 if(s.tool==="position-draft"){
  const grip=findPositionDraftGrip(y);if(!grip){updateMessage("Positionsentwurf: SL- oder TP-Griff anklicken.");return}
  s.positionDraftDrag=grip;s.canvas.setPointerCapture(e.pointerId);e.preventDefault();return;
 }
 if(s.tool==="plan"){
  const grip=findPlanGrip(x,y);if(!grip){updateMessage("PLAN: SL- oder TP-Griff anklicken.");return}
  s.planOriginal=json(s.scenario);s.planDrag=grip;
  s.canvas.setPointerCapture(e.pointerId);
  try{window.StoneChartFX?.configure({enabled:false,ambient:false})}catch(_){}
  e.preventDefault();return;
 }
 if(s.tool==="edit"){
  const hit=closestHandle(x,y);if(!hit){s.selected=null;updateMessage("Griff wählen.");return}
  s.selected=hit.i;window.ChartStudioObjectManager?.render();snapshot();s.drag=hit;s.canvas.setPointerCapture(e.pointerId);e.preventDefault();return;
 }
 if(s.tool==="horizontal"||s.tool==="vertical"){snapshot();s.draw.push({kind:s.tool,anchors:[p]});persist();requestDraw();updateMessage(s.tool==="vertical"?"Zeitlinie gespeichert.":"Preislinie gespeichert.");return}
 if(s.tool==="text"){
  const label=window.prompt("Text für die Chart-Annotation (max. 40 Zeichen):","");
  if(typeof label!=="string")return;
  const text=label.trim();if(!text||text.length>40||/[\u0000-\u001f]/.test(text)){updateMessage("Textannotation benötigt 1–40 druckbare Zeichen.");return}
  snapshot();s.draw.push({kind:"text",anchors:[p],label:text});persist();requestDraw();updateMessage("Textannotation gespeichert.");return;
 }
 const required=window.ChartStudioDrawingGeometry?.expected(s.tool)||2;
 if(!s.pending.length){s.begin=p;s.pending=[p];s.preview=p;updateMessage("Nächsten Anker setzen · Esc bricht ab.");}
 else{
  s.pending.push(p);
  if(s.pending.length>=required){
   snapshot();s.draw.push({kind:s.tool,anchors:s.pending.map(point=>({...point})),
     ...(s.tool==="fib"?{levels:[...s.fibLevels]}:{})});
   s.begin=null;s.pending=[];s.preview=null;persist();updateMessage("Zeichnung gespeichert.");
  }else updateMessage("Dritten Kanal-Anker für Abstand setzen.");
 }
 requestDraw();e.preventDefault();
}
function pointermove(e){
 if(!s||s.tool==="cursor")return;
 const {x,y}=xy(e),raw=unproject(x,y);if(!raw)return;
 const p=s.tool==="plan"?raw:snapAnchor(raw);
 if(s.tool==="plan"&&s.planDrag&&s.scenario){
  scenarioGeneration++;s.lastScenarioPreview=null;
  const tick=s.planTickSize;
  const value=Number((Math.round(p.price/tick)*tick).toFixed(8));
  const next={...s.scenario,[s.planDrag]:value};
  if(!validScenario(next)){s.panel.querySelector("#cs-scenario-result").textContent="PLAN ungültig: SL/TP liegt auf der falschen Entry-Seite.";return}
  s.scenario=next;
  s.panel.querySelector("#cs-scenario-form").elements.namedItem(s.planDrag).value=String(value);
  s.panel.querySelector("#cs-scenario-result").textContent="PLAN-VORSCHAU · USD-Risiko wird vom Broker neu berechnet … KEINE ORDER";
  previewPlan();requestDraw();return;
 }
 if(s.tool==="position-draft"&&s.positionDraftDrag&&s.positionDraft){
  const tick=s.positionDraft.tickSize,value=Number((Math.round(p.price/tick)*tick).toFixed(s.positionDraft.digits));
  const next={...s.positionDraft,[s.positionDraftDrag]:value};
  if(next.side==="BUY"&&((next.slPrice!=null&&next.slPrice>=next.entryPrice)||(next.tpPrice!=null&&next.tpPrice<=next.entryPrice))||next.side==="SELL"&&((next.slPrice!=null&&next.slPrice<=next.entryPrice)||(next.tpPrice!=null&&next.tpPrice>=next.entryPrice)))return;
  s.positionDraft=next;window.ChartStudioBrokerPanel?.updateDraftPrice(s.positionDraftDrag,value);requestDraw();return;
 }
 if(s.drag){s.draw[s.drag.i].anchors[s.drag.j]=p;requestDraw()}
 else if(s.pending.length){s.preview=p;requestDraw()}
}
function pointerup(e){
 if(!s)return;
 if(s.planDrag){
  s.planDrag=null;
  previewPlan(true);requestDraw();
  try{s.canvas.releasePointerCapture(e.pointerId)}catch(_){}
  try{window.StoneCelebration?.applyChartSettings()}catch(_){}
  return;
 }
 if(s.positionDraftDrag){s.positionDraftDrag=null;try{s.canvas.releasePointerCapture(e.pointerId)}catch(_){};return}
 if(!s.drag)return;s.drag=null;persist();try{s.canvas.releasePointerCapture(e.pointerId)}catch(_){}
}
function clearScenarioDraft(message,clearAccountAssumptions=false){
 if(!s)return;
 scenarioGeneration++;s.lastScenarioPreview=null;s.scenario=null;s.validatedScenario=null;
 s.planDrag=null;s.planOriginal=null;s.planTickSize=null;s.marketQuote=null;
 const form=s.panel.querySelector("#cs-scenario-form");
 if(form)for(const name of ["entryPrice","slPrice","tpPrice"])form.elements.namedItem(name).value="";
 if(clearAccountAssumptions&&form)for(const name of ["riskBudget","feesPerLot"])form.elements.namedItem(name).value="";
 const output=s.panel.querySelector("#cs-scenario-result");if(output)output.textContent=message;
 renderPortfolioImpact(null);requestDraw();
}
function symbol(value){
 const valid=typeof value==="string"&&/^[A-Za-z0-9](?:[A-Za-z0-9_.# /+:-]{0,62}[A-Za-z0-9_.#/+:-])?$/.test(value);
 if(!s||!valid)return false;if(value===chartSymbol())return true;
 cancelPlanPreview();window.ChartStudioBrokerPanel?.invalidateDraft("Chartsymbol geändert · Positionsentwurf verworfen.");
 if(s.tool==="position-draft"||s.tool==="plan")setTool("cursor");
 s.symbol=value;s.coordinates.setScope({account:s.account,symbol:value,timeframe:s.tf});s.mtfConfluence?.setContext({account:s.account,symbol:value,timeframe:s.tf});s.draw=safeDraw(get(drawKey(),[]));s.opts=cleanOptions(get(optKey(),{}));s.magnet=get(magnetKey(),false)===true;
 s.fibLevels=window.ChartStudioFib?.normalizeLevels(get(fibKey(),ratios))||[...ratios];
 s.candles=[];s.candleSignature=null;s.positions=[];s.verifiedPositions=[];s.positionContext=null;s.positionDraft=null;s.positionDraftDrag=null;s.brokerMarkers=[];
 s.begin=null;s.preview=null;s.drag=null;s.pending=[];s.selected=null;s.undo=[];s.redo=[];
 clearScenarioDraft("Chartsymbol geändert · neue Quote und Preise eingeben; nur read-only.");
 clearDataWindowPin();clearEvidence();
 s.series.setData([]);for(const series of s.emas||[])series.setData([]);
 window.ChartStudioIndicators?.updateBars([]);window.ChartStudioOscillators?.updateBars([]);window.ChartStudioChartTypes?.updateBars([]);window.ChartStudioAverages?.updateBars([]);window.ChartStudioReplay?.updateBars([]);
 const scenario=s.panel.querySelector(".cs-scenario"),scope=s.panel.querySelector("#cs-scenario-scope");if(scenario)scenario.hidden=false;if(scope)scope.hidden=true;
 const scenarioSymbol=s.panel.querySelector("#cs-scenario-symbol");if(scenarioSymbol)scenarioSymbol.textContent=value;
 renderScenarioSnapshots();loadPortfolio(s.account,value);
 refreshProfiles();showOpts();updateSeries();window.ChartStudioObjectManager?.render();requestDraw();
 window.dispatchEvent(new CustomEvent("chartstudio:symbol-change",{detail:{account:s.account,symbol:value,timeframe:s.tf}}));return true;
}
function account(id,preferredSymbol,deferPortfolio=false){if(!s)return;cancelPlanPreview();s.account=id;if(typeof preferredSymbol==="string"&&/^[A-Za-z0-9](?:[A-Za-z0-9_.# /+:-]{0,62}[A-Za-z0-9_.#/+:-])?$/.test(preferredSymbol))s.symbol=preferredSymbol;s.favorites=normalizeFavorites(get(favoritesKey(),[]));s.shortcuts=normalizeShortcuts(get(shortcutsKey(),{}));renderToolPreferences();s.coordinates.setScope({account:s.account,symbol:chartSymbol(),timeframe:s.tf});s.mtfConfluence?.setContext({account:s.account,symbol:chartSymbol(),timeframe:s.tf});clearEvidence();s.verifiedPositions=[];s.positionContext=null;s.positionDraft=null;s.positionDraftDrag=null;s.portfolio=null;s.portfolioCapturedAtUtc=null;s.portfolioLoading=false;s.portfolioError="";if(s.tool==="position-draft")setTool("cursor");s.candleSignature=null;s.extraPrefix=null;s.extraTime=null;s.extraOptions=null;s.bbData=null;s.draw=safeDraw(get(drawKey(),[]));s.opts=cleanOptions(get(optKey(),{}));s.undo=[];s.redo=[];s.positions=[];s.brokerMarkers=[];s.scenario=null;s.validatedScenario=null;s.begin=null;s.preview=null;s.drag=null;s.pending=[];s.selected=null;s.magnet=get(magnetKey(),false)===true;
 s.lastScenarioPreview=null;s.marketQuote=null;clearScenarioDraft("Konto geändert · neue Quote und Preise eingeben; Gebühren/Risikobudget neu bestätigen.",true);clearDataWindowPin();
  s.fibLevels=window.ChartStudioFib?.normalizeLevels(get(fibKey(),ratios))||[...ratios];
  const fibInput=s.panel.querySelector("#cs-fib-levels");if(fibInput)fibInput.value=window.ChartStudioFib?.display(s.fibLevels)||"";
 scenarioGeneration++;portfolioGeneration++;renderPortfolioImpact(null);if(s.tool==="plan")setTool("cursor");
 s.panel.querySelector('[data-cmd="magnet"]')?.setAttribute("aria-pressed",String(s.magnet));
 const mag=s.panel.querySelector('[data-cmd="magnet"]');if(mag)mag.textContent="Magnet: "+(s.magnet?"AN":"AUS")+" · Kerzen-OHLC";
 window.ChartStudioIndicators?.switchAccount(id);
 window.ChartStudioAverages?.switchAccount(id);
 window.ChartStudioAppearance?.switchAccount(id);
 window.ChartStudioOscillators?.switchAccount(id);
 window.ChartStudioChartTypes?.switchAccount(id);
 window.ChartStudioServerSync?.account(id);
 window.ChartStudioBrokerPanel?.setAccount(id,preferredSymbol);
 window.ChartStudioReplay?.switchContext(id,s.tf);
 renderScenarioSnapshots();if(!deferPortfolio)loadPortfolio(id,chartSymbol());
 const scenarioStatus=s.panel.querySelector("#cs-scenario-ab-status");if(scenarioStatus)scenarioStatus.textContent="A/B-Snapshots für "+id+" · lokal · nur verifizierte Vorschauen.";
 showOpts();refreshProfiles();updateSeries();window.ChartStudioObjectManager?.render();requestDraw()}
function timeframe(tf){if(s){cancelPlanPreview();if(s.positionDraft)window.ChartStudioBrokerPanel?.invalidateDraft("Timeframe geändert · Positionsentwurf verworfen.");s.positionDraft=null;s.positionDraftDrag=null;if(s.tool==="position-draft")setTool("cursor");s.tf=tf;s.coordinates.setScope({account:s.account,symbol:chartSymbol(),timeframe:s.tf});s.mtfConfluence?.setContext({account:s.account,symbol:chartSymbol(),timeframe:s.tf});window.ChartStudioBrokerPanel?.setTimeframe(tf);s.candleSignature=null;s.extraPrefix=null;s.extraTime=null;s.extraOptions=null;s.begin=null;s.preview=null;s.pending=[];s.selected=null;s.drag=null;if(s.tool==="plan")setTool("cursor");refreshProfiles();
 clearDataWindowPin();
 window.ChartStudioIndicators?.updateBars([]);
  window.ChartStudioOscillators?.updateBars([]);
  window.ChartStudioChartTypes?.updateBars([]);
  window.ChartStudioAverages?.updateBars([]);
  window.ChartStudioReplay?.switchContext(s.account,tf);
 requestDraw()}}
function brokerMarkerCounts(){return {plotted:s?.brokerMarkers.filter(marker=>marker.plotted).length||0,unplotted:s?.brokerMarkers.filter(marker=>!marker.plotted).length||0}}
function refreshBrokerMarkerTimes(){if(!s)return;const bars=new Set(s.candles.map(c=>Number(c.time)));s.brokerMarkers=s.brokerMarkers.map(marker=>({...marker,plotted:bars.has(marker.chartTimeSeconds)}));window.ChartStudioBrokerPanel?.updateMarkerAvailability(brokerMarkerCounts())}
function updateCandles(c){if(s&&Array.isArray(c)){
  const sig=window.ChartStudioDataSignature?.signature(c);
  if(sig&&sig===s.candleSignature)return;
  s.candleSignature=sig;s.candles=c;refreshBrokerMarkerTimes();updateSeries();
 window.ChartStudioIndicators?.updateBars(c);
  window.ChartStudioOscillators?.updateBars(c);
  window.ChartStudioChartTypes?.updateBars(c);
  window.ChartStudioAverages?.updateBars(c);
   window.ChartStudioReplay?.updateBars(c);
 requestDraw()}}
function updatePositions(accountId,positions){if(s&&s.account===accountId){s.positions=Array.isArray(positions)?positions:[];requestDraw()}}
function dataWindowIndicators(time){
 const averages=window.ChartStudioAverages?.readout(time)||"";
 const paneIndicators=window.ChartStudioIndicators?.readout(time)||"";
 const parts=paneIndicators&&paneIndicators!=="Keine aktiven Indikatoren"?[paneIndicators]:[];
 if(averages)parts.push(averages);
 return parts.filter(Boolean).join(" · ")||"Keine aktiven Indikatoren";
}
function dataBar(param){
 if(!s||!param||param.time==null)return null;
 const bar=param.seriesData?.get?.(s.series);if(!bar)return null;
 const raw=[bar.open,bar.high,bar.low,bar.close];if(raw.some(value=>value===null||value===undefined))return null;
 const values=raw.map(Number);
 if(!values.every(Number.isFinite)||values.some(value=>value<=0)||values[1]<Math.max(values[0],values[2],values[3])||values[2]>Math.min(values[0],values[1],values[3]))return null;
 const time=typeof param.time==="number"?param.time:Date.UTC(param.time.year,param.time.month-1,param.time.day)/1000;
 const date=new Date(time*1000);if(!Number.isFinite(date.getTime()))return null;
 return {time,open:values[0],high:values[1],low:values[2],close:values[3],indicators:dataWindowIndicators(time),timeLabel:new Intl.DateTimeFormat("de-DE",{timeZone:"UTC",dateStyle:"medium",timeStyle:"medium"}).format(date)+" UTC",source:"Chart-Feed · geladene OHLC-Kerze"};
}
function setVerifiedMarketQuote(accountId,data){
 if(!s||s.account!==accountId)return false;
 const bid=Number(data?.bid),ask=Number(data?.ask),age=Number(data?.ageSeconds);
 const digits=data?.digits;
 const valid=data?.account===accountId&&data?.symbol===chartSymbol()&&data?.source==="MT5_VERIFIED"&&data?.canExecute===false&&/^[A-Z]{3,12}$/.test(data?.currency||"")&&Number.isInteger(digits)&&digits>=0&&digits<=10&&Number.isFinite(bid)&&bid>0&&Number.isFinite(ask)&&ask>=bid&&Number.isFinite(age)&&age>=0&&typeof data?.quoteTimeUtc==="string"&&/(?:Z|\+00:00)$/.test(data.quoteTimeUtc)&&Number.isFinite(Date.parse(data.quoteTimeUtc))&&["FRESH","STALE","FUTURE"].includes(data?.freshness);
 s.marketQuote=valid?{bid,ask,digits,currency:data.currency,quoteTimeUtc:data.quoteTimeUtc,ageSeconds:age,freshness:data.freshness,source:data.source}:null;
 renderDataWindow();return valid;
}
function renderDataWindow(){
 if(!s?.dataWindow)return;const view=s.dataWindow,panel=s.panel;
 panel.querySelector("#cs-data-window-state").textContent=view.pinned?"Angeheftet":"Crosshair";
 panel.querySelector("#cs-data-window-pin").textContent=view.pinned?"Crosshair lösen":"Crosshair anheften";
 const row=view.snapshot,q=s.marketQuote,quoteDigits=q?.digits??2,values={time:row?.timeLabel||"—",open:row?row.open.toFixed(2):"—",high:row?row.high.toFixed(2):"—",low:row?row.low.toFixed(2):"—",close:row?row.close.toFixed(2):"—",source:row?.source||"Chart-Feed · wartet auf Kerze",indicators:row?.indicators||"—",bid:q?q.bid.toFixed(quoteDigits):"—",ask:q?q.ask.toFixed(quoteDigits):"—",spread:q?(q.ask-q.bid).toFixed(quoteDigits):"—","quote-time":q?q.quoteTimeUtc:"—","quote-status":q?q.freshness+" beim Abruf · "+q.ageSeconds.toFixed(1)+"s Broker-Alter beim Abruf · "+q.source:"Noch keine verifizierte Quote"};
 for(const [key,value] of Object.entries(values))panel.querySelector("#cs-data-window-"+key).textContent=value;
}
function setDataWindowPin(pin){
 if(!s)return;
 if(pin){if(!s.dataWindow.snapshot)return;s.dataWindow.pinned=true}
 else{s.dataWindow.pinned=false;s.dataWindow.snapshot=null}
 renderDataWindow();requestDraw();
}
function handleCrosshair(param){
 if(!s)return;
 if(s.dataWindow.pinned)return;
 const row=dataBar(param);if(row){s.dataWindow.snapshot=row;renderDataWindow()}
}
function clearDataWindowPin(){if(!s?.dataWindow)return;s.dataWindow.pinned=false;s.dataWindow.snapshot=null;renderDataWindow();requestDraw()}
function refreshDataWindowIndicators(){
 if(!s?.dataWindow?.snapshot)return;
 s.dataWindow.snapshot.indicators=dataWindowIndicators(s.dataWindow.snapshot.time);
 renderDataWindow();
}
function updateVerifiedPositions(accountId,envelope){
 if(!s||s.account!==accountId)return false;
 if(envelope===null){s.verifiedPositions=[];s.positionContext=null;requestDraw();return true}
 if(!envelope||envelope.account!==accountId||envelope.symbol!==chartSymbol()||envelope.timeframe!==s.tf||envelope.source!=="MT5_VERIFIED"||envelope.canExecute!==false||!/^([A-Z]{3,12})$/.test(envelope.currency)||![0,1,2].includes(envelope.marginMode)||!Array.isArray(envelope.positions)||envelope.positions.length>500){s.verifiedPositions=[];s.positionContext=null;requestDraw();return false}
 const rows=[];
 for(const p of envelope.positions){
  const ticket=String(p?.ticket),revision=p?.revision,side=p?.side||p?.type;
  const values=[p?.priceOpen,p?.priceCurrent,p?.volume,p?.profit,p?.swap].map(Number);
  const optionalPrice=value=>value===null||value===undefined||Number(value)===0||Number.isFinite(Number(value))&&Number(value)>0;
  const decimalText=(value,{positive=false,signed=false}={})=>typeof value==="string"&&/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)&&Number.isFinite(Number(value))&&(!positive||Number(value)>0)&&(signed||Number(value)>=0);
  if(p?.account!==accountId||p?.symbol!==chartSymbol()||p?.source!=="MT5_VERIFIED"||p?.canExecute!==false||!/^[1-9][0-9]{0,19}$/.test(ticket)||!/^[0-9a-f]{64}$/.test(revision)||!["BUY","SELL"].includes(side)||!values.every(Number.isFinite)||values[0]<=0||values[1]<=0||p?.currency!==envelope.currency||!decimalText(p?.priceOpen,{positive:true})||!decimalText(p?.priceCurrent,{positive:true})||!decimalText(p?.volume,{positive:true})||!decimalText(p?.profit,{signed:true})||!decimalText(p?.swap,{signed:true})||!optionalPrice(p?.sl)||!optionalPrice(p?.tp)){
   s.verifiedPositions=[];s.positionContext=null;requestDraw();return false;
  }
  rows.push({...p,ticket,side,source:"MT5_VERIFIED"});
 }
 const modeLabels={0:"NETTING",1:"EXCHANGE",2:"HEDGING"};
 s.verifiedPositions=rows;s.positionContext={account:accountId,symbol:chartSymbol(),timeframe:s.tf,currency:envelope.currency,marginMode:envelope.marginMode,modeLabel:modeLabels[envelope.marginMode],source:envelope.source};requestDraw();return true;
}
function updatePositionDraft(accountId,draft){
 if(!s||s.account!==accountId)return false;
 if(draft===null){s.positionDraft=null;s.positionDraftDrag=null;if(s.tool==="position-draft")setTool("cursor");requestDraw();return true}
 if(draft.symbol!==chartSymbol()||s.positionContext?.account!==accountId||s.positionContext?.symbol!==draft.symbol||s.positionContext?.timeframe!==s.tf||s.positionContext?.source!=="MT5_VERIFIED"||!/^[A-Za-z0-9](?:[A-Za-z0-9_.# /+:-]{0,62}[A-Za-z0-9_.#/+:-])?$/.test(draft.symbol)||!/^\d{1,20}$/.test(draft.ticket)||!/^([0-9a-f]{64})$/.test(draft.revision)||!["BUY","SELL"].includes(draft.side)||!Number.isFinite(draft.entryPrice)||draft.entryPrice<=0||!Number.isFinite(draft.tickSize)||draft.tickSize<=0||!Number.isInteger(draft.digits)||draft.digits<0||draft.digits>10)return false;
 s.positionDraft={...draft};s.positionDraftDrag=null;requestDraw();return true;
}
function setPositionDraftTool(accountId){if(!s||s.account!==accountId||!s.positionDraft)return false;setTool("position-draft");return true}
function updateBrokerDeals(accountId,deals,timeframe=s?.tf){
 if(!s||s.account!==accountId)return {plotted:0,unplotted:0};
 if(timeframe!==s.tf)return {plotted:0,unplotted:0};
 const entries=new Set(["IN","OUT","INOUT","OUT_BY"]),bars=new Set(s.candles.map(c=>Number(c.time)));
 s.brokerMarkers=(Array.isArray(deals)?deals:[]).flatMap(deal=>{
  const fillTimeUtcMs=deal?.fillTime?.utcEpochMs,price=Number(deal?.price),ticket=deal?.ticket;
  if(deal?.account!==accountId||deal?.symbol!==chartSymbol()||deal?.source!=="MT5_VERIFIED"||deal?.canExecute!==false||deal?.status!=="EXECUTED"||!(["BUY","SELL"].includes(deal?.side))||!entries.has(deal?.entry)||!Number.isSafeInteger(fillTimeUtcMs)||fillTimeUtcMs<=0||!Number.isFinite(price)||price<=0||typeof ticket!=="string"||!/^[1-9][0-9]{0,19}$/.test(ticket))return [];
  const chartTimeSeconds=Math.floor(fillTimeUtcMs/1000);
  const plotted=bars.has(chartTimeSeconds);
  return [{ticket,account:accountId,side:deal.side,entry:deal.entry,price,fillTimeUtcMs,chartTimeSeconds,plotted,label:deal.side+" "+deal.entry+" · #"+ticket}];
 });
 requestDraw();
 const counts=brokerMarkerCounts();window.ChartStudioBrokerPanel?.updateMarkerAvailability(counts);return counts;
}
function mount({chart,host,candleSeries,emaSeries,account:accountId="titan",timeframe:tf="M15"}){
 if(s||!chart||!host||!candleSeries)return;
 const card=host.closest(".glass-card");if(!card)return;
 const toggle=document.createElement("button");toggle.id="cs-beta-toggle";toggle.type="button";
 toggle.textContent="✎ Chart Studio · Beta";toggle.className="cs-beta-toggle";
 toggle.setAttribute("aria-expanded","false");toggle.setAttribute("aria-controls","cs-beta-panel");
 const expand=card.querySelector("#stone-chart-expand-btn");if(expand)expand.insertAdjacentElement("afterend",toggle);
 else card.prepend(toggle);
 // Always-visible EMA entry point: users should not need to discover the beta drawer.
 const maQuick=document.createElement("div");maQuick.className="cs-ma-quick";
 maQuick.setAttribute("role","group");maQuick.setAttribute("aria-label","EMA Schnellzugriff");
 const maOpen=document.createElement("button");maOpen.type="button";
 maOpen.className="cs-ma-quick-open";maOpen.textContent="⚙ EMAs einstellen";
 maOpen.setAttribute("aria-controls","cs-beta-panel");maOpen.setAttribute("aria-expanded","false");
 const maPeriod=document.createElement("input");maPeriod.type="number";maPeriod.min="1";
 maPeriod.max="1000";maPeriod.step="1";maPeriod.value="34";maPeriod.className="cs-ma-quick-period";
 maPeriod.setAttribute("aria-label","Periode für neue EMA");
 const maAdd=document.createElement("button");maAdd.type="button";maAdd.textContent="+ EMA";
 maAdd.setAttribute("aria-label","EMA mit gewählter Periode hinzufügen");
 const maHint=document.createElement("span");maHint.className="cs-ma-quick-hint";
 maHint.textContent="EMA 20/50/200 sind separat einblendbar";
 maQuick.append(maOpen,maPeriod,maAdd,maHint);
 toggle.insertAdjacentElement("afterend",maQuick);
 const panel=document.createElement("section");panel.id="cs-beta-panel";panel.className="cs-beta-panel";panel.hidden=true;
 const toolLabels=[["cursor","Navigation"],["edit","Griffe bearbeiten"],["horizontal","Preislinie"],["vertical","Zeitlinie"],["text","Text"],["trend","Trendlinie"],["ray","Strahl"],["rect","Zone"],["channel","Parallelkanal"],["fib","Fibonacci"],["ruler","Preis-/Zeitmessung"]];
 const optLabels=[["ema20","EMA20"],["ema50","EMA50"],["ema200","EMA200"],["sma20","SMA20"],["sma50","SMA50"],["bb","Bollinger20"],["positions","Positionen & SL/TP"]];
 panel.innerHTML=
  '<div class="cs-beta-head"><strong>CHART STUDIO · EXPERIMENTELL</strong><span>Keine Handelsausführung</span></div>'+
  '<section id="cs-data-window" aria-label="Datenfenster"><div><strong>Datenfenster</strong> · <span id="cs-data-window-state">Crosshair</span> <button type="button" id="cs-data-window-pin">Crosshair anheften</button></div><dl><div><dt>Kerzenzeit (UTC)</dt><dd id="cs-data-window-time">—</dd></div><div><dt>Open</dt><dd id="cs-data-window-open">—</dd></div><div><dt>High</dt><dd id="cs-data-window-high">—</dd></div><div><dt>Low</dt><dd id="cs-data-window-low">—</dd></div><div><dt>Close</dt><dd id="cs-data-window-close">—</dd></div><div><dt>Indikatoren</dt><dd id="cs-data-window-indicators">—</dd></div><div><dt>Quelle</dt><dd id="cs-data-window-source">Chart-Feed · wartet auf Kerze</dd></div><div><dt>Bid</dt><dd id="cs-data-window-bid">—</dd></div><div><dt>Ask</dt><dd id="cs-data-window-ask">—</dd></div><div><dt>Spread (Preis)</dt><dd id="cs-data-window-spread">—</dd></div><div><dt>Quotezeit</dt><dd id="cs-data-window-quote-time">—</dd></div><div><dt>Quote-Status</dt><dd id="cs-data-window-quote-status">Noch keine verifizierte Quote</dd></div></dl></section>'+
  '<details id="cs-evidence-panel" class="cs-evidence-panel"><summary>Aufzeichnungsnachweise · nur gespeicherte Read-Daten</summary><div class="cs-evidence-controls"><label for="cs-evidence-kind">Typ</label><select id="cs-evidence-kind"><option value="DECISION">Decisions</option><option value="LIFECYCLE">Broker-Lifecycle</option><option value="SNAPSHOT">Chart-Snapshots</option></select><label for="cs-evidence-days">Tage</label><select id="cs-evidence-days"><option value="1">1</option><option value="7">7</option><option value="30" selected>30</option></select><button type="button" id="cs-evidence-load">Zeitraum laden</button><button type="button" id="cs-evidence-more" hidden>Weitere Einträge</button></div><p id="cs-evidence-status" role="status" aria-live="polite">Keine Aufzeichnung abgefragt · Historie wird nicht rekonstruiert.</p><ol id="cs-evidence-list" aria-label="Aufgezeichnete Ereignisse"></ol><p>Read-only: gespeicherte Brokerhistorie wird nur von explizit freigegebenen Demo-Konten gelesen; keine Handelsänderungen. Fehlende Zeiträume bleiben NOT_RECORDED.</p></details>'+
  '<div class="cs-beta-buttons">'+toolLabels.map(([id,label])=>'<button type="button" data-tool="'+id+'">'+label+'</button>').join("")+
  ["undo","redo","delete-selected","export","save-png","clear"].map(id=>'<button type="button" data-cmd="'+id+'">'+({undo:"↶ Undo",redo:"↷ Redo","delete-selected":"Ausgewählte löschen",export:"JSON kopieren","save-png":"Bild (PNG) speichern",clear:"Alle Zeichnungen löschen"}[id])+'</button>').join("")+'</div>'+
  '<details id="cs-tool-preferences" class="cs-tool-preferences"><summary>Favoriten und individuelle Tastenkürzel</summary><strong>Favorisierte Werkzeuge</strong><div id="cs-favorite-tools" class="cs-beta-buttons" aria-label="Favorisierte Werkzeuge"></div><div class="cs-tool-preference-grid">'+toolLabels.map(([id,label])=>'<label><input type="checkbox" data-favorite-tool="'+id+'"> '+label+' als Favorit</label><label>'+label+' · Kürzel <input type="text" inputmode="text" autocomplete="off" maxlength="1" data-shortcut-tool="'+id+'" aria-label="Tastenkürzel für '+label+'" placeholder="—"></label>').join("")+'</div><p>Einzelne Buchstaben ohne Strg, Alt oder Umschalt. Doppelte Kürzel werden abgewiesen. Kürzel wirken nur bei geöffnetem Chart Studio.</p></details>'+
  '<p class="cs-beta-keyboard-hint">Kürzel: V Navigation · E Bearbeiten · H Linie · T Trend · R Zone · F Fibonacci · C Kanal · M Messen · Strg+Z Rückgängig · Entf Löschen</p>'+
  '<div class="cs-beta-buttons cs-fib-settings"><label>Fibonacci-Level (%) <input type="text" id="cs-fib-levels" aria-label="Fibonacci-Level in Prozent" placeholder="0; 23,6; 38,2; 50; 61,8; 78,6; 100" maxlength="240"></label><button type="button" data-cmd="fib-default">Fibo-Vorlage speichern</button><button type="button" data-cmd="fib-selected">Ausgewählte Fibo ändern</button></div>'+
  '<div class="cs-beta-buttons"><button type="button" data-cmd="magnet" aria-pressed="false">Magnet: AUS · Kerzen-OHLC</button></div>'+
 '<div class="cs-beta-buttons">'+optLabels.map(([id,label])=>'<button type="button" data-opt="'+id+'">'+label+'</button>').join("")+'</div>'+
 '<div class="cs-beta-buttons cs-bollinger-settings" role="group" aria-label="Bollinger-Einstellungen"><label>Periode <input type="number" min="2" max="300" step="1" data-bb-setting="bbPeriod" aria-label="Bollinger-Periode"></label><label>StdDev <input type="number" min="0.1" max="10" step="0.1" data-bb-setting="bbStdDev" aria-label="Bollinger-Standardabweichung"></label><label><input type="checkbox" data-bb-setting="bbFill"> Bandfläche anzeigen</label></div>'+
  '<div class="cs-beta-profiles"><strong>Lokale Layouts</strong> <select id="cs-beta-profile" aria-label="Gespeichertes Chartlayout"></select>'+
 '<button type="button" data-cmd="save-profile">Speichern</button>'+
 '<button type="button" data-cmd="load-profile">Laden</button>'+
   '<button type="button" data-cmd="copy-profile">Kopieren</button>'+
   '<button type="button" data-cmd="rename-profile">Umbenennen</button>'+
  '<button type="button" data-cmd="reset-profile">Zurücksetzen</button>'+
 '<button type="button" data-cmd="delete-profile">Löschen</button></div>'+
 '<p id="cs-beta-message" role="status" aria-live="polite">Dies ist die sichere Beta-Chartansicht. Alle Brokerpositionen sind nur lesbar.</p>'+
  '<p id="cs-scenario-scope" role="status" hidden></p><details class="cs-scenario"><summary>What-if <span id="cs-scenario-symbol">XAUUSD</span> · Broker-Risiko &amp; Margin (kein Orderversand)</summary>'+
 '<section aria-label="MT5 Portfolio-Exposure"><h4>Portfolio-Exposure · MT5</h4><button type="button" id="cs-portfolio-refresh">Portfolio aktualisieren</button><div id="cs-portfolio-summary" aria-live="polite"><p>Portfolio wird geladen …</p></div></section>'+
 '<form id="cs-scenario-form">'+
 '<label>Seite <select name="side"><option>BUY</option><option>SELL</option></select></label>'+
 '<label>Lots <input type="number" name="volumeLots" min="0.01" step="0.01" value="0.01" required></label>'+
 '<label>Lots aus <select name="lotMode"><option value="FIXED">fester Größe</option><option value="BUDGET">Risikobudget</option><option value="PERCENT">Equity-%</option></select></label>'+
 '<label>Risiko in Kontowährung <input type="number" name="riskBudget" min="0.01" step="any" value="25" disabled></label>'+
 '<label>Equity-Risiko (%) <input type="number" name="riskPercent" min="0.01" max="100" step="any" value="0.5" disabled></label>'+
 '<label>Roundtrip-Gebühren pro Lot (Kontowährung, Annahme) <input type="number" name="feesPerLot" min="0" max="10000" step="0.01" value="0"></label>'+
 '<label>Adverse Slippage am Exit (Ticks, Annahme) <input type="number" name="slippageTicks" min="0" max="1000" step="1" value="0"></label>'+
 '<label>Entry <input type="number" name="entryPrice" step="any" required></label>'+
 '<label>SL <input type="number" name="slPrice" step="any" required></label>'+
 '<label>TP <input type="number" name="tpPrice" step="any" required></label>'+
 '<button type="button" data-cmd="quote">Bid/Ask übernehmen</button>'+
 '<button type="submit">Broker-Vorschau berechnen</button>'+
 '<button type="button" data-cmd="drag-plan" aria-pressed="false">↕ SL/TP-Plan am Chart ziehen</button>'+
 '<button type="button" data-cmd="clear-plan">Plan ausblenden</button>'+
 '</form><output id="cs-scenario-result" role="status" aria-live="polite">Nur Schätzung. Keine Brokeränderungen.</output><p id="cs-scenario-portfolio-impact" role="status" aria-live="polite">Portfolio-Gesamtrisiko UNAVAILABLE · Portfolio und Vorschau für dasselbe Konto erforderlich.</p><div class="cs-scenario-ab-actions"><button type="button" id="cs-scenario-save-a">Vorschau in A speichern</button><button type="button" id="cs-scenario-save-b">Vorschau in B speichern</button><button type="button" id="cs-scenario-export" disabled>A/B als JSON exportieren</button></div><p id="cs-scenario-ab-status" role="status" aria-live="polite">Nur lokal gespeicherte, verifizierte Broker-Vorschauen.</p><div id="cs-scenario-ab" aria-label="Gespeicherte What-if A/B-Vergleiche"></div></details>';
 host.parentElement.insertAdjacentElement("beforebegin",panel);
 panel.addEventListener("wheel",e=>e.stopPropagation(),{passive:true});
 const canvas=document.createElement("canvas");canvas.className="cs-beta-canvas";canvas.style.pointerEvents="none";canvas.setAttribute("aria-hidden","true");
 host.style.position="relative";host.appendChild(canvas);
 const coordinates=createChartCoordinates({apiVersion:4,chart,series:candleSeries,scope:{account:accountId,symbol:"XAUUSD",timeframe:tf}});
 s={chart,coordinates,host,canvas,series:candleSeries,emas:emaSeries,panel,toggle,status:panel.querySelector("#cs-beta-message"),
  account:accountId,favorites:normalizeFavorites(get(accountId+":favorite-tools",[])),shortcuts:normalizeShortcuts(get(accountId+":tool-shortcuts",{})),symbol:"XAUUSD",tf,tool:"cursor",begin:null,preview:null,pending:[],selected:null,magnet:false,drag:null,positionDraft:null,positionDraftDrag:null,verifiedPositions:[],positionContext:null,
  lastScenarioPreview:null,portfolio:null,portfolioCapturedAtUtc:null,portfolioLoading:false,portfolioError:"",dataWindow:{snapshot:null,pinned:false},marketQuote:null,
  draw:[],undo:[],redo:[],candles:[],candleSignature:null,positions:[],brokerMarkers:[],scenario:null,validatedScenario:null,planDrag:null,planOriginal:null,planTickSize:null,opts:optsDefault(),extras:{},extraPrefix:null,extraTime:null,extraOptions:null,fibLevels:[...ratios],evidence:{rows:[],cursor:null,query:null,meta:null,loading:false,error:"",generation:0}};
 panel.querySelector("#cs-data-window-pin").addEventListener("click",()=>setDataWindowPin(!s.dataWindow.pinned));
 panel.querySelector("#cs-evidence-load").addEventListener("click",()=>loadEvidence(false));
 panel.querySelector("#cs-evidence-more").addEventListener("click",()=>loadEvidence(true));
 panel.querySelector("#cs-evidence-kind").addEventListener("change",clearEvidence);
 panel.querySelector("#cs-evidence-days").addEventListener("change",clearEvidence);
 renderEvidence();
 panel.querySelector("#cs-portfolio-refresh").addEventListener("click",()=>loadPortfolio(s.account));
 s.coordinates.subscribeCrosshair(handleCrosshair);
 renderToolPreferences();
 try {window.ChartStudioIndicators?.mount({chart,host,panel,account:accountId});}
 catch (err) {console.warn("Chart Studio indicator pane could not load:",err);}
 try {window.ChartStudioCatalog?.mount({panel});}
 catch (err) {console.warn("Chart indicator catalog unavailable:",err);}
 try {window.ChartStudioAverages?.mount({chart,panel,account:accountId});}
 catch (err) {console.warn("Chart Studio average editor unavailable:",err);}
 try{window.ChartStudioAppearance?.mount({chart,candleSeries,panel,account:accountId});}
 catch(err){console.warn("Chart settings unavailable:",err);}
 try{window.ChartStudioOscillators?.mount({chart,host,panel,account:accountId});}
 catch(err){console.warn("Chart oscillator instances unavailable:",err);}
 try{window.ChartStudioChartTypes?.mount({chart,candleSeries,panel,account:accountId});}
 catch(err){console.warn("Chart type editor unavailable:",err);}
 try{window.ChartStudioObjectManager?.mount({panel,
  getItems:()=>s?.draw||[],getSelected:()=>s?.selected,
  operate:operateObject})}catch(err){console.warn("Chart object manager unavailable:",err)}
 try{s.mtfConfluence=window.ChartStudioMTFPanel?.mount({panel,account:accountId,symbol:chartSymbol(),timeframe:tf})||null}
 catch(err){console.warn("MTF-Konfluenz nicht verfügbar:",err)}
 account(accountId,undefined,true);
 try{window.ChartStudioReplay?.mount({panel,account:accountId,timeframe:tf})}
 catch(err){console.warn("Read-only chart replay unavailable:",err)}
 try{window.ChartStudioServerSync?.mount({panel,account:accountId,
   exportDocument:exportWorkspaceDocument,importDocument:importWorkspaceDocument,
   getAccount:()=>s?.account})}catch(err){console.warn("Chart-Workspace-Sync nicht verfügbar:",err)}
 try{window.ChartStudioBrokerPanel?.mount({panel,account:accountId,timeframe:tf})}
 catch(err){console.warn("Broker-Readpanel nicht verfügbar:",err)}
 const openAverages=()=>{
  if(panel.hidden){panel.hidden=false;toggle.setAttribute("aria-expanded","true");}
  maOpen.setAttribute("aria-expanded","true");
  const editor=panel.querySelector(".cs-ma-editor");
  if(editor){editor.scrollIntoView({block:"nearest",behavior:"auto"});editor.querySelector("button")?.focus({preventScroll:true});}
  requestDraw();
 };
 maOpen.addEventListener("click",openAverages);
 maAdd.addEventListener("click",()=>{
  const period=maPeriod.valueAsNumber;
  if(!Number.isInteger(period)||period<1||period>1000){
   maPeriod.setCustomValidity("EMA-Periode muss zwischen 1 und 1000 liegen.");
   maPeriod.reportValidity();return;
  }
  maPeriod.setCustomValidity("");
  if(!window.ChartStudioAverages?.add("EMA",period)){
   openAverages();return;
  }
  openAverages();
 });
 maPeriod.addEventListener("input",()=>maPeriod.setCustomValidity(""));
 maPeriod.addEventListener("keydown",event=>{if(event.key==="Enter"){event.preventDefault();maAdd.click()}});
 toggle.addEventListener("click",()=>{panel.hidden=!panel.hidden;toggle.setAttribute("aria-expanded",String(!panel.hidden));maOpen.setAttribute("aria-expanded",String(!panel.hidden));requestDraw()});
 panel.addEventListener("change",e=>{
  const favorite=e.target.closest("[data-favorite-tool]");
  if(favorite){const tool=favorite.dataset.favoriteTool;s.favorites=favorite.checked?normalizeFavorites([...s.favorites,tool]):s.favorites.filter(item=>item!==tool);save(favoritesKey(),s.favorites);renderToolPreferences();return}
  const shortcut=e.target.closest("[data-shortcut-tool]");
  if(shortcut){
   const tool=shortcut.dataset.shortcutTool,value=shortcut.value.trim().toLowerCase(),effective=effectiveShortcuts(s.shortcuts);
   if(value&&!/^[a-z]$/.test(value)){shortcut.setCustomValidity("Nur ein einzelner Buchstabe ist erlaubt.");shortcut.reportValidity();renderToolPreferences();return}
   if(value&&preferenceTools.some(other=>other!==tool&&effective[other]===value)){shortcut.setCustomValidity("Dieses Kürzel ist bereits vergeben.");shortcut.reportValidity();renderToolPreferences();return}
   shortcut.setCustomValidity("");effective[tool]=value;s.shortcuts=effective;save(shortcutsKey(),s.shortcuts);renderToolPreferences();return
  }
  const input=e.target.closest("[data-bb-setting]");if(!input)return;
  const key=input.dataset.bbSetting,value=key==="bbFill"?input.checked:input.valueAsNumber;
  const valid=key==="bbFill"?typeof value==="boolean":key==="bbPeriod"?Number.isInteger(value)&&value>=2&&value<=300:Number.isFinite(value)&&value>=.1&&value<=10;
  if(!valid){input.setCustomValidity(key==="bbPeriod"?"Periode muss eine Ganzzahl zwischen 2 und 300 sein.":"Wert muss zwischen 0,1 und 10 liegen.");input.reportValidity();showOpts();return}
  input.setCustomValidity("");s.opts[key]=value;save(optKey(),s.opts);showOpts();updateSeries();requestDraw();
 });
 panel.addEventListener("input",e=>{if(e.target.matches("[data-bb-setting]"))e.target.setCustomValidity("")});
 panel.addEventListener("click",e=>{
  const b=e.target.closest("button");if(!b)return;
  if(b.id==="cs-scenario-save-a"){saveScenarioSnapshot("A");return}
  if(b.id==="cs-scenario-save-b"){saveScenarioSnapshot("B");return}
  if(b.id==="cs-scenario-export"){exportScenarioSnapshots();return}
  if(b.dataset.tool){setTool(b.dataset.tool);return}
  if(b.dataset.opt){s.opts[b.dataset.opt]=!s.opts[b.dataset.opt];save(optKey(),s.opts);showOpts();updateSeries();requestDraw();return}
  if(b.dataset.cmd==="fib-default"||b.dataset.cmd==="fib-selected"){
   const levels=window.ChartStudioFib?.parsePercent(panel.querySelector("#cs-fib-levels").value);
   if(!levels){updateMessage("Fibo-Ebenen ungültig: 1–16 streng steigende Prozentwerte zwischen −1000 und 1000; Trennzeichen ;");return}
   if(b.dataset.cmd==="fib-default"){
    s.fibLevels=levels;save(fibKey(),levels);updateMessage("Fibonacci-Vorlage für neue Zeichnungen gespeichert.");
   }else{
    const obj=s.draw[s.selected];
    if(!obj||obj.kind!=="fib"||obj.locked){updateMessage("Zuerst eine ungesperrte Fibo-Zeichnung über ihren Griff auswählen.");return}
    snapshot();obj.levels=levels;persist();updateMessage("Fibonacci-Level geändert. Undo möglich.");
   }
   return;
  }
  if(b.dataset.cmd==="quote")return;
  if(b.dataset.cmd==="drag-plan"){
   if(!s.scenario||!s.planTickSize){updateMessage("Zuerst eine gültige MT5-What-if-Vorschau berechnen.");return}
   setTool(s.tool==="plan"?"cursor":"plan");return;
  }
  if(b.dataset.cmd==="clear-plan"){cancelPlanPreview();s.scenario=null;s.validatedScenario=null;s.planTickSize=null;if(s.tool==="plan")setTool("cursor");requestDraw();const out=panel.querySelector("#cs-scenario-result");if(out)out.textContent="Plan entfernt (keine Brokeraktion).";return}
  if(b.dataset.cmd==="save-png"){
   if(!window.ChartStudioExport){updateMessage("PNG-Export nicht geladen.");return}
   // Ensure pending renderer frames are painted before snapshotting.
   render();
   window.ChartStudioExport.download({chart:s.chart,host:s.host,overlay:s.canvas,account:s.account,timeframe:s.tf})
    .then(()=>updateMessage("Chart-Screenshot lokal als PNG gespeichert."))
    .catch(err=>updateMessage("PNG-Export nicht verfügbar: "+err.message));
   return;
  }
  if(b.dataset.cmd==="save-profile")saveProfile();
  if(b.dataset.cmd==="load-profile")loadProfile();
   if(b.dataset.cmd==="copy-profile")copyProfile();
   if(b.dataset.cmd==="rename-profile")renameProfile();
   if(b.dataset.cmd==="reset-profile")resetChart();
  if(b.dataset.cmd==="delete-profile")deleteProfile();
  if(b.dataset.cmd==="undo")undo();if(b.dataset.cmd==="redo")redo();
   if(b.dataset.cmd==="delete-selected")removeSelected();
   if(b.dataset.cmd==="magnet"){
    s.magnet=!s.magnet;save(magnetKey(),s.magnet);
    b.setAttribute("aria-pressed",String(s.magnet));
    b.textContent="Magnet: "+(s.magnet?"AN":"AUS")+" · Kerzen-OHLC";
    updateMessage(s.magnet?"OHLC-Snap im 12-Pixel-Radius aktiviert.":"Magnet deaktiviert.");
   }
  if(b.dataset.cmd==="clear"&&window.confirm("Zeichnungen für dieses Konto löschen?")){snapshot();s.draw=[];s.selected=null;persist()}
  if(b.dataset.cmd==="export"){const data=JSON.stringify({schemaVersion:1,account:s.account,symbol:chartSymbol(),timeframe:s.tf||"M15",drawings:s.draw},null,2);
   navigator.clipboard?.writeText(data).then(()=>updateMessage("JSON kopiert.")).catch(()=>updateMessage("Kopieren nicht möglich."))}
 });
 const form=panel.querySelector("#cs-scenario-form");
 const output=panel.querySelector("#cs-scenario-result");
 function scope(){return window.location.pathname.startsWith("/stt")?"/stt":""}
 const fields={};for(const name of ["side","volumeLots","lotMode","riskBudget","riskPercent","feesPerLot","slippageTicks","entryPrice","slPrice","tpPrice"])fields[name]=form.elements.namedItem(name);
 form.addEventListener("input",()=>{scenarioGeneration++;s.lastScenarioPreview=null;renderPortfolioImpact(null)});
 fields.lotMode.addEventListener("change",()=>{
  fields.volumeLots.disabled=fields.lotMode.value!=="FIXED";
  fields.riskBudget.disabled=fields.lotMode.value!=="BUDGET";
  fields.riskPercent.disabled=fields.lotMode.value!=="PERCENT";
 });
 form.querySelector('[data-cmd="quote"]').addEventListener("click",async()=>{
  const acc=s.account,nonce=++scenarioGeneration;
  s.lastScenarioPreview=null;renderPortfolioImpact(null);
  setVerifiedMarketQuote(acc,null);
  output.textContent="Verifizierte MT5-Quote wird geladen ...";
  try{
   const activeSymbol=chartSymbol(),response=await fetch(scope()+"/api/chart/v1/quotes?account="+encodeURIComponent(acc)+"&symbol="+encodeURIComponent(activeSymbol),{cache:"no-store"});
   const data=await response.json();
   if(nonce!==scenarioGeneration||acc!==s.account)return;
   if(!response.ok||data.account!==acc||!setVerifiedMarketQuote(acc,data))throw Error(typeof data.detail==="string"?data.detail:"MT5-Daten ungültig.");
   fields.entryPrice.value=fields.side.value==="BUY"?data.ask:data.bid;
   if(Number.isFinite(Number(data.tickSize))&&Number(data.tickSize)>0)s.planTickSize=Number(data.tickSize);
   output.textContent="MT5-Quote übernommen. SL/TP eingeben, Vorschau ist read-only.";
  }catch(e){if(nonce===scenarioGeneration){setVerifiedMarketQuote(acc,null);output.textContent="Quote fehlt: "+e.message}}
 });
 form.addEventListener("submit",async e=>{
  e.preventDefault();const account=s.account,nonce=++scenarioGeneration;
  s.lastScenarioPreview=null;renderPortfolioImpact(null);
  const payload={account,symbol:chartSymbol(),side:fields.side.value,
   volumeLots:fields.lotMode.value==="FIXED"?Number(fields.volumeLots.value):null,
   riskBudget:fields.lotMode.value==="BUDGET"?Number(fields.riskBudget.value):null,
   riskPercent:fields.lotMode.value==="PERCENT"?Number(fields.riskPercent.value):null,
   feesPerLot:Number(fields.feesPerLot.value),slippageTicks:Number(fields.slippageTicks.value),
   entryPrice:Number(fields.entryPrice.value),slPrice:Number(fields.slPrice.value),tpPrice:Number(fields.tpPrice.value)};
  output.textContent="Broker-Vorschau wird berechnet ...";
  const sizeValue=payload.volumeLots??payload.riskBudget??payload.riskPercent;
  if(![sizeValue,payload.entryPrice,payload.slPrice,payload.tpPrice].every(v=>Number.isFinite(v)&&v>0)){
   output.textContent="Bitte gültige Preise und Lotgröße eingeben.";return;
  }
  try{
   const response=await fetch(scope()+"/api/chart/v1/scenarios/preview?account="+encodeURIComponent(account),{
    method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
   const result=await response.json();
   if(nonce!==scenarioGeneration||account!==s.account)return;
   if(!response.ok||result.account!==account||result.symbol!==payload.symbol||result.canExecute!==false){
    const detail=result.detail;throw Error(typeof detail==="string"?detail:detail?.message||"Broker-Rechenfehler");
   }
   const actualLots=Number(result.positionSizing?.volumeLots);
   if(!Number.isFinite(actualLots)||actualLots<=0)throw Error("Broker-Lotgröße fehlt in der verifizierten Vorschau.");
   s.scenario={...payload,volumeLots:actualLots};s.validatedScenario=json(s.scenario);s.lastScenarioPreview={account,symbol:payload.symbol,savedAtUtc:new Date().toISOString(),request:json(payload),result:json(result)};s.planOriginal=null;renderPortfolioImpact(s.lastScenarioPreview);
   if(Number.isFinite(Number(result.tickSize))&&Number(result.tickSize)>0)s.planTickSize=Number(result.tickSize);
   requestDraw();
   const loss=result.pnlAtSl.amount,reward=result.pnlAtTp.amount,cur=result.pnlAtSl.currency;
   const usdFx=result.usdConversion?.state==="AVAILABLE"
    ? " · USD-Brutto SL/Ziel "+result.riskUsd+" / "+result.rewardUsd+" USD"+
      (result.usdConversion.source==="MT5_FX_QUOTE"?" · MT5-FX "+result.usdConversion.symbol+" "+result.usdConversion.quoteTimeUtc+" ("+result.usdConversion.conversionSides.stop+"/"+result.usdConversion.conversionSides.target+")":" · Kontowährung USD")
    : " · USD-Konversion UNAVAILABLE ("+(result.usdConversion?.reason||"Quelle fehlt")+")";
   output.textContent="PLAN · GROSS Stop "+loss+" "+cur+" / Ziel +"+reward+" "+cur+
    " · R:R "+result.riskRewardRatio+" · Lots "+result.positionSizing.volumeLots+
    (result.positionSizing.mode==="FIXED_LOTS"?"":" · Budget "+result.positionSizing.riskBudget+" "+cur+" · GROSS-Risiko nach Slippage "+result.positionSizing.grossStopRisk+" "+cur+" · Gesamtrisiko-Annahme "+result.positionSizing.estimatedTotalStopRisk+" "+cur)+
    " · NETTO-Annahme SL "+result.netEstimate.pnlAtSl.amount+" / TP "+result.netEstimate.pnlAtTp.amount+" "+cur+" · Gebühren "+result.estimatedCosts.feesPerLot+" "+cur+"/Lot Roundtrip · adverse Slippage "+result.estimatedCosts.slippageTicks+" Ticks (User-Annahme)"+
    (result.dailyDrawdownProjection?.state==="AVAILABLE"?" · Tages-DD-Schätzung "+result.dailyDrawdownProjection.projectedLoss+"/"+result.dailyDrawdownProjection.dailyLimit+" "+result.dailyDrawdownProjection.currency+" · Rest "+result.dailyDrawdownProjection.remainingToLimit+" · Quote "+result.dailyDrawdownProjection.quoteTimeUtc+" · EA-Guard UNKNOWN":" · Tages-DD UNAVAILABLE ("+(result.dailyDrawdownProjection?.reason||"Daten fehlen")+") · EA-Guard UNKNOWN")+
    " · Margin "+result.margin.amount+" "+cur+
    usdFx+
    " · Brutto aus MT5, Netto aus User-Annahmen; tatsächliche Gebühren/Swap/Slippage/Gaps können abweichen · KEINE ORDER";
  }catch(err){if(nonce===scenarioGeneration){
    if(s.validatedScenario||s.planOriginal){
     s.scenario=json(s.validatedScenario||s.planOriginal);
     for(const key of ["slPrice","tpPrice"])fields[key].value=String(s.scenario[key]);
     s.planOriginal=null;
    }else{s.scenario=null}
    requestDraw();output.textContent="Nicht verfügbar: "+err.message;
   }}
 });
 canvas.addEventListener("pointerdown",pointerdown);canvas.addEventListener("pointermove",pointermove);
 canvas.addEventListener("pointerup",pointerup);
 canvas.addEventListener("pointercancel",()=>{cancelPlanPreview();s.positionDraftDrag=null;s.drag=null;s.begin=null;s.preview=null;s.pending=[];setTool("cursor")});
 window.addEventListener("keydown",e=>{
  if(!s||e.defaultPrevented)return;
  // Never intercept typing, color/period edits, saved names, or other dashboard inputs.
  const target=e.target;
  if(target?.isContentEditable||target?.closest?.("input, textarea, select, [contenteditable]"))return;
  if(e.key==="Escape"&&s.dataWindow.pinned){clearDataWindowPin();if(s.tool==="cursor")return}
  if(e.key==="Escape"&&s.tool!=="cursor"){
   cancelPlanPreview();s.begin=null;s.preview=null;s.pending=[];s.drag=null;setTool("cursor");return;
  }
  // Drawing shortcuts only apply while the opt-in studio is visible.
  if(s.panel.hidden||e.altKey)return;
  const key=e.key.toLowerCase();
  if((e.ctrlKey||e.metaKey)&&!e.altKey){
   if(key==="z"){e.preventDefault();if(e.shiftKey)redo();else undo()}
   else if(key==="y"){e.preventDefault();redo()}
   return;
  }
  if(e.ctrlKey||e.metaKey||e.shiftKey)return;
  if(e.key==="Delete"||e.key==="Backspace"){
   if(Number.isInteger(s.selected)){e.preventDefault();removeSelected()}
   return;
  }
  const tool=resolveShortcut(e,s.shortcuts);
  if(tool){e.preventDefault();setTool(tool)}
 });
 s.coordinates.subscribeVisibleLogicalRange(()=>requestDraw());
 if(typeof ResizeObserver!=="undefined"){s.observer=new ResizeObserver(requestDraw);s.observer.observe(host)}
 setTool("cursor");showOpts();requestDraw();
}
window.ChartStudioBeta=Object.freeze({mount,account,symbol,timeframe,updateCandles,updatePositions,updateVerifiedPositions,updateBrokerDeals,updatePositionDraft,setPositionDraftTool,refreshDataWindowIndicators,exportDocument:exportWorkspaceDocument,importDocument:importWorkspaceDocument,coordinates:Object.freeze({create:createChartCoordinates}),preferences:Object.freeze({normalizeFavorites,normalizeShortcuts,resolveShortcut}),getLiveMAs,calculations:Object.freeze({sma,bollinger}),getState:()=>s?{account:s.account,symbol:s.symbol,timeframe:s.tf,favorites:json(s.favorites),shortcuts:json(effectiveShortcuts(s.shortcuts)),coordinateApiVersion:s.coordinates.apiVersion,drawings:json(s.draw),options:json(s.opts),brokerMarkers:json(s.brokerMarkers),dataWindow:json(s.dataWindow),verifiedPositions:json(s.verifiedPositions),portfolio:s.portfolio?json(s.portfolio):null,positionContext:s.positionContext?json(s.positionContext):null,positionDraft:s.positionDraft?json(s.positionDraft):null,
 scenario:s.scenario?json(s.scenario):null,tool:s.tool,magnet:s.magnet,selected:s.selected}:null});
})();

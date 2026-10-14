/* 2EAs Chart Studio (BETA, read-only v4 adapter).
   Actual v5, broker-confirmed SL/TP writes and server drawing storage follow PLAN.
   No broker write calls or chart trading mutations in this module. */
(()=>{
"use strict";
const prefix="2eas:studio:beta:", kinds=["cursor","edit","horizontal","vertical","text","trend","rect","fib","ray","ruler","channel","plan","position-draft"];
const ratios=[0,.236,.382,.5,.618,.786,1];
let s=null,requestId=0,scenarioGeneration=0,planTimer=null;
const json=v=>JSON.parse(JSON.stringify(v));
const get=(k,df)=>{try{const v=JSON.parse(localStorage.getItem(prefix+k));return v??df}catch(_){return df}};
const save=(k,v)=>{try{localStorage.setItem(prefix+k,JSON.stringify(v))}catch(_){}};
const optsDefault=()=>({ema20:true,ema50:true,ema200:true,sma20:false,sma50:false,bb:false,bbPeriod:20,bbStdDev:2,bbFill:true,positions:false});
function cleanOptions(raw){const out=optsDefault();if(!raw||typeof raw!=="object"||Array.isArray(raw))return out;
 for(const key of ["ema20","ema50","ema200","sma20","sma50","bb","bbFill","positions"])if(typeof raw[key]==="boolean")out[key]=raw[key];
 if(Number.isInteger(raw.bbPeriod)&&raw.bbPeriod>=2&&raw.bbPeriod<=300)out.bbPeriod=raw.bbPeriod;
 if(typeof raw.bbStdDev==="number"&&Number.isFinite(raw.bbStdDev)&&raw.bbStdDev>=.1&&raw.bbStdDev<=10)out.bbStdDev=raw.bbStdDev;return out}
const drawKey=()=>s.account+":draw:XAUUSD",optKey=()=>s.account+":opts:XAUUSD";
const profileKey=()=>s.account+":profiles:XAUUSD",magnetKey=()=>s.account+":magnet:XAUUSD",fibKey=()=>s.account+":fibLevels:XAUUSD";
const scenarioSnapshotsKey=account=>account+":whatif-snapshots:XAUUSD";
function profiles(){const p=get(profileKey(),{});return p&&typeof p==="object"&&!Array.isArray(p)?p:{}}
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
 all[trimmed]={draw:json(s.draw),opts:json(s.opts),
  indicators:window.ChartStudioIndicators?.settings()||null,
   movingAverages:window.ChartStudioAverages?.getConfigs()||[],
   chartAppearance:window.ChartStudioAppearance?.settings()||{},
   oscillatorInstances:window.ChartStudioOscillators?.settings()||[],
   chartType:window.ChartStudioChartTypes?.current()||"candles"};
 save(profileKey(),all);refreshProfiles();s.panel.querySelector("#cs-beta-profile").value=trimmed;updateMessage("Layout '"+trimmed+"' lokal gesichert.");
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
 all[name]=json(source);save(profileKey(),all);refreshProfiles();s.panel.querySelector("#cs-beta-profile").value=name;
 updateMessage("Layout '"+sourceName+"' als '"+name+"' kopiert.");
}
function renameProfile(){
 const select=s.panel.querySelector("#cs-beta-profile"),oldName=select?.value,all=profiles();
 if(!oldName||!all[oldName]){updateMessage("Zuerst ein gespeichertes Layout wählen.");return}
 const name=checkedProfileName(window.prompt("Neuer Layoutname (max. 40 Zeichen):",oldName));
 if(!name||name===oldName)return;
 if(all[name]){updateMessage("Ein Layout mit diesem Namen existiert bereits.");return}
 all[name]=all[oldName];delete all[oldName];save(profileKey(),all);refreshProfiles();select.value=name;
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
 if(!item)return;snapshot();s.draw=safeDraw(item.draw);s.selected=null;
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
 const all=profiles();delete all[name];save(profileKey(),all);refreshProfiles();updateMessage("Layout gelöscht.");
}
function updateMessage(x){if(s?.status)s.status.textContent=x}
function validSavedPreview(item,account){return item?.schemaVersion===1&&item.account===account&&item.symbol==="XAUUSD"&&item.request?.account===account&&item.request?.symbol==="XAUUSD"&&item.result?.account===account&&item.result?.canExecute===false;}
function renderScenarioSnapshots(){
 if(!s)return;
 const account=s.account,label=account==="goldm15"?"GoldM15":account,host=s.panel.querySelector("#cs-scenario-ab");if(!host)return;
 const stored=get(scenarioSnapshotsKey(account),{}),snapshots={A:null,B:null};
 for(const slot of ["A","B"])if(validSavedPreview(stored?.[slot],account))snapshots[slot]=stored[slot];
 host.replaceChildren();let count=0;
 for(const slot of ["A","B"]){const item=snapshots[slot];if(!item)continue;count++;
  const section=document.createElement("section"),title=document.createElement("h4"),detail=document.createElement("p");
  const mode=item.result.positionSizing?.mode||"UNKNOWN",budget=item.result.positionSizing?.riskBudget;
  title.textContent=""+slot+" · "+(budget==null?mode:"Budget "+budget+" "+(item.result.pnlAtSl?.currency||""));
  const net=item.result.netEstimate,costs=item.result.estimatedCosts,currency=costs?.currency||item.result.pnlAtSl?.currency||"";
  detail.textContent="Lots "+(item.result.positionSizing?.volumeLots??"UNKNOWN")+" · GROSS SL/TP "+(item.result.pnlAtSl?.amount??"UNKNOWN")+" / "+(item.result.pnlAtTp?.amount??"UNKNOWN")+" · NETTO-Annahme SL/TP "+(net?.pnlAtSl?.amount??"UNKNOWN")+" / "+(net?.pnlAtTp?.amount??"UNKNOWN")+" · R:R "+(item.result.riskRewardRatio??"UNKNOWN")+" / Netto "+(net?.riskRewardRatio??"UNKNOWN")+" · Gebührannahme "+(costs?.feesPerLot??"UNKNOWN")+" "+currency+"/Lot; Slippage "+(costs?.slippageTicks??"UNKNOWN")+" Ticks · Margin "+(item.result.margin?.amount??"UNKNOWN")+" "+(item.result.margin?.currency||"")+" · "+item.savedAtUtc;
  section.append(title,detail);host.append(section);
 }
 if(!count){const empty=document.createElement("p");empty.textContent="Keine A/B-Snapshots für "+label+". Erst eine erfolgreiche Broker-Vorschau speichern.";host.append(empty)}
 const exportButton=s.panel.querySelector("#cs-scenario-export");if(exportButton)exportButton.disabled=count===0;
}
function saveScenarioSnapshot(slot){
 const status=s?.panel.querySelector("#cs-scenario-ab-status"),latest=s?.lastScenarioPreview;
 if(!latest||latest.account!==s.account||latest.result?.canExecute!==false){if(status)status.textContent="Bitte erst eine erfolgreiche Broker-Vorschau für dieses Konto berechnen.";return}
 const key=scenarioSnapshotsKey(s.account),stored=get(key,{}),snapshots={A:null,B:null};
 for(const name of ["A","B"])if(validSavedPreview(stored?.[name],s.account))snapshots[name]=stored[name];
 snapshots[slot]={schemaVersion:1,account:s.account,symbol:"XAUUSD",savedAtUtc:latest.savedAtUtc,request:latest.request,result:latest.result};
 try{localStorage.setItem(prefix+key,JSON.stringify(snapshots));if(status)status.textContent=slot+" gespeichert · "+s.account+" · Nur lokaler Snapshot, keine Order.";renderScenarioSnapshots();}
 catch(_){if(status)status.textContent="Lokales Speichern fehlgeschlagen.";}
}
function exportScenarioSnapshots(){
 if(!s)return;
 const account=s.account,key=scenarioSnapshotsKey(account),stored=get(key,{}),snapshots={};
 for(const slot of ["A","B"])if(validSavedPreview(stored?.[slot],account))snapshots[slot]=stored[slot];
 if(!Object.keys(snapshots).length)return;
 const blob=new Blob([JSON.stringify({schemaVersion:1,account,symbol:"XAUUSD",exportedAtUtc:new Date().toISOString(),snapshots},null,2)],{type:"application/json"});
 const url=URL.createObjectURL(blob),anchor=document.createElement("a");
 anchor.href=url;anchor.download="chartstudio-whatif-"+account.replace(/[^A-Za-z0-9_-]/g,"_")+".json";anchor.click();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function sma(c,n){const out=[];let sum=0;for(let i=0;i<c.length;i++){sum+=Number(c[i].close);if(i>=n)sum-=Number(c[i-n].close);if(i>=n-1)out.push({time:c[i].time,value:sum/n})}return out}
function bollinger(c,n=20,k=2){const hi=[],midline=[],lo=[];if(!Number.isInteger(n)||n<1||!Number.isFinite(k)||k<0)return {upper:hi,middle:midline,lower:lo};let sum=0,sq=0;for(let i=0;i<c.length;i++){let v=Number(c[i].close);sum+=v;sq+=v*v;if(i>=n){v=Number(c[i-n].close);sum-=v;sq-=v*v}if(i>=n-1){const mid=sum/n,sd=Math.sqrt(Math.max(0,sq/n-mid*mid));midline.push({time:c[i].time,value:mid});hi.push({time:c[i].time,value:mid+k*sd});lo.push({time:c[i].time,value:mid-k*sd})}}return {upper:hi,middle:midline,lower:lo}}
function safeDraw(list){
 if(!Array.isArray(list))return [];
 const reserved=new Set(list.filter(o=>o&&typeof o.id==="string"&&/^[A-Za-z0-9_-]{1,32}$/.test(o.id)).map(o=>o.id));
 const used=new Set(),allowed=new Set(["kind","anchors","id","label","visible","locked","levels"]);
 let serial=1;const result=[];
 for(const o of list.slice(0,500)){
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
}
function drawBollingerFill(ctx){
 const points=s?.bbData;if(!s?.opts.bb||!s.opts.bbFill||!points?.upper?.length)return;
 const visible=s.chart.timeScale().getVisibleLogicalRange?.(),offset=s.candles.length-points.upper.length;
 const start=Math.max(0,Math.floor(visible?.from??0)-offset-1),end=Math.min(points.upper.length-1,Math.ceil(visible?.to??s.candles.length)+1-offset);
 const upper=[],lower=[];for(let i=start;i<=end;i++){
  const x=s.chart.timeScale().timeToCoordinate(points.upper[i].time),yu=s.series.priceToCoordinate(points.upper[i].value),yl=s.series.priceToCoordinate(points.lower[i].value);
  if(Number.isFinite(x)&&Number.isFinite(yu)&&Number.isFinite(yl)){upper.push([x,yu]);lower.push([x,yl])}
 }
 if(upper.length<2)return;ctx.save();ctx.beginPath();ctx.moveTo(...upper[0]);for(let i=1;i<upper.length;i++)ctx.lineTo(...upper[i]);for(let i=lower.length-1;i>=0;i--)ctx.lineTo(...lower[i]);ctx.closePath();ctx.fillStyle="rgba(185,161,255,.10)";ctx.fill();ctx.restore();
}
function project(anchor){
 let x=null,y=null;
 try{x=s.chart.timeScale().timeToCoordinate(anchor.time);y=s.series.priceToCoordinate(anchor.price)}catch(_){}
 return Number.isFinite(x)&&Number.isFinite(y)?{x,y}:null;
}
function snapAnchor(point){
 if(!s?.magnet||!point)return point;
 const c=window.ChartStudioDrawingGeometry?.nearestSnap(point,s.candles,
 time=>s.chart.timeScale().timeToCoordinate(time),
 price=>s.series.priceToCoordinate(price),12);
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
 if(action==="duplicate"&&s.draw.length>=500){updateMessage("Maximal 500 Objekte.");return false}
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
 const time=s.chart.timeScale().coordinateToTime(x),price=s.series.coordinateToPrice(y);
 return typeof time==="number"&&Number.isFinite(price)&&price>0?{time,price}:null;
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
  const entry=Number(p.price_open),sl=Number(p.sl),tp=Number(p.tp);
  if(!Number.isFinite(entry)||entry<=0)continue;
  const yEntry=s.series.priceToCoordinate(entry);if(!Number.isFinite(yEntry))continue;
  for(const [price,type] of [[sl,"SL"],[tp,"TP"]]){
   if(!Number.isFinite(price)||price<=0)continue;
   const y=s.series.priceToCoordinate(price);if(!Number.isFinite(y))continue;
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
  const y=s.series.priceToCoordinate(price);if(!Number.isFinite(y))continue;
  ctx.strokeStyle=color;ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(d.w-10,y);ctx.stroke();
  ctx.setLineDash([]);ctx.fillRect(d.w*.48-7,y-7,14,14);ctx.fillStyle="#071721";ctx.fillText(leg==="slPrice"?"SL":"TP",d.w*.48-5,y+4);ctx.setLineDash([5,4]);
  ctx.fillStyle=color;ctx.fillText("ENTWURF "+(leg==="slPrice"?"SL ":"TP ")+price.toFixed(draft.digits),5,Math.max(12,Math.min(d.h-4,y-5)));
 }
 ctx.restore();
}
function drawScenario(ctx,d){
 const plan=s.scenario;if(!plan)return;
 const entry=s.series.priceToCoordinate(plan.entryPrice),sl=s.series.priceToCoordinate(plan.slPrice),tp=s.series.priceToCoordinate(plan.tpPrice);
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
 const x=s.chart.timeScale().timeToCoordinate(row.time),y=s.series.priceToCoordinate(row.close);
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
 const sl=s.series.priceToCoordinate(s.scenario.slPrice),tp=s.series.priceToCoordinate(s.scenario.tpPrice);
 const dsl=Number.isFinite(sl)?Math.abs(y-sl):Infinity,dtp=Number.isFinite(tp)?Math.abs(y-tp):Infinity;
 if(Math.min(dsl,dtp)>19)return null;
 return dsl<=dtp?"slPrice":"tpPrice";
}
function findPositionDraftGrip(y){
 if(!s?.positionDraft)return null;
 const points=["slPrice","tpPrice"].map(leg=>({leg,y:s.series.priceToCoordinate(s.positionDraft[leg])})).filter(x=>Number.isFinite(x.y));
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
function account(id){if(!s)return;cancelPlanPreview();s.account=id;s.verifiedPositions=[];s.positionContext=null;s.positionDraft=null;s.positionDraftDrag=null;if(s.tool==="position-draft")setTool("cursor");s.candleSignature=null;s.extraPrefix=null;s.extraTime=null;s.extraOptions=null;s.bbData=null;s.draw=safeDraw(get(drawKey(),[]));s.opts=cleanOptions(get(optKey(),{}));s.undo=[];s.redo=[];s.positions=[];s.brokerMarkers=[];s.scenario=null;s.validatedScenario=null;s.begin=null;s.preview=null;s.drag=null;s.pending=[];s.selected=null;s.magnet=get(magnetKey(),false)===true;
 s.lastScenarioPreview=null;s.marketQuote=null;clearDataWindowPin();
  s.fibLevels=window.ChartStudioFib?.normalizeLevels(get(fibKey(),ratios))||[...ratios];
  const fibInput=s.panel.querySelector("#cs-fib-levels");if(fibInput)fibInput.value=window.ChartStudioFib?.display(s.fibLevels)||"";
  scenarioGeneration++;if(s.tool==="plan")setTool("cursor");
 s.panel.querySelector('[data-cmd="magnet"]')?.setAttribute("aria-pressed",String(s.magnet));
 const mag=s.panel.querySelector('[data-cmd="magnet"]');if(mag)mag.textContent="Magnet: "+(s.magnet?"AN":"AUS")+" · Kerzen-OHLC";
 window.ChartStudioIndicators?.switchAccount(id);
 window.ChartStudioAverages?.switchAccount(id);
 window.ChartStudioAppearance?.switchAccount(id);
 window.ChartStudioOscillators?.switchAccount(id);
 window.ChartStudioChartTypes?.switchAccount(id);
 window.ChartStudioServerSync?.account(id);
 window.ChartStudioBrokerPanel?.setAccount(id);
 window.ChartStudioReplay?.switchContext(id,s.tf);
 renderScenarioSnapshots();
 const scenarioStatus=s.panel.querySelector("#cs-scenario-ab-status");if(scenarioStatus)scenarioStatus.textContent="A/B-Snapshots für "+id+" · lokal · nur verifizierte Vorschauen.";
 showOpts();refreshProfiles();updateSeries();window.ChartStudioObjectManager?.render();requestDraw()}
function timeframe(tf){if(s){cancelPlanPreview();if(s.positionDraft)window.ChartStudioBrokerPanel?.invalidateDraft("Timeframe geändert · Positionsentwurf verworfen.");s.positionDraft=null;s.positionDraftDrag=null;if(s.tool==="position-draft")setTool("cursor");s.tf=tf;s.candleSignature=null;s.extraPrefix=null;s.extraTime=null;s.extraOptions=null;s.begin=null;s.preview=null;s.pending=[];s.selected=null;s.drag=null;if(s.tool==="plan")setTool("cursor");
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
 const valid=data?.account===accountId&&data?.symbol==="XAUUSD"&&data?.source==="MT5_VERIFIED"&&data?.canExecute===false&&/^[A-Z]{3,12}$/.test(data?.currency||"")&&Number.isFinite(bid)&&bid>0&&Number.isFinite(ask)&&ask>=bid&&Number.isFinite(age)&&age>=0&&typeof data?.quoteTimeUtc==="string"&&/(?:Z|\+00:00)$/.test(data.quoteTimeUtc)&&Number.isFinite(Date.parse(data.quoteTimeUtc))&&["FRESH","STALE","FUTURE"].includes(data?.freshness);
 s.marketQuote=valid?{bid,ask,currency:data.currency,quoteTimeUtc:data.quoteTimeUtc,ageSeconds:age,freshness:data.freshness,source:data.source}:null;
 renderDataWindow();return valid;
}
function renderDataWindow(){
 if(!s?.dataWindow)return;const view=s.dataWindow,panel=s.panel;
 panel.querySelector("#cs-data-window-state").textContent=view.pinned?"Angeheftet":"Crosshair";
 panel.querySelector("#cs-data-window-pin").textContent=view.pinned?"Crosshair lösen":"Crosshair anheften";
 const row=view.snapshot,q=s.marketQuote,values={time:row?.timeLabel||"—",open:row?row.open.toFixed(2):"—",high:row?row.high.toFixed(2):"—",low:row?row.low.toFixed(2):"—",close:row?row.close.toFixed(2):"—",source:row?.source||"Chart-Feed · wartet auf Kerze",indicators:row?.indicators||"—",bid:q?q.bid.toFixed(2):"—",ask:q?q.ask.toFixed(2):"—",spread:q?(q.ask-q.bid).toFixed(2):"—","quote-time":q?q.quoteTimeUtc:"—","quote-status":q?q.freshness+" beim Abruf · "+q.ageSeconds.toFixed(1)+"s Broker-Alter beim Abruf · "+q.source:"Noch keine verifizierte Quote"};
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
 if(!envelope||envelope.account!==accountId||envelope.symbol!=="XAUUSD"||envelope.source!=="MT5_VERIFIED"||envelope.canExecute!==false||!/^([A-Z]{3,12})$/.test(envelope.currency)||![0,1,2].includes(envelope.marginMode)||!Array.isArray(envelope.positions)||envelope.positions.length>500){s.verifiedPositions=[];s.positionContext=null;requestDraw();return false}
 const rows=[];
 for(const p of envelope.positions){
  const ticket=String(p?.ticket),revision=p?.revision,side=p?.side||p?.type;
  const values=[p?.price_open,p?.volume,p?.profit,p?.swap].map(Number);
  const optionalPrice=value=>value===null||value===undefined||Number(value)===0||Number.isFinite(Number(value))&&Number(value)>0;
  if(p?.account!==accountId||p?.symbol!=="XAUUSD"||p?.source!=="MT5_VERIFIED"||p?.canExecute!==false||!/^[1-9][0-9]{0,19}$/.test(ticket)||!/^([0-9a-f]{64})$/.test(revision)||!["BUY","SELL"].includes(side)||!values.every(Number.isFinite)||values[0]<=0||values[1]<=0||p?.currency!==envelope.currency||!optionalPrice(p?.sl)||!optionalPrice(p?.tp)){
   s.verifiedPositions=[];s.positionContext=null;requestDraw();return false;
  }
  rows.push({...p,ticket,side,source:"MT5_VERIFIED"});
 }
 const modeLabels={0:"NETTING",1:"EXCHANGE",2:"HEDGING"};
 s.verifiedPositions=rows;s.positionContext={account:accountId,symbol:"XAUUSD",currency:envelope.currency,marginMode:envelope.marginMode,modeLabel:modeLabels[envelope.marginMode],source:envelope.source};requestDraw();return true;
}
function updatePositionDraft(accountId,draft){
 if(!s||s.account!==accountId)return false;
 if(draft===null){s.positionDraft=null;s.positionDraftDrag=null;if(s.tool==="position-draft")setTool("cursor");requestDraw();return true}
 if(draft.symbol!=="XAUUSD"||!/^\d{1,20}$/.test(draft.ticket)||!/^([0-9a-f]{64})$/.test(draft.revision)||!["BUY","SELL"].includes(draft.side)||!Number.isFinite(draft.entryPrice)||draft.entryPrice<=0||!Number.isFinite(draft.tickSize)||draft.tickSize<=0||!Number.isInteger(draft.digits)||draft.digits<0||draft.digits>10)return false;
 s.positionDraft={...draft};s.positionDraftDrag=null;requestDraw();return true;
}
function setPositionDraftTool(accountId){if(!s||s.account!==accountId||!s.positionDraft)return false;setTool("position-draft");return true}
function updateBrokerDeals(accountId,deals){
 if(!s||s.account!==accountId)return {plotted:0,unplotted:0};
 const entries=new Set(["IN","OUT","INOUT","OUT_BY"]),bars=new Set(s.candles.map(c=>Number(c.time)));
 s.brokerMarkers=(Array.isArray(deals)?deals:[]).flatMap(deal=>{
  const fillTimeUtcMs=deal?.fillTime?.utcEpochMs,price=Number(deal?.price),ticket=deal?.ticket;
  if(deal?.account!==accountId||deal?.symbol!=="XAUUSD"||deal?.source!=="MT5_VERIFIED"||deal?.canExecute!==false||deal?.status!=="EXECUTED"||!(["BUY","SELL"].includes(deal?.side))||!entries.has(deal?.entry)||!Number.isSafeInteger(fillTimeUtcMs)||fillTimeUtcMs<=0||!Number.isFinite(price)||price<=0||typeof ticket!=="string"||!/^[1-9][0-9]{0,19}$/.test(ticket))return [];
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
  '<div class="cs-beta-buttons">'+toolLabels.map(([id,label])=>'<button type="button" data-tool="'+id+'">'+label+'</button>').join("")+
  ["undo","redo","delete-selected","export","save-png","clear"].map(id=>'<button type="button" data-cmd="'+id+'">'+({undo:"↶ Undo",redo:"↷ Redo","delete-selected":"Ausgewählte löschen",export:"JSON kopieren","save-png":"Bild (PNG) speichern",clear:"Alle Zeichnungen löschen"}[id])+'</button>').join("")+'</div>'+
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
 '<details class="cs-scenario"><summary>What-if · Broker-Risiko &amp; Margin (kein Orderversand)</summary>'+
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
 '</form><output id="cs-scenario-result" role="status" aria-live="polite">Nur Schätzung. Keine Brokeränderungen.</output><div class="cs-scenario-ab-actions"><button type="button" id="cs-scenario-save-a">Vorschau in A speichern</button><button type="button" id="cs-scenario-save-b">Vorschau in B speichern</button><button type="button" id="cs-scenario-export" disabled>A/B als JSON exportieren</button></div><p id="cs-scenario-ab-status" role="status" aria-live="polite">Nur lokal gespeicherte, verifizierte Broker-Vorschauen.</p><div id="cs-scenario-ab" aria-label="Gespeicherte What-if A/B-Vergleiche"></div></details>';
 host.parentElement.insertAdjacentElement("beforebegin",panel);
 const canvas=document.createElement("canvas");canvas.className="cs-beta-canvas";canvas.style.pointerEvents="none";canvas.setAttribute("aria-hidden","true");
 host.style.position="relative";host.appendChild(canvas);
 s={chart,host,canvas,series:candleSeries,emas:emaSeries,panel,toggle,status:panel.querySelector("#cs-beta-message"),
  account:accountId,tf,tool:"cursor",begin:null,preview:null,pending:[],selected:null,magnet:false,drag:null,positionDraft:null,positionDraftDrag:null,verifiedPositions:[],positionContext:null,
  lastScenarioPreview:null,dataWindow:{snapshot:null,pinned:false},marketQuote:null,
  draw:[],undo:[],redo:[],candles:[],candleSignature:null,positions:[],brokerMarkers:[],scenario:null,validatedScenario:null,planDrag:null,planOriginal:null,planTickSize:null,opts:optsDefault(),extras:{},extraPrefix:null,extraTime:null,extraOptions:null,fibLevels:[...ratios]};
 panel.querySelector("#cs-data-window-pin").addEventListener("click",()=>setDataWindowPin(!s.dataWindow.pinned));
 chart.subscribeCrosshairMove(handleCrosshair);
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
 account(accountId);
 try{window.ChartStudioReplay?.mount({panel,account:accountId,timeframe:tf})}
 catch(err){console.warn("Read-only chart replay unavailable:",err)}
 try{window.ChartStudioServerSync?.mount({panel,account:accountId,
   exportDocument:exportWorkspaceDocument,importDocument:importWorkspaceDocument,
   getAccount:()=>s?.account})}catch(err){console.warn("Chart-Workspace-Sync nicht verfügbar:",err)}
 try{window.ChartStudioBrokerPanel?.mount({panel,account:accountId})}
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
  if(b.dataset.cmd==="export"){const data=JSON.stringify({schemaVersion:1,account:s.account,symbol:"XAUUSD",drawings:s.draw},null,2);
   navigator.clipboard?.writeText(data).then(()=>updateMessage("JSON kopiert.")).catch(()=>updateMessage("Kopieren nicht möglich."))}
 });
 const form=panel.querySelector("#cs-scenario-form");
 const output=panel.querySelector("#cs-scenario-result");
 function scope(){return window.location.pathname.startsWith("/stt")?"/stt":""}
 const fields={};for(const name of ["side","volumeLots","lotMode","riskBudget","riskPercent","feesPerLot","slippageTicks","entryPrice","slPrice","tpPrice"])fields[name]=form.elements.namedItem(name);
 form.addEventListener("input",()=>{scenarioGeneration++;s.lastScenarioPreview=null});
 fields.lotMode.addEventListener("change",()=>{
  fields.volumeLots.disabled=fields.lotMode.value!=="FIXED";
  fields.riskBudget.disabled=fields.lotMode.value!=="BUDGET";
  fields.riskPercent.disabled=fields.lotMode.value!=="PERCENT";
 });
 form.querySelector('[data-cmd="quote"]').addEventListener("click",async()=>{
  const acc=s.account,nonce=++scenarioGeneration;
  s.lastScenarioPreview=null;
  setVerifiedMarketQuote(acc,null);
  output.textContent="Verifizierte MT5-Quote wird geladen ...";
  try{
   const response=await fetch(scope()+"/api/chart/v1/quotes?account="+encodeURIComponent(acc)+"&symbol=XAUUSD",{cache:"no-store"});
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
  s.lastScenarioPreview=null;
  const payload={account,symbol:"XAUUSD",side:fields.side.value,
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
   if(!response.ok||result.account!==account||result.canExecute!==false){
    const detail=result.detail;throw Error(typeof detail==="string"?detail:detail?.message||"Broker-Rechenfehler");
   }
   const actualLots=Number(result.positionSizing?.volumeLots);
   if(!Number.isFinite(actualLots)||actualLots<=0)throw Error("Broker-Lotgröße fehlt in der verifizierten Vorschau.");
   s.scenario={...payload,volumeLots:actualLots};s.validatedScenario=json(s.scenario);s.lastScenarioPreview={account,symbol:"XAUUSD",savedAtUtc:new Date().toISOString(),request:json(payload),result:json(result)};s.planOriginal=null;
   if(Number.isFinite(Number(result.tickSize))&&Number(result.tickSize)>0)s.planTickSize=Number(result.tickSize);
   requestDraw();
   const loss=result.pnlAtSl.amount,reward=result.pnlAtTp.amount,cur=result.pnlAtSl.currency;
   output.textContent="PLAN · GROSS Stop "+loss+" "+cur+" / Ziel +"+reward+" "+cur+
    " · R:R "+result.riskRewardRatio+" · Lots "+result.positionSizing.volumeLots+
    (result.positionSizing.mode==="FIXED_LOTS"?"":" · Budget "+result.positionSizing.riskBudget+" "+cur+" · GROSS-Risiko nach Slippage "+result.positionSizing.grossStopRisk+" "+cur+" · Gesamtrisiko-Annahme "+result.positionSizing.estimatedTotalStopRisk+" "+cur)+
    " · NETTO-Annahme SL "+result.netEstimate.pnlAtSl.amount+" / TP "+result.netEstimate.pnlAtTp.amount+" "+cur+" · Gebühren "+result.estimatedCosts.feesPerLot+" "+cur+"/Lot Roundtrip · adverse Slippage "+result.estimatedCosts.slippageTicks+" Ticks (User-Annahme)"+
    " · Margin "+result.margin.amount+" "+cur+
    (cur==="USD"?"":" · USD-Konversion nicht verfügbar")+
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
  const hotkeys={v:"cursor",e:"edit",h:"horizontal",t:"trend",r:"rect",
   f:"fib",c:"channel",m:"ruler"};
  if(hotkeys[key]){e.preventDefault();setTool(hotkeys[key])}
 });
 chart.timeScale().subscribeVisibleLogicalRangeChange(requestDraw);
 if(typeof ResizeObserver!=="undefined"){s.observer=new ResizeObserver(requestDraw);s.observer.observe(host)}
 setTool("cursor");showOpts();requestDraw();
}
window.ChartStudioBeta=Object.freeze({mount,account,timeframe,updateCandles,updatePositions,updateVerifiedPositions,updateBrokerDeals,updatePositionDraft,setPositionDraftTool,refreshDataWindowIndicators,exportDocument:exportWorkspaceDocument,importDocument:importWorkspaceDocument,calculations:Object.freeze({sma,bollinger}),getState:()=>s?{account:s.account,drawings:json(s.draw),options:json(s.opts),brokerMarkers:json(s.brokerMarkers),dataWindow:json(s.dataWindow),verifiedPositions:json(s.verifiedPositions),positionContext:s.positionContext?json(s.positionContext):null,positionDraft:s.positionDraft?json(s.positionDraft):null,
 scenario:s.scenario?json(s.scenario):null,tool:s.tool,magnet:s.magnet,selected:s.selected}:null});
})();

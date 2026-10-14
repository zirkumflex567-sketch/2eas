/* Chart Studio multi-instance moving averages (opt-in, no broker writes).
 * Independent LWC-v4 adapter; calculations and validation are renderer-agnostic.
 */
(()=>{
"use strict";
const TYPES=Object.freeze(["EMA","SMA","WMA","RMA","SMMA"]);
const SOURCES=Object.freeze(["close","open","high","low","hl2","hlc3","ohlc4"]);
const PALETTE=Object.freeze(["#68dfff","#f5c66d","#e9a0ff","#7eebac","#ff858a","#9caaff"]);
const MAX_INSTANCES=16,MAX_PERIOD=1000,STORE_PREFIX="2eas:studio:averages:v1:";
const copy=value=>JSON.parse(JSON.stringify(value));
const isHex=value=>typeof value==="string"&&/^#[0-9a-fA-F]{6}$/.test(value);
function normalize(raw){
 if(!raw||typeof raw!=="object"||Array.isArray(raw))return null;
 const allowed=["id","type","period","source","color","lineWidth","visible","label","displayShift"];
 if(Object.keys(raw).some(k=>!allowed.includes(k)))return null;
 if(typeof raw.id!=="string"||!/^[a-zA-Z0-9_-]{1,32}$/.test(raw.id))return null;
 if(!TYPES.includes(raw.type)||!SOURCES.includes(raw.source))return null;
 if(!Number.isInteger(raw.period)||raw.period<1||raw.period>MAX_PERIOD)return null;
 const displayShift=raw.displayShift===undefined?0:raw.displayShift;
 if(!Number.isInteger(displayShift)||displayShift < -500||displayShift > 500)return null;
 if(!isHex(raw.color)||!Number.isInteger(raw.lineWidth)||raw.lineWidth<1||raw.lineWidth>4||
  typeof raw.visible!=="boolean")return null;
 if(typeof raw.label!=="string"||raw.label.length>40||/[\u0000-\u001f]/.test(raw.label))return null;
 return {id:raw.id,type:raw.type,period:raw.period,source:raw.source,
  color:raw.color.toLowerCase(),lineWidth:raw.lineWidth,visible:raw.visible,label:raw.label,displayShift};
}
function normalizeList(data){
 if(!Array.isArray(data)||data.length>MAX_INSTANCES)return null;
 const ids=new Set(),output=[];
 for(const raw of data){
  const item=normalize(raw);
  if(!item||ids.has(item.id))return null;
  ids.add(item.id);output.push(item);
 }
 return output;
}
function rows(input){
 if(!Array.isArray(input))return [];
 const seen=new Set(),output=[];
 for(const bar of input){
  if(!bar||!Number.isSafeInteger(bar.time)||bar.time<=0||seen.has(bar.time))continue;
  if(!["open","high","low","close"].every(k=>Number.isFinite(bar[k])&&bar[k]>0))continue;
  seen.add(bar.time);output.push(bar);
 }
 output.sort((a,b)=>a.time-b.time);
 return output;
}
function valueFrom(bar,source){
 switch(source){
  case "open":return bar.open;
  case "high":return bar.high;
  case "low":return bar.low;
  case "hl2":return (bar.high+bar.low)/2;
  case "hlc3":return (bar.high+bar.low+bar.close)/3;
  case "ohlc4":return (bar.open+bar.high+bar.low+bar.close)/4;
  default:return bar.close;
 }
}
function calculate(input,type,period,source="close"){
 if(!TYPES.includes(type)||!SOURCES.includes(source)||!Number.isInteger(period)||
    period<1||period>MAX_PERIOD)return [];
 const bars=rows(input),result=[];
 if(bars.length<period)return result;
 let sum=0,weighted=0,previous=null;
 for(let i=0;i<bars.length;i++){
  const value=valueFrom(bars[i],source);
  if(type==="EMA"){
   previous=previous===null?value:previous+(2/(period+1))*(value-previous);
   if(i>=period-1)result.push({time:bars[i].time,value:previous});
   continue;
  }
  if(type==="RMA"||type==="SMMA"){
   if(i<period)sum+=value;
   if(i===period-1)previous=sum/period;
   else if(i>=period)previous+=(value-previous)/period;
   if(i>=period-1)result.push({time:bars[i].time,value:previous});
   continue;
  }
  if(i<period){
   sum+=value;
   if(type==="WMA")weighted+=(i+1)*value;
  }else{
   const dropped=valueFrom(bars[i-period],source);
   if(type==="WMA")weighted=weighted-sum+period*value;
   sum+=value-dropped;
  }
  if(i>=period-1){
   const averaged=type==="SMA"?sum/period:weighted/(period*(period+1)/2);
   result.push({time:bars[i].time,value:averaged});
  }
 }
 return result;
}
function shiftDisplay(bars,points,shift=0){
 if(!Array.isArray(bars)||!Array.isArray(points)||!Number.isInteger(shift)||shift < -500||shift > 500)return [];
 if(shift===0)return points;
 const values=new Map(points.map(point=>[point.time,point.value])),result=[];
 for(let target=0;target<bars.length;target++){
  const source=target-shift;if(source<0||source>=bars.length)continue;
  const value=values.get(bars[source].time);if(value!==undefined)result.push({time:bars[target].time,value});
 }
 return result;
}
function defaults(){return []}
function restore(account){
 try{
  const value=JSON.parse(localStorage.getItem(STORE_PREFIX+account+":XAUUSD")||"null");
  return normalizeList(value)||defaults();
 }catch(_){return defaults()}
}
let state=null;
function getConfigs(){return state?copy(state.configs):[]}
function readout(time){
 if(!state)return "";
 return (state.readouts.get(Number(time))||[]).join(" · ");
}
function announce(msg){if(state)state.message.textContent=msg}
function persist(){
 if(!state)return;
 try{localStorage.setItem(STORE_PREFIX+state.account+":XAUUSD",JSON.stringify(state.configs))}
 catch(_){announce("Browser-Speicher nicht verfügbar. Layout im Serverprofil sichern.")}
}
function keyFor(cfg){return [cfg.type,cfg.period,cfg.source].join(":")}
function refreshSeries(){
 if(!state)return;
 const desired=new Set(state.configs.map(x=>x.id));
 for(const [id,series] of state.series){
  if(desired.has(id))continue;
  state.chart.removeSeries(series);state.series.delete(id);state.loaded.delete(id);
 }
 const cache=state.cache;
 if(cache.size>48)cache.clear();
 for(const cfg of state.configs){
  let series=state.series.get(cfg.id);
  const title=cfg.label.trim()||cfg.type+" "+cfg.period+" · "+cfg.source;
  if(!series){
   series=state.chart.addLineSeries({title,color:cfg.color,lineWidth:cfg.lineWidth,
      visible:cfg.visible,lastValueVisible:true,priceLineVisible:false});
   state.series.set(cfg.id,series);
  }else series.applyOptions({title,color:cfg.color,lineWidth:cfg.lineWidth,visible:cfg.visible});
  // Hiding is handled by native visibility. Do not erase buffered history.
  if(!cfg.visible)continue;
  const cacheKey=keyFor(cfg);
  const dataKey=String(state.signature)+":"+cacheKey+":"+cfg.displayShift;
  // A styling-only edit must never resend 1000+ historical points.
  if(state.loaded.get(cfg.id)===dataKey)continue;
  if(!cache.has(cacheKey))cache.set(cacheKey,calculate(state.bars,cfg.type,cfg.period,cfg.source));
  series.setData(shiftDisplay(state.bars,cache.get(cacheKey),cfg.displayShift));
  state.loaded.set(cfg.id,dataKey);
  state.dataWrites++;
 }
 const readouts=new Map();
 for(const cfg of state.configs){
  if(!cfg.visible)continue;
  const points=shiftDisplay(state.bars,cache.get(keyFor(cfg))||calculate(state.bars,cfg.type,cfg.period,cfg.source),cfg.displayShift);
  const byTime=new Map(points.map(point=>[point.time,point.value]));
  const label=cfg.label.trim()||cfg.type+" "+cfg.period;
  for(let targetIndex=0;targetIndex<state.bars.length;targetIndex++){
   const bar=state.bars[targetIndex],rows=readouts.get(bar.time)||[],value=byTime.get(bar.time);
   let text;
   if(value!==undefined)text=label+" "+value.toFixed(2);
   else{
    const sourceIndex=targetIndex-cfg.displayShift;
    text=sourceIndex<0||sourceIndex>=state.bars.length?
     label+" · Anzeigeversatz außerhalb geladener Kerzen":label+" · Warm-up";
   }
   rows.push(text);readouts.set(bar.time,rows);
  }
 }
 state.readouts=readouts;
}
function optionsSelect(values,value,aria,field,id){
 const sel=document.createElement("select");sel.dataset.field=field;sel.dataset.id=id;
 sel.setAttribute("aria-label",aria);
 for(const item of values){
  const opt=document.createElement("option");opt.value=String(item);opt.textContent=String(item);
  sel.append(opt);
 }
 sel.value=String(value);return sel;
}
function input(type,value,label,field,id,extra={}){
 const result=document.createElement("input");result.type=type;result.dataset.id=id;result.dataset.field=field;
 result.setAttribute("aria-label",label);
 if(type==="checkbox")result.checked=value;
 else result.value=String(value);
 for(const [key,val] of Object.entries(extra))result.setAttribute(key,String(val));
 return result;
}
function redrawEditor(){
 if(!state)return;
 state.items.replaceChildren();
 for(const cfg of state.configs){
  const row=document.createElement("div");row.className="cs-ma-instance";row.dataset.instance=cfg.id;
  const enabled=input("checkbox",cfg.visible,"Linie anzeigen","visible",cfg.id);
  const type=optionsSelect(TYPES,cfg.type,"Durchschnittstyp","type",cfg.id);
  const period=input("number",cfg.period,"Periode","period",cfg.id,{min:1,max:MAX_PERIOD,step:1});
  const displayShift=input("number",cfg.displayShift,"Anzeigeversatz in Kerzen","displayShift",cfg.id,{min:-500,max:500,step:1});
  const src=optionsSelect(SOURCES,cfg.source,"Preisquelle","source",cfg.id);
  const color=input("color",cfg.color,"Linienfarbe","color",cfg.id);
  const weight=optionsSelect([1,2,3,4],cfg.lineWidth,"Linienstärke","lineWidth",cfg.id);
  const name=input("text",cfg.label,"Eigener Linienname","label",cfg.id,{maxlength:40,placeholder:"Name (optional)"});
  for(const [text,control] of [["Sichtbar",enabled],["Typ",type],["Periode",period],["Versatz (Kerzen)",displayShift],
   ["Quelle",src],["Farbe",color],["Breite",weight],["Name",name]]){
   const label=document.createElement("label");label.textContent=text;label.append(control);row.append(label);
  }
  for(const [act,text] of [["duplicate","Duplizieren"],["remove","Entfernen"]]){
   const button=document.createElement("button");button.type="button";button.textContent=text;
   button.dataset.action=act;button.dataset.id=cfg.id;row.append(button);
  }
  state.items.append(row);
 }
 state.count.textContent=state.configs.length+" / "+MAX_INSTANCES+" Linien";
}
function applySettings(raw){
 if(!state)return false;
 const cleaned=normalizeList(raw);
 if(!cleaned){announce("Layout abgelehnt: ungültige Moving-Average-Konfiguration.");return false}
 state.configs=cleaned;persist();redrawEditor();refreshSeries();
 window.ChartStudioBeta?.refreshDataWindowIndicators();
 return true;
}
function newId(){
 let i=1;const occupied=new Set(state.configs.map(x=>x.id));
 while(occupied.has("ma"+i))i++;
 return "ma"+i;
}
function add(type="EMA",period=21){
 if(!state)return false;
 if(state.configs.length>=MAX_INSTANCES){announce("Maximal "+MAX_INSTANCES+" Durchschnittslinien.");return false}
 const cfg=normalize({id:newId(),type,period,source:"close",
  color:PALETTE[state.configs.length%PALETTE.length],lineWidth:2,visible:true,label:""});
 state.configs.push(cfg);persist();redrawEditor();refreshSeries();
 window.ChartStudioBeta?.refreshDataWindowIndicators();
 announce("Neue "+type+" "+period+" hinzugefügt.");
 return true;
}
function edit(id,field,value){
 if(!state)return false;
 const i=state.configs.findIndex(x=>x.id===id);if(i<0)return false;
 const next={...state.configs[i],[field]:value};
 const checked=normalize(next);
 if(!checked){announce("Ungültiger Wert. Erlaubt sind Perioden 1–"+MAX_PERIOD+".");redrawEditor();return false}
 state.configs[i]=checked;persist();redrawEditor();refreshSeries();
 window.ChartStudioBeta?.refreshDataWindowIndicators();
 return true;
}
function remove(id){
 if(!state)return false;
 const i=state.configs.findIndex(x=>x.id===id);if(i<0)return false;
 state.configs.splice(i,1);persist();redrawEditor();refreshSeries();
 window.ChartStudioBeta?.refreshDataWindowIndicators();return true;
}
function updateBars(bars){
 if(!state||!Array.isArray(bars))return;
 const last=bars[bars.length-1]||{};
 const first=bars[0]||{};
 const signature=window.ChartStudioDataSignature?.signature(bars)||
  [bars.length,first.time,last.time,last.open,last.high,last.low,last.close].join("|");
 if(signature===state.signature)return;
 state.signature=signature;state.bars=rows(bars);state.cache.clear();
 refreshSeries();
 window.ChartStudioBeta?.refreshDataWindowIndicators();
}
function switchAccount(account){
 if(!state)return;
 // Remove all series before loading a different account, even when IDs overlap.
 for(const series of state.series.values())state.chart.removeSeries(series);
 state.series.clear();state.loaded.clear();
 state.account=account;state.bars=[];state.signature=null;state.cache.clear();
 state.configs=restore(account);redrawEditor();refreshSeries();
 window.ChartStudioBeta?.refreshDataWindowIndicators();
}
function mount({chart,panel,account="titan"}){
 if(state||!chart||!panel)return;
 const root=document.createElement("section");root.className="cs-ma-editor";
 const heading=document.createElement("div");heading.className="cs-ma-header";
 const title=document.createElement("strong");title.textContent="INDIKATOREN-LABOR · MULTI-MA";
 const counter=document.createElement("span");heading.append(title,counter);
 const info=document.createElement("p");
 info.textContent="Eigene EMA/SMA/WMA/RMA/SMMA-Linien: Typ, Periode, Preisquelle, Farbe, Dicke und Name. Bestehende EMA20/50/200 bleiben separat steuerbar.";
 const commands=document.createElement("div");commands.className="cs-ma-presets";
 for(const [type,period,label] of [["EMA",21,"+ EMA 21"],["EMA",50,"+ EMA 50"],
  ["EMA",200,"+ EMA 200"],["SMA",20,"+ SMA 20"],["WMA",20,"+ WMA 20"]]){
  const b=document.createElement("button");b.type="button";b.textContent=label;
  b.addEventListener("click",()=>add(type,period));commands.append(b);
 }
 const instances=document.createElement("div");instances.className="cs-ma-items";
 const message=document.createElement("p");message.className="cs-ma-message";
 message.setAttribute("role","status");message.setAttribute("aria-live","polite");
 root.append(heading,info,commands,instances,message);
 panel.append(root);
 state={chart,root,count:counter,items:instances,message,account,configs:restore(account),readouts:new Map(),
  bars:[],signature:null,series:new Map(),cache:new Map(),loaded:new Map(),dataWrites:0};
 instances.addEventListener("change",event=>{
  const target=event.target,id=target?.dataset?.id,field=target?.dataset?.field;
  if(!id||!field)return;
  const value=field==="visible"?target.checked:
   ["period","lineWidth","displayShift"].includes(field)?Number(target.value):target.value;
  edit(id,field,value);
 });
 instances.addEventListener("click",event=>{
  const b=event.target.closest("button[data-action]");if(!b)return;
  const id=b.dataset.id;
  if(b.dataset.action==="remove")remove(id);
  else if(b.dataset.action==="duplicate"){
   const cfg=state.configs.find(x=>x.id===id);
   if(cfg&&state.configs.length<MAX_INSTANCES){
    const newCfg={...cfg,id:newId()};state.configs.push(newCfg);
    persist();redrawEditor();refreshSeries();
    window.ChartStudioBeta?.refreshDataWindowIndicators();
   }else announce("Maximal "+MAX_INSTANCES+" Linien.");
  }
 });
 redrawEditor();refreshSeries();
}
window.ChartStudioAverages=Object.freeze({mount,updateBars,switchAccount,getConfigs,
 applySettings,add,edit,remove,calculate,readout,normalize,normalizeList,MAX_INSTANCES,shiftDisplay,
 diagnostics:()=>state?{account:state.account,dataWrites:state.dataWrites,seriesCount:state.series.size}:null});
})();

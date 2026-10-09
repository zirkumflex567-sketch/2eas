/* 2EAs Chart Studio (BETA, read-only v4 adapter).
   Actual v5, broker-confirmed SL/TP writes and server drawing storage follow PLAN.
   No broker write calls or chart trading mutations in this module. */
(()=>{
"use strict";
const prefix="2eas:studio:beta:", kinds=["cursor","edit","horizontal","trend","rect","fib","ray","ruler","channel","plan"];
const ratios=[0,.236,.382,.5,.618,.786,1];
let s=null,requestId=0,scenarioGeneration=0,planTimer=null;
const json=v=>JSON.parse(JSON.stringify(v));
const get=(k,df)=>{try{const v=JSON.parse(localStorage.getItem(prefix+k));return v??df}catch(_){return df}};
const save=(k,v)=>{try{localStorage.setItem(prefix+k,JSON.stringify(v))}catch(_){}};
const optsDefault=()=>({ema20:true,ema50:true,ema200:true,sma20:false,sma50:false,bb:false,positions:false});
const drawKey=()=>s.account+":draw:XAUUSD",optKey=()=>s.account+":opts:XAUUSD";
const profileKey=()=>s.account+":profiles:XAUUSD",magnetKey=()=>s.account+":magnet:XAUUSD";
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
function loadProfile(){
 const name=s.panel.querySelector("#cs-beta-profile")?.value;const item=profiles()[name];
 if(!item)return;snapshot();s.draw=safeDraw(item.draw);s.selected=null;
 s.opts={...optsDefault(),...(item.opts||{})};persist();save(optKey(),s.opts);showOpts();updateSeries();
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
 snapshot();s.draw=drawings;s.selected=null;s.opts={...optsDefault(),...(document.options||{})};
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
function sma(c,n){const out=[];let sum=0;for(let i=0;i<c.length;i++){sum+=Number(c[i].close);if(i>=n)sum-=Number(c[i-n].close);if(i>=n-1)out.push({time:c[i].time,value:sum/n})}return out}
function bollinger(c,n=20,k=2){const hi=[],lo=[];let sum=0,sq=0;for(let i=0;i<c.length;i++){let v=Number(c[i].close);sum+=v;sq+=v*v;if(i>=n){v=Number(c[i-n].close);sum-=v;sq-=v*v}if(i>=n-1){const mid=sum/n,sd=Math.sqrt(Math.max(0,sq/n-mid*mid));hi.push({time:c[i].time,value:mid+k*sd});lo.push({time:c[i].time,value:mid-k*sd})}}return {upper:hi,lower:lo}}
function safeDraw(list){
 if(!Array.isArray(list))return [];
 const reserved=new Set(list.filter(o=>o&&typeof o.id==="string"&&/^[A-Za-z0-9_-]{1,32}$/.test(o.id)).map(o=>o.id));
 const used=new Set(),allowed=new Set(["kind","anchors","id","label","visible","locked"]);
 let serial=1;const result=[];
 for(const o of list.slice(0,500)){
  if(!window.ChartStudioDrawingGeometry?.validDrawing(o)||
   Object.keys(o).some(k=>!allowed.has(k)))continue;
  if(o.id!==undefined&&(typeof o.id!=="string"||
   !/^[A-Za-z0-9_-]{1,32}$/.test(o.id)||used.has(o.id)))continue;
  if(o.label!==undefined&&(typeof o.label!=="string"||o.label.length>40||
   /[\u0000-\u001f]/.test(o.label)))continue;
  if(o.visible!==undefined&&typeof o.visible!=="boolean")continue;
  if(o.locked!==undefined&&typeof o.locked!=="boolean")continue;
  let id=o.id;
  if(!id){do{id="obj_"+serial++}while(reserved.has(id)||used.has(id))}
  used.add(id);
  result.push({kind:o.kind,anchors:o.anchors.map(p=>({time:p.time,price:p.price})),
   id,label:o.label||"",visible:o.visible!==false,locked:o.locked===true});
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
 s.canvas.style.cursor=kind==="edit"?"grab":kind==="plan"?"ns-resize":"crosshair";
 s.panel.querySelector('[data-cmd="drag-plan"]')?.setAttribute("aria-pressed",String(kind==="plan"));
 s.panel.querySelectorAll("[data-tool]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.tool===kind)));
 window.ChartStudioObjectManager?.render();
 updateMessage(kind==="cursor"?"Navigation":kind==="edit"?"Griff anklicken und ziehen":kind==="horizontal"?"Preislinie: einmal klicken":kind==="plan"?"PLAN: SL oder TP am Chart ziehen · nur Broker-Vorschau":"Zwei Anker setzen · Esc abbrechen");
 requestDraw();
}
function showOpts(){
 s.panel.querySelectorAll("[data-opt]").forEach(b=>b.setAttribute("aria-pressed",String(!!s.opts[b.dataset.opt])));
}
function updateSeries(){
 if(!s)return;
 s.emas.forEach((ser,i)=>{if(ser)ser.applyOptions({visible:!!s.opts[["ema20","ema50","ema200"][i]]})});
 if(!s.candles.length)return;
 const conf=[["sma20","SMA20","#76e9a8"],["sma50","SMA50","#ffb675"],["bbUpper","BB+","#b9a1ff"],["bbLower","BB-","#b9a1ff"]];
 for(const [id,name,color] of conf)if(!s.extras[id])s.extras[id]=s.chart.addLineSeries({title:name,color,lineWidth:1,lastValueVisible:false,priceLineVisible:false});
 const latest=s.candles[s.candles.length-1];
 const optionKey=[s.opts.sma20,s.opts.sma50,s.opts.bb].join(":");
 const prefix=window.ChartStudioDataSignature?.signature(s.candles.slice(0,-1));
 const increment=!!prefix&&prefix===s.extraPrefix&&
  latest.time===s.extraTime&&optionKey===s.extraOptions&&s.candles.length>=50;
 if(increment){
  const lastSma=n=>{
   let sum=0;for(let i=s.candles.length-n;i<s.candles.length;i++)sum+=Number(s.candles[i].close);
   return sum/n;
  };
  if(s.opts.sma20)s.extras.sma20.update({time:latest.time,value:lastSma(20)});
  if(s.opts.sma50)s.extras.sma50.update({time:latest.time,value:lastSma(50)});
  if(s.opts.bb){
   const mid=lastSma(20);let variance=0;
   for(let i=s.candles.length-20;i<s.candles.length;i++)
    variance+=(Number(s.candles[i].close)-mid)**2;
   const deviation=Math.sqrt(variance/20);
   s.extras.bbUpper.update({time:latest.time,value:mid+2*deviation});
   s.extras.bbLower.update({time:latest.time,value:mid-2*deviation});
  }
  return;
 }
 s.extraPrefix=prefix;s.extraTime=latest.time;s.extraOptions=optionKey;
 const bb=s.opts.bb?bollinger(s.candles):null;
 for(const [key,option,data] of [
  ["sma20","sma20",s.opts.sma20?sma(s.candles,20):[]],
  ["sma50","sma50",s.opts.sma50?sma(s.candles,50):[]],
  ["bbUpper","bb",bb?bb.upper:[]],["bbLower","bb",bb?bb.lower:[]]]){
  s.extras[key].applyOptions({visible:!!s.opts[option]});
  s.extras[key].setData(data);
 }
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
 if(b&&o.kind==="trend"){ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke()}
 if(b&&o.kind==="rect"){ctx.fillRect(a.x,a.y,b.x-a.x,b.y-a.y);ctx.strokeRect(a.x,a.y,b.x-a.x,b.y-a.y)}
 if(b&&o.kind==="fib"){for(const k of ratios){const y=a.y+(b.y-a.y)*k;ctx.strokeStyle=k===.618?"#f7c874":"#8da8f9";
 ctx.beginPath();ctx.moveTo(Math.min(a.x,b.x),y);ctx.lineTo(d.w-2,y);ctx.stroke();ctx.fillStyle="#f7f8ff";ctx.font="11px monospace";ctx.fillText(String(k),Math.max(3,d.w-45),y-3)}}
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
 const fmt=n=>Number(n).toFixed(2);
 for(const p of s.positions.slice(0,30)){
  const entry=Number(p.open_price),sl=Number(p.sl_price),tp=Number(p.tp_price);
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
  ctx.fillStyle="#f8fcff";ctx.font="11px monospace";ctx.fillText((p.type||"")+" #"+p.ticket+" @ "+fmt(entry),5,Math.max(12,Math.min(d.h-5,yEntry-4)));
 }
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
function render(){
 if(!s)return;const d=dims();if(!d)return;
 const c=s.canvas,ratio=Math.min(2,window.devicePixelRatio||1);
 c.style.left=d.left+"px";c.style.top=d.top+"px";c.style.width=d.w+"px";c.style.height=d.h+"px";
 const pw=Math.ceil(d.w*ratio),ph=Math.ceil(d.h*ratio);if(c.width!==pw||c.height!==ph){c.width=pw;c.height=ph}
 const ctx=c.getContext("2d");ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,d.w,d.h);
 if(s.opts.positions)drawPositions(ctx,d);
 if(s.scenario)drawScenario(ctx,d);
 for(let i=0;i<s.draw.length;i++)drawObject(ctx,{...s.draw[i],selected:i===s.selected},d);
 if(s.pending.length&&s.preview)drawObject(ctx,{kind:s.tool,anchors:[...s.pending,s.preview],preview:true},d);
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
function closestHandle(x,y){for(let i=s.draw.length-1;i>=0;i--){if(s.draw[i].locked||s.draw[i].visible===false)continue;for(let j=0;j<s.draw[i].anchors.length;j++){const p=project(s.draw[i].anchors[j]);if(p&&Math.hypot(p.x-x,p.y-y)<11)return {i,j}}}return null}
function pointerdown(e){
 if(!s||s.tool==="cursor"||e.button!==0)return;
 const {x,y}=xy(e),raw=unproject(x,y);if(!raw)return;
 const p=s.tool==="plan"?raw:snapAnchor(raw);
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
 if(s.tool==="horizontal"){snapshot();s.draw.push({kind:s.tool,anchors:[p]});persist();return}
 const required=window.ChartStudioDrawingGeometry?.expected(s.tool)||2;
 if(!s.pending.length){s.begin=p;s.pending=[p];s.preview=p;updateMessage("Nächsten Anker setzen · Esc bricht ab.");}
 else{
  s.pending.push(p);
  if(s.pending.length>=required){
   snapshot();s.draw.push({kind:s.tool,anchors:s.pending.map(point=>({...point}))});
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
  const tick=s.planTickSize;
  const value=Number((Math.round(p.price/tick)*tick).toFixed(8));
  const next={...s.scenario,[s.planDrag]:value};
  if(!validScenario(next)){s.panel.querySelector("#cs-scenario-result").textContent="PLAN ungültig: SL/TP liegt auf der falschen Entry-Seite.";return}
  s.scenario=next;
  s.panel.querySelector("#cs-scenario-form").elements.namedItem(s.planDrag).value=String(value);
  s.panel.querySelector("#cs-scenario-result").textContent="PLAN-VORSCHAU · USD-Risiko wird vom Broker neu berechnet … KEINE ORDER";
  previewPlan();requestDraw();return;
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
 if(!s.drag)return;s.drag=null;persist();try{s.canvas.releasePointerCapture(e.pointerId)}catch(_){}
}
function account(id){if(!s)return;cancelPlanPreview();s.account=id;s.candleSignature=null;s.extraPrefix=null;s.extraTime=null;s.extraOptions=null;s.draw=safeDraw(get(drawKey(),[]));s.opts={...optsDefault(),...get(optKey(),{})};s.undo=[];s.redo=[];s.positions=[];s.scenario=null;s.validatedScenario=null;s.begin=null;s.preview=null;s.drag=null;s.pending=[];s.selected=null;s.magnet=get(magnetKey(),false)===true;scenarioGeneration++;if(s.tool==="plan")setTool("cursor");
 s.panel.querySelector('[data-cmd="magnet"]')?.setAttribute("aria-pressed",String(s.magnet));
 const mag=s.panel.querySelector('[data-cmd="magnet"]');if(mag)mag.textContent="Magnet: "+(s.magnet?"AN":"AUS")+" · Kerzen-OHLC";
 window.ChartStudioIndicators?.switchAccount(id);
 window.ChartStudioAverages?.switchAccount(id);
 window.ChartStudioAppearance?.switchAccount(id);
 window.ChartStudioOscillators?.switchAccount(id);
 window.ChartStudioChartTypes?.switchAccount(id);
 window.ChartStudioServerSync?.account(id);
 showOpts();refreshProfiles();updateSeries();window.ChartStudioObjectManager?.render();requestDraw()}
function timeframe(tf){if(s){cancelPlanPreview();s.tf=tf;s.candleSignature=null;s.extraPrefix=null;s.extraTime=null;s.extraOptions=null;s.begin=null;s.preview=null;s.pending=[];s.selected=null;s.drag=null;if(s.tool==="plan")setTool("cursor");
 window.ChartStudioIndicators?.updateBars([]);
  window.ChartStudioOscillators?.updateBars([]);
  window.ChartStudioChartTypes?.updateBars([]);
  window.ChartStudioAverages?.updateBars([]);
 requestDraw()}}
function updateCandles(c){if(s&&Array.isArray(c)){
  const sig=window.ChartStudioDataSignature?.signature(c);
  if(sig&&sig===s.candleSignature)return;
  s.candleSignature=sig;s.candles=c;updateSeries();
 window.ChartStudioIndicators?.updateBars(c);
  window.ChartStudioOscillators?.updateBars(c);
  window.ChartStudioChartTypes?.updateBars(c);
  window.ChartStudioAverages?.updateBars(c);
 requestDraw()}}
function updatePositions(accountId,positions){if(s&&s.account===accountId){s.positions=Array.isArray(positions)?positions:[];requestDraw()}}
function mount({chart,host,candleSeries,emaSeries,account:accountId="titan",timeframe:tf="M15"}){
 if(s||!chart||!host||!candleSeries)return;
 const card=host.closest(".glass-card");if(!card)return;
 const toggle=document.createElement("button");toggle.id="cs-beta-toggle";toggle.type="button";
 toggle.textContent="✎ Chart Studio · Beta";toggle.className="cs-beta-toggle";
 toggle.setAttribute("aria-expanded","false");toggle.setAttribute("aria-controls","cs-beta-panel");
 const expand=card.querySelector("#stone-chart-expand-btn");if(expand)expand.insertAdjacentElement("afterend",toggle);
 else card.prepend(toggle);
 const panel=document.createElement("section");panel.id="cs-beta-panel";panel.className="cs-beta-panel";panel.hidden=true;
 const toolLabels=[["cursor","Navigation"],["edit","Griffe bearbeiten"],["horizontal","Preislinie"],["trend","Trendlinie"],["ray","Strahl"],["rect","Zone"],["channel","Parallelkanal"],["fib","Fibonacci"],["ruler","Preis-/Zeitmessung"]];
 const optLabels=[["ema20","EMA20"],["ema50","EMA50"],["ema200","EMA200"],["sma20","SMA20"],["sma50","SMA50"],["bb","Bollinger20"],["positions","Positionen & SL/TP"]];
 panel.innerHTML=
  '<div class="cs-beta-head"><strong>CHART STUDIO · EXPERIMENTELL</strong><span>Keine Handelsausführung</span></div>'+
  '<div class="cs-beta-buttons">'+toolLabels.map(([id,label])=>'<button type="button" data-tool="'+id+'">'+label+'</button>').join("")+
  ["undo","redo","delete-selected","export","clear"].map(id=>'<button type="button" data-cmd="'+id+'">'+({undo:"↶ Undo",redo:"↷ Redo","delete-selected":"Ausgewählte löschen",export:"JSON kopieren",clear:"Alle Zeichnungen löschen"}[id])+'</button>').join("")+'</div>'+
  '<div class="cs-beta-buttons"><button type="button" data-cmd="magnet" aria-pressed="false">Magnet: AUS · Kerzen-OHLC</button></div>'+
 '<div class="cs-beta-buttons">'+optLabels.map(([id,label])=>'<button type="button" data-opt="'+id+'">'+label+'</button>').join("")+'</div>'+
  '<div class="cs-beta-profiles"><strong>Lokale Layouts</strong> <select id="cs-beta-profile" aria-label="Gespeichertes Chartlayout"></select>'+
 '<button type="button" data-cmd="save-profile">Speichern</button>'+
 '<button type="button" data-cmd="load-profile">Laden</button>'+
 '<button type="button" data-cmd="delete-profile">Löschen</button></div>'+
 '<p id="cs-beta-message" role="status" aria-live="polite">Dies ist die sichere Beta-Chartansicht. Alle Brokerpositionen sind nur lesbar.</p>'+
 '<details class="cs-scenario"><summary>What-if · Broker-Risiko &amp; Margin (kein Orderversand)</summary>'+
 '<form id="cs-scenario-form">'+
 '<label>Seite <select name="side"><option>BUY</option><option>SELL</option></select></label>'+
 '<label>Lots <input type="number" name="volumeLots" min="0.01" step="0.01" value="0.01" required></label>'+
 '<label>Entry <input type="number" name="entryPrice" step="any" required></label>'+
 '<label>SL <input type="number" name="slPrice" step="any" required></label>'+
 '<label>TP <input type="number" name="tpPrice" step="any" required></label>'+
 '<button type="button" data-cmd="quote">Bid/Ask übernehmen</button>'+
 '<button type="submit">Broker-Vorschau berechnen</button>'+
 '<button type="button" data-cmd="drag-plan" aria-pressed="false">↕ SL/TP-Plan am Chart ziehen</button>'+
 '<button type="button" data-cmd="clear-plan">Plan ausblenden</button>'+
 '</form><output id="cs-scenario-result" role="status" aria-live="polite">Nur Schätzung. Keine Brokeränderungen.</output></details>';
 host.parentElement.insertAdjacentElement("beforebegin",panel);
 const canvas=document.createElement("canvas");canvas.className="cs-beta-canvas";canvas.style.pointerEvents="none";canvas.setAttribute("aria-hidden","true");
 host.style.position="relative";host.appendChild(canvas);
 s={chart,host,canvas,series:candleSeries,emas:emaSeries,panel,toggle,status:panel.querySelector("#cs-beta-message"),
  account:accountId,tf,tool:"cursor",begin:null,preview:null,pending:[],selected:null,magnet:false,drag:null,
  draw:[],undo:[],redo:[],candles:[],candleSignature:null,positions:[],scenario:null,validatedScenario:null,planDrag:null,planOriginal:null,planTickSize:null,opts:optsDefault(),extras:{},extraPrefix:null,extraTime:null,extraOptions:null};
 try {window.ChartStudioIndicators?.mount({chart,host,panel,account:accountId});}
 catch (err) {console.warn("Chart Studio indicator pane could not load:",err);}
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
 try{window.ChartStudioServerSync?.mount({panel,account:accountId,
   exportDocument:exportWorkspaceDocument,importDocument:importWorkspaceDocument,
   getAccount:()=>s?.account})}catch(err){console.warn("Chart-Workspace-Sync nicht verfügbar:",err)}
 toggle.addEventListener("click",()=>{panel.hidden=!panel.hidden;toggle.setAttribute("aria-expanded",String(!panel.hidden));requestDraw()});
 panel.addEventListener("click",e=>{
  const b=e.target.closest("button");if(!b)return;
  if(b.dataset.tool){setTool(b.dataset.tool);return}
  if(b.dataset.opt){s.opts[b.dataset.opt]=!s.opts[b.dataset.opt];save(optKey(),s.opts);showOpts();updateSeries();requestDraw();return}
  if(b.dataset.cmd==="quote")return;
  if(b.dataset.cmd==="drag-plan"){
   if(!s.scenario||!s.planTickSize){updateMessage("Zuerst eine gültige MT5-What-if-Vorschau berechnen.");return}
   setTool(s.tool==="plan"?"cursor":"plan");return;
  }
  if(b.dataset.cmd==="clear-plan"){cancelPlanPreview();s.scenario=null;s.validatedScenario=null;s.planTickSize=null;if(s.tool==="plan")setTool("cursor");requestDraw();const out=panel.querySelector("#cs-scenario-result");if(out)out.textContent="Plan entfernt (keine Brokeraktion).";return}
  if(b.dataset.cmd==="save-profile")saveProfile();
  if(b.dataset.cmd==="load-profile")loadProfile();
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
 const fields={};for(const name of ["side","volumeLots","entryPrice","slPrice","tpPrice"])fields[name]=form.elements.namedItem(name);
 form.querySelector('[data-cmd="quote"]').addEventListener("click",async()=>{
  const acc=s.account,nonce=++scenarioGeneration;
  output.textContent="Verifizierte MT5-Quote wird geladen ...";
  try{
   const response=await fetch(scope()+"/api/chart/v1/quotes?account="+encodeURIComponent(acc)+"&symbol=XAUUSD",{cache:"no-store"});
   const data=await response.json();
   if(nonce!==scenarioGeneration||acc!==s.account)return;
   if(!response.ok||data.account!==acc)throw Error(typeof data.detail==="string"?data.detail:"MT5-Daten ungültig.");
   fields.entryPrice.value=fields.side.value==="BUY"?data.ask:data.bid;
   if(Number.isFinite(Number(data.tickSize))&&Number(data.tickSize)>0)s.planTickSize=Number(data.tickSize);
   output.textContent="MT5-Quote übernommen. SL/TP eingeben, Vorschau ist read-only.";
  }catch(e){if(nonce===scenarioGeneration)output.textContent="Quote fehlt: "+e.message}
 });
 form.addEventListener("submit",async e=>{
  e.preventDefault();const account=s.account,nonce=++scenarioGeneration;
  const payload={account,symbol:"XAUUSD",side:fields.side.value,
   volumeLots:Number(fields.volumeLots.value),entryPrice:Number(fields.entryPrice.value),
   slPrice:Number(fields.slPrice.value),tpPrice:Number(fields.tpPrice.value)};
  output.textContent="Broker-Vorschau wird berechnet ...";
  if(![payload.volumeLots,payload.entryPrice,payload.slPrice,payload.tpPrice].every(v=>Number.isFinite(v)&&v>0)){
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
   s.scenario=payload;s.validatedScenario=json(payload);s.planOriginal=null;
   if(Number.isFinite(Number(result.tickSize))&&Number(result.tickSize)>0)s.planTickSize=Number(result.tickSize);
   requestDraw();
   const loss=result.pnlAtSl.amount,reward=result.pnlAtTp.amount,cur=result.pnlAtSl.currency;
   output.textContent="PLAN · Stop "+loss+" "+cur+" / Ziel +"+reward+" "+cur+
    " · R:R "+result.riskRewardRatio+" · Margin "+result.margin.amount+" "+cur+
    (cur==="USD"?"":" · USD-Konversion nicht verfügbar")+
    " · GROSS vor Gebühren/Slippage · KEINE ORDER";
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
 canvas.addEventListener("pointercancel",()=>{cancelPlanPreview();s.drag=null;s.begin=null;s.preview=null;s.pending=[];setTool("cursor")});
 window.addEventListener("keydown",e=>{if(s&&e.key==="Escape"&&s.tool!=="cursor"){
  cancelPlanPreview();s.begin=null;s.preview=null;s.pending=[];s.drag=null;setTool("cursor")
 }});
 chart.timeScale().subscribeVisibleLogicalRangeChange(requestDraw);
 if(typeof ResizeObserver!=="undefined"){s.observer=new ResizeObserver(requestDraw);s.observer.observe(host)}
 setTool("cursor");showOpts();requestDraw();
}
window.ChartStudioBeta=Object.freeze({mount,account,timeframe,updateCandles,updatePositions,calculations:Object.freeze({sma,bollinger}),getState:()=>s?{account:s.account,drawings:json(s.draw),options:json(s.opts),
 scenario:s.scenario?json(s.scenario):null,tool:s.tool,magnet:s.magnet,selected:s.selected}:null});
})();
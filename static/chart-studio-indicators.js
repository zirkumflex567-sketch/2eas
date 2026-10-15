/* 2EAs Chart Studio — independent, read-only indicator calculation and pane adapter.
 * LWC v4 compatibility layer. Never reads MT5 credentials or places orders.
 * Incremental chart migration to v5 must replace only this adapter, not indicator math.
 */
(()=>{
"use strict";
const REGISTRY=Object.freeze({
 rsi:{name:"RSI (Wilder)",type:"oscillator",period:14,min:2,max:200},
 macd:{name:"MACD",type:"oscillator",fast:12,slow:26,signal:9},
 atr:{name:"ATR (Wilder)",type:"oscillator",period:14,min:2,max:200},
 volume:{name:"Volumen (Tick/Real)",type:"histogram",upColor:"#41cce9",downColor:"#f7758b"},
 adx:{name:"ADX +DI / −DI (Wilder)",type:"oscillator",period:14,min:2,max:200},
 stochastic:{name:"Stochastic %K/%D",type:"oscillator",period:14,smoothK:3,smoothD:3,min:2,max:200},
 vwap:{name:"Session-VWAP (Volumenproxy)",type:"overlay",timeZone:"UTC",sessionStart:"00:00"}
});
const storagePrefix="2eas:studio:indicators:v1:";
const finite=x=>Number.isFinite(Number(x))?Number(x):null;
function validateBars(input){
 if(!Array.isArray(input))return[];
 return input.filter(x=>x&&Number.isFinite(+x.time)&&Number.isFinite(+x.close) &&
 Number.isFinite(+x.high)&&Number.isFinite(+x.low)&&Number.isFinite(+x.open))
 .map(x=>({time:+x.time,open:+x.open,high:+x.high,low:+x.low,close:+x.close,
 tick_volume:Math.max(0,finite(x.tick_volume)||0),real_volume:Math.max(0,finite(x.real_volume)||0)}))
 .sort((a,b)=>a.time-b.time).filter((x,i,arr)=>i===0||x.time!==arr[i-1].time);
}
function ema(values,period){
 const out=new Array(values.length).fill(null),factor=2/(period+1);let previous=null;
 for(let i=0;i<values.length;i++){
  const v=finite(values[i]);if(v===null)continue;
  previous=previous===null?v:previous+factor*(v-previous);
  if(i>=period-1)out[i]=previous;
 }
 return out;
}
function rsi(input,period=14){
 const bars=validateBars(input),out=[];period=Math.trunc(period);
 if(period<2||period>200||bars.length<=period)return out;
 let up=0,down=0;
 for(let i=1;i<=period;i++){const change=bars[i].close-bars[i-1].close;up+=Math.max(change,0);down+=Math.max(-change,0)}
 up/=period;down/=period;
 function value(g,l){if(g===0&&l===0)return 50;if(l===0)return 100;if(g===0)return 0;return 100-100/(1+g/l)}
 out.push({time:bars[period].time,value:value(up,down)});
 for(let i=period+1;i<bars.length;i++){
  const change=bars[i].close-bars[i-1].close;
  up=(up*(period-1)+Math.max(change,0))/period;
  down=(down*(period-1)+Math.max(-change,0))/period;
  out.push({time:bars[i].time,value:value(up,down)});
 }
 return out;
}
function stochastic(input,period=14,smoothK=3,smoothD=3){
 const bars=validateBars(input),stochK=[],stochD=[];
 period=Math.trunc(period);smoothK=Math.trunc(smoothK);smoothD=Math.trunc(smoothD);
 if(period<2||period>200||smoothK<1||smoothK>100||smoothD<1||smoothD>100)return {stochK,stochD};
 const raw=[];
 for(let i=period-1;i<bars.length;i++){
  let highest=-Infinity,lowest=Infinity;
  for(let j=i-period+1;j<=i;j++){highest=Math.max(highest,bars[j].high);lowest=Math.min(lowest,bars[j].low)}
  raw.push({time:bars[i].time,value:highest===lowest?50:100*(bars[i].close-lowest)/(highest-lowest)});
 }
 let sum=0;
 for(let i=0;i<raw.length;i++){
  sum+=raw[i].value;if(i>=smoothK)sum-=raw[i-smoothK].value;
  if(i>=smoothK-1)stochK.push({time:raw[i].time,value:sum/smoothK});
 }
 sum=0;
 for(let i=0;i<stochK.length;i++){
  sum+=stochK[i].value;if(i>=smoothD)sum-=stochK[i-smoothD].value;
  if(i>=smoothD-1)stochD.push({time:stochK[i].time,value:sum/smoothD});
 }
 return {stochK,stochD};
}
function trueRange(bars,i){const b=bars[i],previous=bars[i-1]?.close;
 return Math.max(b.high-b.low,
  previous===undefined?0:Math.abs(b.high-previous),
  previous===undefined?0:Math.abs(b.low-previous));}
function atr(input,period=14){
 const bars=validateBars(input),out=[];period=Math.trunc(period);
 if(period<2||period>200||bars.length<period)return out;
 let mean=0;for(let i=0;i<period;i++)mean+=trueRange(bars,i);
 mean/=period;out.push({time:bars[period-1].time,value:mean});
 for(let i=period;i<bars.length;i++){
  mean=(mean*(period-1)+trueRange(bars,i))/period;
  out.push({time:bars[i].time,value:mean});
 }
 return out;
}
function macd(input,fast=12,slow=26,signal=9){
 const bars=validateBars(input);fast=Math.trunc(fast);slow=Math.trunc(slow);signal=Math.trunc(signal);
 if(fast<2||slow<=fast||slow>300||signal<2||signal>200)return {macd:[],signal:[],histogram:[]};
 const values=bars.map(b=>b.close),f=ema(values,fast),sl=ema(values,slow);
 const out={macd:[],signal:[],histogram:[]};let smooth=null,ready=0;
 for(let i=0;i<bars.length;i++){
  if(f[i]===null||sl[i]===null)continue;
  const value=f[i]-sl[i];out.macd.push({time:bars[i].time,value});
  ready++;smooth=smooth===null?value:smooth+2/(signal+1)*(value-smooth);
  if(ready<signal)continue;
  out.signal.push({time:bars[i].time,value:smooth});
  out.histogram.push({time:bars[i].time,value:value-smooth,
    color:value>=smooth?"rgba(66,213,178,.75)":"rgba(249,107,126,.75)"});
 }
 return out;
}
function volumes(input,settings={}){
 const validColor=value=>typeof value==="string"&&/^#[0-9a-fA-F]{6}$/.test(value)?value.toLowerCase():null;
 const upColor=validColor(settings.upColor)||"#41cce9";
 const downColor=validColor(settings.downColor)||"#f7758b";
 return validateBars(input).map(b=>({time:b.time,value:b.real_volume>0?b.real_volume:b.tick_volume,
  color:b.close>=b.open?upColor:downColor,
  kind:b.real_volume>0?"real":"tick"}));
}
function adx(input,period=14){
 const bars=validateBars(input),out={adx:[],plusDi:[],minusDi:[]};
 period=Math.trunc(period);
 if(period<2||period>200||bars.length<=period)return out;
 const tr=[],pDM=[],mDM=[];
 for(let i=1;i<bars.length;i++){
  const a=bars[i],b=bars[i-1],up=a.high-b.high,down=b.low-a.low;
  tr[i]=trueRange(bars,i);pDM[i]=up>down&&up>0?up:0;
  mDM[i]=down>up&&down>0?down:0;
 }
 let trSum=0,pSum=0,mSum=0;
 for(let i=1;i<=period;i++){trSum+=tr[i];pSum+=pDM[i];mSum+=mDM[i]}
 const dxFirst=[];let average=null;
 for(let i=period;i<bars.length;i++){
  if(i>period){
   trSum=trSum-trSum/period+tr[i];
   pSum=pSum-pSum/period+pDM[i];
   mSum=mSum-mSum/period+mDM[i];
  }
  const pdi=trSum>0?100*pSum/trSum:0,mdi=trSum>0?100*mSum/trSum:0;
  const total=pdi+mdi,dx=total>0?100*Math.abs(pdi-mdi)/total:0;
  out.plusDi.push({time:bars[i].time,value:pdi});
  out.minusDi.push({time:bars[i].time,value:mdi});
  if(dxFirst.length<period){
   dxFirst.push(dx);
   if(dxFirst.length===period){
    average=dxFirst.reduce((acc,v)=>acc+v,0)/period;
    out.adx.push({time:bars[i].time,value:average});
   }
  }else{
   average=(average*(period-1)+dx)/period;
   out.adx.push({time:bars[i].time,value:average});
  }
 }
 return out;
}
function sessionConfig(settings={}){
 const timeZone=settings.timeZone??"UTC",sessionStart=settings.sessionStart??"00:00";
 if(typeof timeZone!=="string"||timeZone.length>64||typeof sessionStart!=="string"||!/^([01]\d|2[0-3]):[0-5]\d$/.test(sessionStart))return null;
 try{new Intl.DateTimeFormat("en-CA",{timeZone}).format(new Date(0))}catch(_){return null}
 const [hour,minute]=sessionStart.split(":").map(Number);
 return {timeZone,sessionStart,minutes:hour*60+minute,formatter:new Intl.DateTimeFormat("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"})};
}
function vwap(input,settings={}){
 // OTC XAUUSD/FX tick_volume is a weighted-price PROXY, not exchange orderflow.
 // Session reset follows the selected wall-clock time and IANA timezone.
 const config=sessionConfig(settings);if(!config)return[];
 const bars=validateBars(input),out=[];
 let session=null,sumPV=0,sumVolume=0;
 for(const b of bars){
  const parts=Object.fromEntries(config.formatter.formatToParts(new Date(b.time*1000)).map(p=>[p.type,p.value]));
  const y=Number(parts.year),m=Number(parts.month),day=Number(parts.day),minute=Number(parts.hour)*60+Number(parts.minute);
  const sessionDay=new Date(Date.UTC(y,m-1,day)-(minute<config.minutes?86400000:0));
  const key=sessionDay.toISOString().slice(0,10);
  if(key!==session){session=key;sumPV=0;sumVolume=0}
  const volume=b.real_volume>0?b.real_volume:b.tick_volume;
  if(volume<=0)continue;
  const typical=(b.high+b.low+b.close)/3;
  sumPV+=typical*volume;sumVolume+=volume;
  out.push({time:b.time,value:sumPV/sumVolume});
 }
 return out;
}
function calc(kind,candles,settings={}){
 if(kind==="rsi")return {rsi:rsi(candles,settings.period||14)};
 if(kind==="atr")return {atr:atr(candles,settings.period||14)};
 if(kind==="macd")return macd(candles,settings.fast||12,settings.slow||26,settings.signal||9);
 if(kind==="volume")return {volume:volumes(candles,settings)};
 if(kind==="adx")return adx(candles,settings.period||14);
 if(kind==="stochastic")return stochastic(candles,settings.period||14,settings.smoothK||3,settings.smoothD||3);
 if(kind==="vwap")return {vwap:vwap(candles,settings)};
 throw Error("Unknown indicator: "+kind);
}
function defaults(){
 return {rsi:{enabled:false,period:14},macd:{enabled:false,fast:12,slow:26,signal:9},
  atr:{enabled:false,period:14},volume:{enabled:false,upColor:"#41cce9",downColor:"#f7758b"},adx:{enabled:false,period:14},
  stochastic:{enabled:false,period:14,smoothK:3,smoothD:3},vwap:{enabled:false,timeZone:"UTC",sessionStart:"00:00"}};
}
function restore(account){
 try{const raw=JSON.parse(localStorage.getItem(storagePrefix+account)||"null");
  const result=defaults();
  if(raw&&typeof raw==="object")for(const id of Object.keys(REGISTRY)){
   if(raw[id]&&typeof raw[id]==="object"){
    result[id].enabled=raw[id].enabled===true;
    for(const prop of ["period","fast","slow","signal","smoothK","smoothD"]){
     const minimum=prop==="smoothK"||prop==="smoothD"?1:2,maximum=prop==="slow"?300:prop==="smoothK"||prop==="smoothD"?100:200;
     if(Object.hasOwn(result[id],prop)&&Number.isInteger(raw[id][prop])&&raw[id][prop]>=minimum&&raw[id][prop]<=maximum)
      result[id][prop]=raw[id][prop];
    }
    if(id==="volume")for(const prop of ["upColor","downColor"])
     if(typeof raw[id][prop]==="string"&&/^#[0-9a-fA-F]{6}$/.test(raw[id][prop]))result[id][prop]=raw[id][prop].toLowerCase();
    if(id==="vwap"){const config=sessionConfig(raw[id]);if(config){result.vwap.timeZone=config.timeZone;result.vwap.sessionStart=config.sessionStart}}
   }
  }
  return result;
 }catch(_){return defaults()}
}
let state=null;
function settings(){return state?JSON.parse(JSON.stringify(state.settings)):defaults()}
function persist(){try{localStorage.setItem(storagePrefix+state.account,JSON.stringify(state.settings))}catch(_){}}
function box(kind){
 const cfg=REGISTRY[kind],settings=state.settings[kind];
 const row=document.createElement("label");row.className="cs-indicator-control";
 const chk=document.createElement("input");chk.type="checkbox";chk.checked=settings.enabled;
 chk.setAttribute("aria-label",cfg.name+" anzeigen");chk.dataset.kind=kind;
 const name=document.createElement("strong");name.textContent=cfg.name;
 row.append(chk,name);
 for(const prop of kind==="volume"?["upColor","downColor"]:[]){
  const label=document.createElement("span");label.textContent=prop==="upColor"?"Aufwärtsfarbe":"Abwärtsfarbe";
  const input=document.createElement("input");input.type="color";input.value=settings[prop];input.dataset.parameter=prop;input.dataset.kind=kind;
  input.setAttribute("aria-label",cfg.name+": "+label.textContent);row.append(label,input);
 }
 if(kind==="vwap")for(const [prop,labelText] of [["timeZone","IANA-Zeitzone"],["sessionStart","Sessionstart (HH:MM)"]]){
  const label=document.createElement("span");label.textContent=labelText;
  const input=document.createElement("input");input.type="text";input.value=settings[prop];input.dataset.parameter=prop;input.dataset.kind=kind;
  input.setAttribute("aria-label",cfg.name+": "+labelText);label.append(input);row.append(label);
 }
 for(const prop of ["period","fast","slow","signal","smoothK","smoothD"]){
  if(!Object.hasOwn(cfg,prop))continue;
  const label=document.createElement("span");label.textContent=prop==="smoothK"?"%K Glättung":prop==="smoothD"?"%D Glättung":prop;
  const input=document.createElement("input");input.type="number";input.min=prop==="smoothK"||prop==="smoothD"?1:2;input.max=prop==="slow"?300:prop==="smoothK"||prop==="smoothD"?100:200;
  input.step=1;input.value=String(settings[prop]);input.dataset.parameter=prop;input.dataset.kind=kind;
  input.setAttribute("aria-label",cfg.name+": "+prop);
  row.append(label,input);
 }
 return row;
}
function syncPanel(){
 if(!state)return;
 state.controls.replaceChildren();
 for(const id of Object.keys(REGISTRY))state.controls.append(box(id));
}
function data(kind){return calc(kind,state.bars,state.settings[kind])}
function addReadout(kind,calculated){
 const labels={rsi:["RSI"],atr:["ATR"],macd:["MACD","Signal","Histogram"],volume:["Volumen"],adx:["ADX","+DI","−DI"],stochastic:["%K","%D"],vwap:["VWAP"]}[kind];
 const keys=Object.keys(calculated);
 for(let i=0;i<keys.length;i++)for(const point of calculated[keys[i]]||[]){
  const rows=state.readouts.get(point.time)||[];
  rows.push({kind,label:labels[i],value:point.value});state.readouts.set(point.time,rows);
 }
}
function syncRanges(){
 if(!state)return;
 let range=null;
 try{range=state.chart.timeScale().getVisibleLogicalRange()}catch(_){}
 if(!range)return;
 for(const pane of state.panes.values())try{pane.chart.timeScale().setVisibleLogicalRange(range)}catch(_){}
}
function destroyPane(kind){
 const p=state.panes.get(kind);if(!p)return;
 p.observer?.disconnect();p.chart.remove();p.shell.remove();state.panes.delete(kind);
}
function createPane(kind){
 const conf=REGISTRY[kind],shell=document.createElement("section");
 shell.className="cs-indicator-pane";shell.dataset.indicator=kind;
 const title=document.createElement("div");title.className="cs-indicator-pane-title";
 title.textContent=conf.name+" · "+(kind==="volume"?"Broker Tick-/Realvolumen":"eigene Skala");
 const close=document.createElement("button");close.type="button";close.title="Pane schließen";
 close.textContent="✕";close.addEventListener("click",()=>{state.settings[kind].enabled=false;persist();syncPanel();renderPanes()});
 title.append(close);shell.append(title);
 const plot=document.createElement("div");plot.className="cs-indicator-pane-plot";shell.append(plot);
 state.stack.append(shell);
 const chart=LightweightCharts.createChart(plot,{
  width:Math.max(220,plot.clientWidth||state.host.clientWidth),height:Math.max(115,plot.clientHeight||133),
  layout:{background:{color:"#0b1a24"},textColor:"#b8d4db",fontSize:10},
  grid:{vertLines:{visible:false},horzLines:{color:"#24404d"}},
  rightPriceScale:{borderVisible:false,scaleMargins:{top:.12,bottom:.12}},
  leftPriceScale:{visible:false},
  crosshair:{mode:0},
  timeScale:{visible:false,borderVisible:false,rightOffset:7,barSpacing:7},
  handleScroll:{mouseWheel:false,pressedMouseMove:false,horzTouchDrag:false,vertTouchDrag:false},
  handleScale:{mouseWheel:false,pinch:false,axisPressedMouseMove:false,axisDoubleClickReset:false}
 });
 const lines={};const series=(name,color,type)=>{
  lines[name]=type==="hist"?chart.addHistogramSeries({color,priceLineVisible:false,lastValueVisible:false,
   priceFormat:{type:"volume"}}):chart.addLineSeries({color,lineWidth:2,
   priceLineVisible:false,lastValueVisible:false});
 };
 if(kind==="rsi")series("rsi","#e9bb72");
 if(kind==="atr")series("atr","#a68eff");
  if(kind==="macd"){series("macd","#55d7ee");series("signal","#f3c56a");series("histogram","#53dabd","hist")}
 if(kind==="volume")series("volume","#5de1d8","hist");
 if(kind==="adx"){series("adx","#e9bc72");series("plusDi","#55deaa");series("minusDi","#f17e97")}
 if(kind==="stochastic"){series("stochK","#55d7ee");series("stochD","#f3c56a")}
 const pane={shell,chart,plot,lines,observer:null};
 if(typeof ResizeObserver!=="undefined"){pane.observer=new ResizeObserver(()=>{
  chart.applyOptions({width:Math.max(180,plot.clientWidth),height:Math.max(80,plot.clientHeight)});
 });pane.observer.observe(plot)}
 state.panes.set(kind,pane);
 return pane;
}
function renderPanes(){
 if(!state)return;
 state.readouts=new Map();
 for(const id of Object.keys(REGISTRY)){
  if(id==="vwap"){
   const calculated=state.settings.vwap.enabled?data("vwap"):null;
   if(calculated)addReadout(id,calculated);
   if(state.settings.vwap.enabled&&!state.vwapOverlay){
    state.vwapOverlay=state.chart.addLineSeries({title:"Session-VWAP "+state.settings.vwap.sessionStart+" "+state.settings.vwap.timeZone+" · Tick-/Realvolumenproxy",
     color:"#f1da9b",lineWidth:2,lastValueVisible:true,priceLineVisible:false});
   }
   if(state.vwapOverlay){
    state.vwapOverlay.applyOptions({visible:!!state.settings.vwap.enabled,title:"Session-VWAP "+state.settings.vwap.sessionStart+" "+state.settings.vwap.timeZone+" · Tick-/Realvolumenproxy"});
    if(calculated)state.vwapOverlay.setData(calculated.vwap);
   }
   continue;
  }
  if(!state.settings[id].enabled){destroyPane(id);continue}
  const pane=state.panes.get(id)||createPane(id);
  const calculated=data(id);
  addReadout(id,calculated);
  for(const [key,series] of Object.entries(pane.lines)){
   // Align warm-up bars to the primary chart's logical coordinates.
   const byTime=new Map((calculated[key]||[]).map(p=>[p.time,p]));
   series.setData(state.bars.map(bar=>byTime.get(bar.time)||{time:bar.time}));
  }
 }
 syncRanges();
 window.ChartStudioBeta?.refreshDataWindowIndicators();
}
function readout(time){
 if(!state)return "";
 const rows=state.readouts.get(Number(time))||[];
 const values=[];
 const components={rsi:["RSI"],atr:["ATR"],macd:["MACD","Signal","Histogram"],volume:["Volumen"],adx:["ADX","+DI","−DI"],stochastic:["%K","%D"],vwap:["VWAP"]};
 for(const id of Object.keys(REGISTRY))if(state.settings[id].enabled){
  for(const label of components[id]){
   const row=rows.find(item=>item.kind===id&&item.label===label);
   if(row)values.push(row.label+" "+(row.kind==="volume"?row.value.toFixed(0):row.value.toFixed(2)));
   else values.push(id==="vwap"?"VWAP · Kein Volumen":label+" · Warm-up");
  }
 }
 return values.join(" · ")||"Keine aktiven Indikatoren";
}
function updateBars(bars){
 if(!state||!Array.isArray(bars))return;
 const last=bars.at(-1)||{};
 const signature=window.ChartStudioDataSignature?.signature(bars)||
  [bars.length,last.time,last.close,last.high,last.low,last.tick_volume,last.real_volume].join(":");
 if(signature===state.signature)return;
 state.signature=signature;state.bars=bars;
 renderPanes();
}
function switchAccount(account){
 if(!state)return;
 state.account=account;
 state.settings=restore(account);state.signature=null;state.bars=[];
 syncPanel();renderPanes();
}
function updateConfig(kind,prop,val){
 if(!state||!REGISTRY[kind])return false;
 if(prop==="enabled")state.settings[kind].enabled=val===true;
 else if(kind==="volume"&&["upColor","downColor"].includes(prop)){
  if(typeof val!=="string"||!/^#[0-9a-fA-F]{6}$/.test(val))return false;
  state.settings.volume[prop]=val.toLowerCase();
 }
 else if(kind==="vwap"&&["timeZone","sessionStart"].includes(prop)){
  const candidate={...state.settings.vwap,[prop]:String(val)};
  if(!sessionConfig(candidate)){state.notice.textContent=prop==="timeZone"?"Ungültige IANA-Zeitzone.":"Sessionstart muss HH:MM sein.";syncPanel();return false}
  state.settings.vwap[prop]=String(val);
 }
 else if(Object.hasOwn(REGISTRY[kind],prop)){
  const n=Number(val),minimum=prop==="smoothK"||prop==="smoothD"?1:2,maximum=prop==="slow"?300:prop==="smoothK"||prop==="smoothD"?100:200;
  if(!Number.isInteger(n)||n<minimum||n>maximum){state.notice.textContent="Ungültiger Parameter ("+minimum+"–"+maximum+")";return false}
  state.settings[kind][prop]=n;
 }
 if(kind==="macd"&&state.settings.macd.fast>=state.settings.macd.slow){
  state.settings.macd.fast=Math.min(state.settings.macd.fast,state.settings.macd.slow-1);
  state.notice.textContent="MACD benötigt fast < slow; Werte korrigiert.";
 }
 persist();syncPanel();renderPanes();state.notice.textContent=REGISTRY[kind].name+" aktualisiert.";
 return true;
}
function applySettings(raw){
 if(!state||!raw||typeof raw!=="object")return;
 const fresh=defaults();
 for(const id of Object.keys(REGISTRY)){
  const input=raw[id];if(!input||typeof input!=="object")continue;
  fresh[id].enabled=input.enabled===true;
  if(id==="volume")for(const key of ["upColor","downColor"])
   if(typeof input[key]==="string"&&/^#[0-9a-fA-F]{6}$/.test(input[key]))fresh.volume[key]=input[key].toLowerCase();
  if(id==="vwap"){const config=sessionConfig(input);if(config){fresh.vwap.timeZone=config.timeZone;fresh.vwap.sessionStart=config.sessionStart}}
  for(const key of ["period","fast","slow","signal","smoothK","smoothD"]){
   const value=Number(input[key]);
   const minimum=key==="smoothK"||key==="smoothD"?1:2,maximum=key==="slow"?300:key==="smoothK"||key==="smoothD"?100:200;
   if(Object.hasOwn(fresh[id],key)&&Number.isInteger(value)&&value>=minimum&&value<=maximum)
    fresh[id][key]=value;
  }
 }
 if(fresh.macd.fast>=fresh.macd.slow)fresh.macd.fast=Math.max(2,fresh.macd.slow-1);
 state.settings=fresh;persist();syncPanel();renderPanes();
}
function mount({chart,host,panel,account="titan"}){
 if(state||!chart||!host||!panel)return;
 const stack=document.createElement("div");stack.className="cs-indicator-panes";
 host.parentElement.insertAdjacentElement("afterend",stack);
 const controls=document.createElement("div");controls.className="cs-indicator-controls";
 const head=document.createElement("div");head.className="cs-indicator-controls-title";
 head.textContent="Zusätzliche Indikator-Panes · unabhängig ein-/ausblendbar";panel.append(head,controls);
 const notice=document.createElement("p");notice.className="cs-indicator-notice";notice.textContent="Indikatoren basieren auf geladenen Brokerkerzen. Warm-up erforderlich.";
 panel.append(notice);
 state={chart,host,stack,controls,notice,account,settings:restore(account),bars:[],signature:null,panes:new Map(),vwapOverlay:null,readouts:new Map()};
 controls.addEventListener("change",evt=>{
  const target=evt.target;
  if(!target.dataset.kind)return;
  if(target.type==="checkbox")updateConfig(target.dataset.kind,"enabled",target.checked);
  else updateConfig(target.dataset.kind,target.dataset.parameter,target.value);
 });
 chart.timeScale().subscribeVisibleLogicalRangeChange(syncRanges);
 syncPanel();renderPanes();
}
window.ChartStudioIndicators=Object.freeze({mount,updateBars,switchAccount,updateConfig,settings,readout,
 registry:REGISTRY,calculate:calc,applySettings,math:Object.freeze({validateBars,ema,rsi,stochastic,macd,atr,adx,vwap,volumes})});
})();

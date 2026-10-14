/* Chart Studio alternate price-series types (opt-in).
 * Keep original candle series alive as the permanent price/anchor coordinate reference.
 * Only presentation is switched; MT5 trading routes and EA data remain untouched.
 */
(()=>{
"use strict";
const TYPES=Object.freeze(["candles","hollow","heikin","bars","line","area"]);
const PREFIX="2eas:studio:chart-type:v1:";
const labels=Object.freeze({candles:"Kerzen",hollow:"Hollow-Kerzen",heikin:"Heikin Ashi (abgeleitet)",bars:"OHLC-Balken",line:"Linie",area:"Fläche"});
let state=null;
function valid(x){return typeof x==="string"&&TYPES.includes(x)}
function restore(account){
 try{const t=localStorage.getItem(PREFIX+account+":XAUUSD");return valid(t)?t:"candles"}
 catch(_){return "candles"}
}
function store(){
 try{localStorage.setItem(PREFIX+state.account+":XAUUSD",state.type)}catch(_){}
}
function style(){
 const appearance=window.ChartStudioAppearance?.settings()||{};
 return {upColor:appearance.upColor||"#10b981",downColor:appearance.downColor||"#f43f5e",
  lastPriceVisible:appearance.lastPriceVisible!==false};
}
function rgba(hex,opacity){
 if(!/^#[a-fA-F0-9]{6}$/.test(hex))return "rgba(16,185,129,.2)";
 const n=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
 return "rgba("+n.join(",")+","+opacity+")";
}
function makeSeries(type){
 const {upColor,downColor,lastPriceVisible}=style();
 if(type==="hollow"||type==="heikin")
  return state.chart.addCandlestickSeries({title:type==="heikin"?"XAUUSD · Heikin Ashi (abgeleitet)":"XAUUSD · Hollow-Kerzen",
   upColor,downColor,borderVisible:true,wickVisible:true,wickUpColor:upColor,wickDownColor:downColor,
   priceLineVisible:lastPriceVisible});
 if(type==="bars")
  return state.chart.addBarSeries({title:"XAUUSD · OHLC",upColor,downColor,
   openVisible:true,thinBars:false,priceLineVisible:lastPriceVisible});
 if(type==="line")
  return state.chart.addLineSeries({title:"XAUUSD · Schlusskurs",color:upColor,
   lineWidth:2,priceLineVisible:lastPriceVisible});
 if(type==="area")
  return state.chart.addAreaSeries({title:"XAUUSD · Schlusskurs",lineColor:upColor,
   topColor:rgba(upColor,.30),bottomColor:rgba(upColor,.025),
   lineWidth:2,priceLineVisible:lastPriceVisible});
 return null;
}
function heikinAshiBars(bars){
 let previousOpen=null,previousClose=null;
 const {upColor,downColor}=style();
 return bars.map(bar=>{
  const close=(bar.open+bar.high+bar.low+bar.close)/4;
  const open=previousOpen===null?(bar.open+bar.close)/2:(previousOpen+previousClose)/2;
  const row={time:bar.time,open,high:Math.max(bar.high,open,close),low:Math.min(bar.low,open,close),close,
   color:close>=open?upColor:downColor,borderColor:close>=open?upColor:downColor,wickColor:close>=open?upColor:downColor};
  previousOpen=open;previousClose=close;return row;
 });
}
function hollowCandleBars(bars){
 const {upColor,downColor}=style();
 return bars.map(bar=>{
  const up=bar.close>=bar.open;
  return {time:bar.time,open:bar.open,high:bar.high,low:bar.low,close:bar.close,
   color:up?"rgba(0,0,0,0)":downColor,borderColor:up?upColor:downColor,wickColor:up?upColor:downColor};
 });
}
function dataFor(type,bars){
 if(type==="heikin")return heikinAshiBars(bars);
 if(type==="hollow")return hollowCandleBars(bars);
 return type==="line"||type==="area"?
  bars.map(b=>({time:b.time,value:b.close})):
  bars.map(b=>({time:b.time,open:b.open,high:b.high,low:b.low,close:b.close}));
}
function transformBars(type,input){
 if(!valid(type)||!Array.isArray(input)||input.length>10000)return [];
 const bars=window.ChartStudioIndicators?.math.validateBars(input)||[];
 if(bars.length!==input.length)return [];
 return dataFor(type,bars);
}
function render(){
 if(!state)return;
 if(state.alternative){state.chart.removeSeries(state.alternative);state.alternative=null}
 const original=state.type==="candles";
 state.candleSeries.applyOptions({visible:original});
 if(!original){
  state.alternative=makeSeries(state.type);
  if(state.alternative)state.alternative.setData(dataFor(state.type,state.bars));
 }
 for(const button of state.controls.querySelectorAll("button[data-chart-type]")){
  const on=button.dataset.chartType===state.type;
  button.setAttribute("aria-pressed",String(on));
 }
 state.message.textContent="Darstellung: "+labels[state.type]+(state.type==="heikin"?" · Berechnete OHLC-Anzeige; Originalfeed bleibt unverändert.":" · Originalfeed, Positionen und Zeichenanker bleiben unverändert.");
}
function current(){return state?.type||"candles"}
function applySettings(type){
 if(!state||!valid(type))return false;
 if(type===state.type){render();return true}
 state.type=type;store();render();return true;
}
function applyAppearance(appearance){
 if(!state||!state.alternative)return;
 const upColor=appearance?.upColor||"#10b981",downColor=appearance?.downColor||"#f43f5e";
 const enabled=appearance?.lastPriceVisible!==false;
 if(state.type==="bars")
  state.alternative.applyOptions({upColor,downColor,priceLineVisible:enabled});
 else if(state.type==="line")
  state.alternative.applyOptions({color:upColor,priceLineVisible:enabled});
 else if(state.type==="area")
  state.alternative.applyOptions({lineColor:upColor,topColor:rgba(upColor,.30),
   bottomColor:rgba(upColor,.025),priceLineVisible:enabled});
 else if(state.type==="hollow"||state.type==="heikin")
  state.alternative.setData(dataFor(state.type,state.bars));
}
function updateBars(input){
 if(!state||!Array.isArray(input))return;
 const signature=window.ChartStudioDataSignature?.signature(input);
 if(signature&&signature===state.signature)return;
 state.signature=signature;
 const rows=window.ChartStudioIndicators?.math.validateBars(input)||[];
 state.bars=rows;
 if(state.alternative)state.alternative.setData(dataFor(state.type,rows));
}
function switchAccount(account){
 if(!state)return;
 state.account=account;state.type=restore(account);state.bars=[];state.signature=null;
 render();
}
function mount({chart,candleSeries,panel,account="titan"}){
 if(state||!chart||!candleSeries||!panel)return;
 const root=document.createElement("section");root.className="cs-chart-type-editor";
 const title=document.createElement("strong");title.textContent="CHARTTYP · PREISDARSTELLUNG";
 const controls=document.createElement("div");controls.className="cs-chart-type-choices";
 for(const type of TYPES){
  const button=document.createElement("button");button.type="button";
  button.dataset.chartType=type;button.textContent=labels[type];
  controls.append(button);
 }
 const message=document.createElement("p");message.setAttribute("role","status");
 message.setAttribute("aria-live","polite");
 root.append(title,controls,message);panel.append(root);
 state={chart,candleSeries,root,controls,message,account,type:restore(account),
  alternative:null,bars:[],signature:null};
 controls.addEventListener("click",event=>{
  const type=event.target.closest("button[data-chart-type]")?.dataset.chartType;
  if(type)applySettings(type);
 });
 render();
}
window.ChartStudioChartTypes=Object.freeze({
 mount,updateBars,switchAccount,current,applySettings,applyAppearance,transformBars,valid,TYPES
});
})();

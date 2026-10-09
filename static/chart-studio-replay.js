/* 2EAs Chart Studio visual replay, read-only and isolated from live chart.
 * No broker APIs, no order routes, no signal execution, no future candles.
 */
(()=>{"use strict";
const MAX_BARS=1200;
let state=null;
const valid=b=>b&&Number.isSafeInteger(b.time)&&b.time>0&&
 ["open","high","low","close"].every(k=>Number.isFinite(b[k])&&b[k]>0)&&
 b.high>=Math.max(b.open,b.close,b.low)&&b.low<=Math.min(b.open,b.close,b.high);
function normalize(raw){
 if(!Array.isArray(raw))return [];
 const values=raw.filter(valid).map(b=>({time:b.time,open:b.open,high:b.high,low:b.low,close:b.close}));
 values.sort((a,b)=>a.time-b.time);
 return values.filter((b,i)=>i===0||values[i-1].time!==b.time).slice(-MAX_BARS);
}
function announce(message){if(state)state.status.textContent=message}
function stopTimer(){if(state?.timer){clearInterval(state.timer);state.timer=null}}
function pause(){if(!state)return;stopTimer();state.play.textContent="▶ Abspielen"}
function buildChart(){
 if(!state||state.chart||!state.root.open)return;
 const el=state.plot;
 state.chart=LightweightCharts.createChart(el,{
  width:Math.max(260,el.clientWidth||700),height:240,
  layout:{background:{color:"#071b25"},textColor:"#c8e5ec"},
  grid:{vertLines:{visible:false},horzLines:{color:"#294756"}},
  timeScale:{timeVisible:true,secondsVisible:false,rightOffset:5},
  handleScroll:{mouseWheel:true,pressedMouseMove:true},
  handleScale:{mouseWheel:true,pinch:true}});
 state.series=state.chart.addCandlestickSeries({
  upColor:"#39ccae",downColor:"#e77791",borderVisible:false,
  wickUpColor:"#39ccae",wickDownColor:"#e77791"});
}
function redraw(){
 if(!state)return;
 state.slider.max=String(Math.max(0,state.snapshot.length-1));
 state.slider.value=String(Math.max(0,state.cursor));
 state.slider.disabled=!state.active;
 state.step.disabled=!state.active||state.cursor>=state.snapshot.length-1;
 state.play.disabled=!state.active||state.snapshot.length<2;
 if(!state.active){state.series?.setData([]);return}
 if(!state.series)buildChart();
 // Every displayed candle must belong to the immutable as-of prefix.
 const prefix=state.snapshot.slice(0,state.cursor+1);
 state.series?.setData(prefix);
 if(prefix.length>0){
  const t=prefix[prefix.length-1].time;
  announce("REPLAY · "+prefix.length+" / "+state.snapshot.length+" Kerzen · "+
   new Date(t*1000).toLocaleString("de-DE",{timeZone:"UTC"})+" UTC · Kein Orderversand");
 }
}
function start(){
 if(!state)return false;pause();
 if(state.bars.length<2){announce("Nicht genügend historische Brokerkerzen für Replay.");return false}
 state.snapshot=state.bars.map(c=>Object.freeze({...c}));
 Object.freeze(state.snapshot);
 state.cursor=0;state.active=true;redraw();return true;
}
function step(){
 if(!state?.active)return false;
 if(state.cursor>=state.snapshot.length-1){pause();return false}
 state.cursor++;redraw();if(state.cursor>=state.snapshot.length-1)pause();return true;
}
function seek(to){
 if(!state?.active||!Number.isInteger(to)||to<0||to>=state.snapshot.length)return false;
 pause();state.cursor=to;redraw();return true;
}
function play(){
 if(!state?.active)return false;
 if(state.timer){pause();return false}
 if(state.cursor>=state.snapshot.length-1)state.cursor=0;
 state.play.textContent="Ⅱ Pause";
 state.timer=setInterval(()=>{if(document.hidden){pause();return}step()},700);
 return true;
}
function exit(){
 if(!state)return;pause();state.active=false;state.snapshot=[];state.cursor=-1;
 redraw();announce("Live-Daten unverändert. Replay beendet.");
}
function updateBars(bars){
 if(!state||state.active)return; // Active replay is frozen; never inject future live bars.
 state.bars=normalize(bars);
 if(!state.active)announce("Replay bereit · "+state.bars.length+" historische Kerzen geladen.");
}
function switchContext(account,timeframe){
 if(!state)return;
 exit();state.account=account;state.timeframe=timeframe;state.bars=[];
 announce("Kontext gewechselt: Replay-Daten verworfen. Historie neu laden.");
}
function inspect(){
 if(!state)return null;
 const prefix=state.active?state.snapshot.slice(0,state.cursor+1):[];
 return {account:state.account,timeframe:state.timeframe,active:state.active,
  sourceBars:state.bars.length,snapshotBars:state.snapshot.length,visibleBars:prefix.length,
  lastVisibleTime:prefix.length?prefix[prefix.length-1].time:null,playing:!!state.timer};
}
function mount({panel,account="titan",timeframe="M15"}={}){
 if(!panel||state)return false;
 const root=document.createElement("details");root.className="cs-replay";
 const summary=document.createElement("summary");summary.textContent="Historisches Chart-Replay · Read-only";
 const info=document.createElement("p");info.textContent="Isolierte historische Ansicht. Kein echtes Backtesting, keine Orders oder Brokeränderungen.";
 const tools=document.createElement("div");tools.className="cs-replay-actions";
 function button(label){const el=document.createElement("button");el.type="button";el.textContent=label;tools.append(el);return el}
 const begin=button("↤ Replay starten"),next=button("Schritt ▶"),playButton=button("▶ Abspielen"),quit=button("Replay beenden");
 const slider=document.createElement("input");slider.type="range";slider.min="0";slider.max="0";slider.value="0";
 slider.setAttribute("aria-label","Replay-Kerze auswählen");tools.append(slider);
 const status=document.createElement("output");status.setAttribute("role","status");status.setAttribute("aria-live","polite");
 const plot=document.createElement("div");plot.className="cs-replay-plot";
 root.append(summary,info,tools,status,plot);panel.append(root);
 state={root,plot,status,slider,step:next,play:playButton,account,timeframe,
  active:false,bars:[],snapshot:[],cursor:-1,timer:null,chart:null,series:null};
 begin.addEventListener("click",start);next.addEventListener("click",step);
 playButton.addEventListener("click",play);quit.addEventListener("click",exit);
 slider.addEventListener("input",()=>seek(Number(slider.value)));
 root.addEventListener("toggle",()=>{if(root.open){buildChart();redraw()}else pause()});
 window.addEventListener("resize",()=>{if(state?.chart&&root.open)state.chart.applyOptions({width:Math.max(260,plot.clientWidth)})});
 document.addEventListener("visibilitychange",()=>{if(document.hidden)pause()});
 redraw();announce("Historische Kerzen werden geladen.");return true;
}
window.ChartStudioReplay=Object.freeze({mount,start,step,seek,play,exit,updateBars,switchContext,inspect,normalize});
})();

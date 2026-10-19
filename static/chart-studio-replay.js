/* 2EAs Chart Studio visual replay, read-only and isolated from live chart.
 * No broker APIs, no order routes, no signal execution, no future candles.
 */
(()=>{"use strict";
const MAX_BARS=1200;
const MAX_EVIDENCE_EVENTS=500;
const EMA_PERIODS=[9,20,50,200];
const EMA_COLORS={9:"#e7f2fa",20:"#44cceb",50:"#ffc233",200:"#c28af3"};
const TF_SECONDS={M1:60,M5:300,M15:900,M30:1800,H1:3600,H4:14400,D1:86400,W1:604800,MN1:2592000};
let state=null;
function barCloseSeconds(time,timeframe){
 if(timeframe==="MN1"){
  const date=new Date(time*1000);
  return Math.floor(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,1)/1000);
 }
 return time+(TF_SECONDS[timeframe]||900);
}
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
function utcMicros(value){
 if(typeof value!=="string")throw Error("Invalid evidence timestamp");
 const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?Z$/.exec(value);
 if(!match)throw Error("Invalid evidence timestamp");
 const [,y,mo,d,h,mi,s,fraction=""]=match,ms=Date.UTC(+y,+mo-1,+d,+h,+mi,+s);
 const date=new Date(ms);if(date.getUTCFullYear()!==+y||date.getUTCMonth()!==+mo-1||date.getUTCDate()!==+d||date.getUTCHours()!==+h||date.getUTCMinutes()!==+mi||date.getUTCSeconds()!==+s)throw Error("Invalid evidence timestamp");
 return BigInt(ms)*1000n+BigInt((fraction+"000000").slice(0,6));
}
function stable(value){
 if(Array.isArray(value))return "["+value.map(stable).join(",")+"]";
 if(value&&typeof value==="object")return "{"+Object.keys(value).sort().map(key=>JSON.stringify(key)+":"+stable(value[key])).join(",")+"}";
 return JSON.stringify(value);
}
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
 for(const period of EMA_PERIODS)state.emaSeries[period]=state.chart.addLineSeries({
  title:"EMA "+period,color:EMA_COLORS[period],lineWidth:1,
  priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false});
}
function redraw(){
 if(!state)return;
 state.slider.max=String(Math.max(0,state.snapshot.length-1));
 state.slider.value=String(Math.max(0,state.cursor));
 state.slider.disabled=!state.active;
 state.step.disabled=!state.active||state.cursor>=state.snapshot.length-1;
 state.play.disabled=!state.active||state.snapshot.length<2;
 if(!state.active){state.series?.setData([]);state.series?.setMarkers?.([]);for(const period of EMA_PERIODS)state.emaSeries[period]?.setData([]);state.emaData={};state.visibleEvents=[];state.eventList?.replaceChildren();return}
 if(!state.series)buildChart();
 // Every displayed candle must belong to the immutable as-of prefix.
 const prefix=state.snapshot.slice(0,state.cursor+1);
 state.series?.setData(prefix);
 const ema=window.ChartStudioIndicators?.math?.ema;
 state.emaData={};
 for(const period of EMA_PERIODS){
  const values=typeof ema==="function"?ema(prefix.map(bar=>bar.close),period):[];
  const data=values.flatMap((value,index)=>Number.isFinite(value)?[{time:prefix[index].time,value}]:[]);
  state.emaData[period]=data;state.emaSeries[period]?.setData(data);
 }
 if(prefix.length>0){
  const t=prefix[prefix.length-1].time;
  const closeUs=BigInt(barCloseSeconds(t,state.timeframe))*1000000n,cutoff=state.cursor===state.snapshot.length-1?state.asOfUs:(closeUs<state.asOfUs?closeUs:state.asOfUs);
  state.visibleEvents=state.events.filter(event=>event.timeUs<=cutoff);
  if(state.eventList){state.eventList.replaceChildren();for(const event of state.visibleEvents){const row=document.createElement("li");row.textContent=event.description+" · "+event.id+" · "+event.eventTimeUtc+" · RECORDED";state.eventList.append(row)}}
  const markers=state.visibleEvents.map(event=>({time:event.barTime,position:event.type==="DECISION"?"aboveBar":"belowBar",
   color:event.type==="DECISION"?(event.outcome==="BLOCK"?"#f07886":"#75c9ed"):"#f5c451",
   shape:event.type==="DECISION"?(event.outcome==="BLOCK"?"arrowDown":"circle"):"arrowUp",text:event.markerLabel}));
  state.series?.setMarkers?.(markers);
  announce("REPLAY · "+prefix.length+" / "+state.snapshot.length+" Kerzen · "+
   new Date(t*1000).toLocaleString("de-DE",{timeZone:"UTC"})+" UTC · "+state.visibleEvents.length+" belegte Ereignisse · Kein Orderversand");
 }
}
function start(){
 if(!state)return false;if(state.active)exit();pause();state.previousContext=null;
 const asOfSeconds=Math.floor(Date.now()/1000),asOfUs=BigInt(asOfSeconds);
 const completed=state.bars.filter(c=>BigInt(barCloseSeconds(c.time,state.timeframe))<=asOfUs);
 if(completed.length<2){announce("Nicht genügend abgeschlossene historische Brokerkerzen für Replay.");return false}
 state.snapshot=completed.map(c=>Object.freeze({...c}));
 Object.freeze(state.snapshot);state.mode="LIVE_CANDLES";state.events=[];state.asOfUs=asOfUs*1000000n;
 state.cursor=0;state.active=true;redraw();return true;
}
async function startSnapshot({record,events=[]}={}){
 if(!state)throw Error("Replay is unavailable");
 const requestedContext=state.contextVersion,requestId=++state.requestVersion,account=state.account;
 const p=record?.payload,view=p?.chartView,data=p?.marketData,ref=p?.marketDataRef;
 if(record?.schemaVersion!==1||record.type!=="SNAPSHOT"||record.provenance!=="RECORDED"||!Number.isSafeInteger(record.dataRevision)||record.dataRevision<1||
    !/^[a-z0-9_-]{1,32}$/.test(record.accountId||"")||record.accountId!==state.account||p?.accountId!==state.account||
    typeof record.brokerServer!=="string"||!/^[A-Za-z0-9_.-]{1,64}$/.test(record.brokerServer)||! /^[0-9a-f]{64}$/.test(record.terminalIdentityHash||"")||
    !view||typeof view.symbol!=="string"||!/^[A-Za-z0-9][A-Za-z0-9_.#/+:-]{0,63}$/.test(view.symbol)||!TF_SECONDS[view.timeframe]||
    !ref||ref.accountId!==state.account||ref.brokerServer!==record.brokerServer||ref.symbol!==view.symbol||ref.sourceType!=="MARKET_BAR"||ref.confidenceKind!=="OBSERVED"||
    !data||data.source!=="MT5_COMPLETED_BARS"||!Array.isArray(data.bars)||data.bars.length<1||data.bars.length>150||
    typeof data.sha256!=="string"||!/^[0-9a-f]{64}$/.test(data.sha256)||ref.sourceRevision!==data.sha256||
    ref.id!=="bars_"+data.sha256.slice(0,48)||record.id!==p.snapshotId||record.accountId!==p.accountId||typeof p.asOfUtc!=="string")throw Error("Invalid recorded snapshot scope or provenance");
 const asOfUs=utcMicros(p.asOfUtc),canonical=stable(data.bars),digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(canonical))),b=>b.toString(16).padStart(2,"0")).join("");
 if(digest!==data.sha256)throw Error("Snapshot market-data hash mismatch");
 const tfSeconds=TF_SECONDS[view.timeframe],bars=[],seen=new Set();let previous=-1;
 for(const bar of data.bars){
  const openUs=utcMicros(bar?.timeUtc),time=Number(openUs/1000000n);
  if(!Number.isSafeInteger(time)||seen.has(time)||time<=previous||![bar.open,bar.high,bar.low,bar.close].every(v=>typeof v==="string"&&/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(v))){throw Error("Invalid snapshot candle")}
  const o=Number(bar.open),h=Number(bar.high),l=Number(bar.low),c=Number(bar.close);
  if(![o,h,l,c].every(Number.isFinite)||l<=0||h<Math.max(o,c,l)||l>Math.min(o,c,h))throw Error("Invalid snapshot candle");
  if(BigInt(barCloseSeconds(time,view.timeframe))*1000000n<=asOfUs)bars.push({time,open:o,high:h,low:l,close:c});
  seen.add(time);previous=time;
 }
 if(ref.eventTimeUtc!==data.bars.at(-1).timeUtc||view.fromUtc!==data.bars[0].timeUtc||view.toUtc!==data.bars.at(-1).timeUtc)throw Error("Snapshot market-data reference mismatch");
 if(!bars.length)throw Error("Snapshot has no completed candles as of its fill");
 if(!Array.isArray(p.decisionEventIds)||(p.lifecycleEventIds!==undefined&&!Array.isArray(p.lifecycleEventIds))||!Array.isArray(events)||events.length>MAX_EVIDENCE_EVENTS)throw Error("Invalid historical event list");
 const references=new Map();
 for(const [items,expectedType] of [[p.decisionEventIds,"DECISION"],[p.lifecycleEventIds||[],"LIFECYCLE"]])for(const refEvent of items){
  if(!refEvent||refEvent.type!==expectedType||typeof refEvent.id!=="string"||!/^[A-Za-z0-9_-]{1,64}$/.test(refEvent.id)||!Number.isSafeInteger(refEvent.dataRevision)||refEvent.dataRevision<1)throw Error("Invalid snapshot event reference");
  const key=refEvent.type+":"+refEvent.id;if(references.has(key))throw Error("Duplicate snapshot event reference");references.set(key,refEvent.dataRevision);
 }
 if(references.size!==events.length)throw Error("Historical event references are incomplete");
 const eventIds=new Set(),normalized=[];
 for(const envelope of events){
  const ep=envelope?.payload,type=envelope?.type,id=envelope?.id;
  if(envelope?.schemaVersion!==1||envelope.provenance!=="RECORDED"||envelope.accountId!==state.account||ep?.accountId!==state.account||
     !["DECISION","LIFECYCLE"].includes(type)||typeof id!=="string"||!/^[A-Za-z0-9_-]{1,64}$/.test(id)||eventIds.has(type+":"+id))throw Error("Invalid historical event provenance");
  if((type==="DECISION"&&ep.eventId!==id)||(type==="LIFECYCLE"&&ep.id!==id)||references.get(type+":"+id)!==envelope.dataRevision)throw Error("Historical event identity or revision mismatch");
  if(ep.symbol!==undefined&&ep.symbol!==view.symbol||ep.timeframe!==undefined&&ep.timeframe!==view.timeframe)throw Error("Historical event scope mismatch");
  const eventTimeUtc=type==="DECISION"?ep.decisionTimeUtc:ep.asOfUtc,timeUs=utcMicros(eventTimeUtc);
  if(timeUs>asOfUs)throw Error("Historical event occurs after snapshot as-of time");
  const time=Number(timeUs/1000000n);let bar=null;for(const candidate of bars){if(candidate.time<=time)bar=candidate;else break}
  if(!bar)throw Error("Historical event is outside the snapshot candle range");
  eventIds.add(type+":"+id);normalized.push({id,type,timeUs,eventTimeUtc,description:type==="DECISION"?"DECISION "+(ep.stage||"UNKNOWN")+" "+(ep.outcome||"UNKNOWN"):"LIFECYCLE "+(ep.eventType||"UNKNOWN"),barTime:bar.time,outcome:type==="DECISION"?ep.outcome:"",markerLabel:type==="DECISION"?"D":"L"});
 }
 normalized.sort((a,b)=>a.timeUs<b.timeUs?-1:a.timeUs>b.timeUs?1:a.type.localeCompare(b.type)||a.id.localeCompare(b.id));
 // Replace the replay only after the snapshot, digest, scope and every supplied event pass validation.
 if(state.account!==account||state.contextVersion!==requestedContext||state.requestVersion!==requestId)throw Error("Replay context changed while verifying snapshot");
 const previousContext=state.previousContext||{account:state.account,symbol:state.symbol,timeframe:state.timeframe,tfSeconds:state.tfSeconds};
 pause();state.previousContext=previousContext;state.snapshot=bars.map(bar=>Object.freeze(bar));Object.freeze(state.snapshot);state.events=normalized;state.tfSeconds=tfSeconds;state.timeframe=view.timeframe;state.symbol=view.symbol;state.asOfUs=asOfUs;
 state.cursor=0;state.active=true;state.mode="RECORDED_SNAPSHOT";redraw();
 return {status:"STARTED",bars:state.snapshot.length,events:normalized.length,sourceRevision:digest};
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
 if(!state)return;state.requestVersion++;pause();state.active=false;state.snapshot=[];state.cursor=-1;
 state.events=[];state.visibleEvents=[];state.mode="IDLE";state.asOfUs=0n;
 if(state.previousContext){Object.assign(state,state.previousContext);state.previousContext=null}
 redraw();announce("Live-Daten unverändert. Replay beendet.");
}
function updateBars(bars){
 if(!state||state.active)return; // Active replay is frozen; never inject future live bars.
 state.bars=normalize(bars);
 if(!state.active)announce("Replay bereit · "+state.bars.length+" historische Kerzen geladen.");
}
function switchContext(account,timeframe,symbol){
 if(!state)return;
 state.contextVersion++;exit();state.account=account;state.timeframe=timeframe;if(typeof symbol==="string")state.symbol=symbol;state.bars=[];state.tfSeconds=TF_SECONDS[timeframe]||900;
 announce("Kontext gewechselt: Replay-Daten verworfen. Historie neu laden.");
}
function inspect(){
 if(!state)return null;
 const prefix=state.active?state.snapshot.slice(0,state.cursor+1):[];
 const emaCounts={},emaLastValues={},emaLastTimes={};
 for(const period of EMA_PERIODS){const last=state.emaData?.[period]?.at(-1);emaCounts[period]=state.emaData?.[period]?.length||0;emaLastValues[period]=last?.value??null;emaLastTimes[period]=last?.time??null}
 return {account:state.account,symbol:state.symbol,timeframe:state.timeframe,active:state.active,mode:state.mode||"IDLE",
  sourceBars:state.bars.length,snapshotBars:state.snapshot.length,visibleBars:prefix.length,
  lastVisibleTime:prefix.length?prefix[prefix.length-1].time:null,emaCounts,emaLastValues,emaLastTimes,visibleEventIds:(state.visibleEvents||[]).map(event=>event.id),
  eventCount:state.events.length,playing:!!state.timer};
}
function mount({panel,account="titan",symbol="XAUUSD",timeframe="M15"}={}){
 if(!panel||state)return false;
 const root=document.createElement("details");root.className="cs-replay";
 const summary=document.createElement("summary");summary.textContent="Historisches Chart-Replay · Read-only";
 const info=document.createElement("p");info.textContent="Isolierte historische Ansicht. EMA 9/20/50/200 werden nur aus bis zum Cursor sichtbaren, abgeschlossenen Kerzen berechnet. Kein echtes Backtesting, keine Orders oder Brokeränderungen.";
 const tools=document.createElement("div");tools.className="cs-replay-actions";
 function button(label){const el=document.createElement("button");el.type="button";el.textContent=label;tools.append(el);return el}
 const begin=button("↤ Replay starten"),next=button("Schritt ▶"),playButton=button("▶ Abspielen"),quit=button("Replay beenden");
 const slider=document.createElement("input");slider.type="range";slider.min="0";slider.max="0";slider.value="0";
 slider.setAttribute("aria-label","Replay-Kerze auswählen");tools.append(slider);
 const status=document.createElement("output");status.setAttribute("role","status");status.setAttribute("aria-live","polite");
 const plot=document.createElement("div");plot.className="cs-replay-plot";
 root.append(summary,info,tools,status,plot);panel.append(root);
 const eventList=document.createElement("ol");eventList.className="cs-replay-events";eventList.setAttribute("aria-label","Im Replay bis zum aktuellen Zeitpunkt belegte Ereignisse");root.append(eventList);
 state={root,plot,status,slider,step:next,play:playButton,account,symbol,timeframe,tfSeconds:TF_SECONDS[timeframe]||900,
  active:false,mode:"IDLE",bars:[],snapshot:[],events:[],visibleEvents:[],emaSeries:Object.create(null),emaData:{},asOfUs:0n,cursor:-1,timer:null,chart:null,series:null,eventList,contextVersion:0,requestVersion:0};
 begin.addEventListener("click",start);next.addEventListener("click",step);
 playButton.addEventListener("click",play);quit.addEventListener("click",exit);
 slider.addEventListener("input",()=>seek(Number(slider.value)));
 root.addEventListener("toggle",()=>{if(root.open){buildChart();redraw()}else pause()});
 window.addEventListener("resize",()=>{if(state?.chart&&root.open)state.chart.applyOptions({width:Math.max(260,plot.clientWidth)})});
 document.addEventListener("visibilitychange",()=>{if(document.hidden)pause()});
 redraw();announce("Historische Kerzen werden geladen.");return true;
}
window.ChartStudioReplay=Object.freeze({mount,start,startSnapshot,step,seek,play,exit,updateBars,switchContext,inspect,normalize});
})();

/* Chart Studio: account-scoped, multi-instance read-only oscillator editor.
 * Uses the existing independently tested indicator formulas and an isolated
 * LWC v4 chart per pane. No MT5 trading APIs are invoked by this module.
 */
(()=>{
"use strict";
const MAX=8, PREFIX="2eas:studio:oscillators:v2:", LEGACY_PREFIX="2eas:studio:oscillators:v1:";
const KINDS=Object.freeze(["rsi","macd","atr","adx","stochastic"]);
const COLORS=Object.freeze(["#e8bb72","#54cee9","#a995ff","#63dfb6","#f7a1ae","#f1dca5","#82bdfa","#dfa2ec"]);
const clone=o=>JSON.parse(JSON.stringify(o));
const validColor=c=>typeof c==="string"&&/^#[0-9a-fA-F]{6}$/.test(c);
function normalize(raw){
 if(!raw||typeof raw!=="object"||Array.isArray(raw))return null;
 const mandatory=["id","kind","visible","color","lineWidth","label"];
 if(typeof raw.kind!=="string"||!KINDS.includes(raw.kind))return null;
 const params=raw.kind==="macd"?["fast","slow","signal"]:raw.kind==="stochastic"?["period","smoothK","smoothD"]:["period"];
 const keys=[...mandatory,...params];
 if(Object.keys(raw).length!==keys.length||keys.some(k=>!Object.hasOwn(raw,k)))return null;
 if(typeof raw.id!=="string"||!/^[A-Za-z0-9_-]{1,32}$/.test(raw.id))return null;
 if(typeof raw.visible!=="boolean"||!validColor(raw.color))return null;
 if(!Number.isInteger(raw.lineWidth)||raw.lineWidth<1||raw.lineWidth>4)return null;
 if(typeof raw.label!=="string"||raw.label.length>40||/[\u0000-\u001f]/.test(raw.label))return null;
 for(const key of params){
  const smoothing=key==="smoothK"||key==="smoothD",max=key==="slow"?300:smoothing?100:200;
  if(!Number.isInteger(raw[key])||raw[key]<(smoothing?1:2)||raw[key]>max)return null;
 }
 if(raw.kind==="macd"&&raw.fast>=raw.slow)return null;
 const item={id:raw.id,kind:raw.kind,visible:raw.visible,color:raw.color.toLowerCase(),
  lineWidth:raw.lineWidth,label:raw.label};
 for(const key of params)item[key]=raw[key];
 return item;
}
function normalizeList(list){
 if(!Array.isArray(list)||list.length>MAX)return null;
 const ids=new Set(),result=[];
 for(const entry of list){
  const normalized=normalize(entry);
  if(!normalized||ids.has(normalized.id))return null;
  ids.add(normalized.id);result.push(normalized);
 }
 return result;
}
function newConfig(id,kind,color){
 const params=kind==="macd"?{fast:12,slow:26,signal:9}:kind==="stochastic"?{period:14,smoothK:3,smoothD:3}:{period:14};
 return normalize({id,kind,visible:true,color,lineWidth:2,label:"",...params});
}
function idNext(entries){
 const used=new Set(entries.map(c=>c.id));let i=1;
 while(used.has("osc"+i))i++;
 return "osc"+i;
}
let state=null;
const key=account=>PREFIX+account+":XAUUSD";
const legacyKey=account=>LEGACY_PREFIX+account+":XAUUSD";
function restore(account){
 try{
  const current=localStorage.getItem(key(account));
  if(current!==null)return normalizeList(JSON.parse(current))||[];
  const legacy=localStorage.getItem(legacyKey(account));
  return normalizeList(JSON.parse(legacy||"null"))||[];
 }
 catch(_){return []}
}
function settings(){return state?clone(state.items):[]}
function announce(message){if(state)state.status.textContent=message}
function save(){
 if(!state)return;
 try{localStorage.setItem(key(state.account),JSON.stringify(state.items))}
 catch(_){announce("Lokale Speicherung nicht verfügbar.")}
}
function rangeSync(){
 if(!state)return;
 let range=null;try{range=state.chart.timeScale().getVisibleLogicalRange()}catch(_){}
 if(!range)return;
 for(const pane of state.panes.values()){
  try{pane.chart.timeScale().setVisibleLogicalRange(range)}catch(_){}
 }
}
function destroyPane(id){
 const p=state.panes.get(id);if(!p)return;
 p.observer?.disconnect();p.chart.remove();p.shell.remove();state.panes.delete(id);
}
function createPane(cfg){
 const shell=document.createElement("section");shell.className="cs-indicator-pane cs-osc-pane";
 shell.dataset.instance=cfg.id;shell.dataset.kind=cfg.kind;
 const title=document.createElement("div");title.className="cs-indicator-pane-title";
 const label=document.createElement("span");
 const close=document.createElement("button");close.type="button";close.title="Indikator ausblenden";
 close.textContent="✕";close.addEventListener("click",()=>edit(cfg.id,"visible",false));
 title.append(label,close);shell.append(title);
 const plot=document.createElement("div");plot.className="cs-indicator-pane-plot";shell.append(plot);
 state.stack.append(shell);
 const chart=LightweightCharts.createChart(plot,{
  width:Math.max(220,plot.clientWidth||state.host.clientWidth),
  height:Math.max(115,plot.clientHeight||133),
  layout:{background:{type:"solid",color:"#0b1a24"},textColor:"#b8d4db",fontSize:10},
  grid:{vertLines:{visible:false},horzLines:{color:"#24404d"}},
  rightPriceScale:{borderVisible:false,scaleMargins:{top:.12,bottom:.12}},
  leftPriceScale:{visible:false},crosshair:{mode:0},
  timeScale:{visible:false,borderVisible:false,rightOffset:7,barSpacing:7},
  handleScroll:{mouseWheel:false,pressedMouseMove:false,horzTouchDrag:false,vertTouchDrag:false},
  handleScale:{mouseWheel:false,pinch:false,axisPressedMouseMove:false,axisDoubleClickReset:false}
 });
 const lines={};
 function line(k,color,type="line"){
  lines[k]=type==="hist"?
   chart.addHistogramSeries({color,priceLineVisible:false,lastValueVisible:false}):
   chart.addLineSeries({color,lineWidth:cfg.lineWidth,priceLineVisible:false,lastValueVisible:false});
 }
 if(cfg.kind==="rsi")line("rsi",cfg.color);
 if(cfg.kind==="atr")line("atr",cfg.color);
 if(cfg.kind==="adx"){
  line("adx",cfg.color);line("plusDi","#5edeb6");line("minusDi","#f28b9d");
 }
 if(cfg.kind==="macd"){
  line("macd",cfg.color);line("signal","#f3c56a");line("histogram","#65e1bd","hist");
 }
 if(cfg.kind==="stochastic"){line("stochK",cfg.color);line("stochD","#f3c56a")}
 let observer=null;
 if(typeof ResizeObserver!=="undefined"){
  observer=new ResizeObserver(()=>{
   chart.applyOptions({width:Math.max(180,plot.clientWidth),
    height:Math.max(80,plot.clientHeight)});
  });observer.observe(plot);
 }
 const pane={shell,plot,chart,lines,label,observer};
 state.panes.set(cfg.id,pane);
 return pane;
}
function redraw(){
 if(!state)return;
 const ids=new Set(state.items.filter(item=>item.visible).map(item=>item.id));
 for(const id of [...state.panes.keys()])if(!ids.has(id))destroyPane(id);
 const api=window.ChartStudioIndicators;
 for(const cfg of state.items){
  if(!cfg.visible)continue;
  const existing=state.panes.get(cfg.id);
  if(existing&&existing.shell.dataset.kind!==cfg.kind)destroyPane(cfg.id);
  const p=state.panes.get(cfg.id)||createPane(cfg);
  p.label.textContent=(cfg.label.trim()||cfg.kind.toUpperCase())+
   (cfg.kind==="macd"?" · "+cfg.fast+"/"+cfg.slow+"/"+cfg.signal:cfg.kind==="stochastic"?" · "+cfg.period+"/"+cfg.smoothK+"/"+cfg.smoothD:" · "+cfg.period);
  p.shell.dataset.kind=cfg.kind;
  for(const [kind,series] of Object.entries(p.lines)){
   if(kind===cfg.kind||kind==="macd"||kind==="stochK")series.applyOptions({color:cfg.color,lineWidth:cfg.lineWidth});
   else if(kind==="signal")series.applyOptions({lineWidth:cfg.lineWidth});
  }
  const calculated=api?.calculate(cfg.kind,state.bars,cfg)||{};
  const aligned=new Map();
  for(const [name,series] of Object.entries(p.lines)){
   const byTime=new Map((calculated[name]||[]).map(point=>[point.time,point]));
   aligned.set(name,state.bars.map(bar=>byTime.get(bar.time)||{time:bar.time}));
   series.setData(aligned.get(name));
  }
 }
 rangeSync();
}
function control(kind,text,value,cfg){
 const label=document.createElement("label");label.textContent=text;
 let input;
 if(kind==="visible"){
  input=document.createElement("input");input.type="checkbox";input.checked=value;
 }else if(kind==="color"){
  input=document.createElement("input");input.type="color";input.value=value;
 }else if(kind==="kind"){
  input=document.createElement("select");
  for(const name of KINDS){const opt=document.createElement("option");opt.value=name;
   opt.textContent=name.toUpperCase();input.append(opt)}
  input.value=value;
 }else if(kind==="lineWidth"){
  input=document.createElement("select");
  for(const n of [1,2,3,4]){const opt=document.createElement("option");opt.value=String(n);
   opt.textContent=String(n);input.append(opt)}
  input.value=String(value);
 }else{
  input=document.createElement("input");input.type=kind==="label"?"text":"number";
  input.value=String(value);
  if(kind==="label")input.maxLength=40;
  else{input.min=kind==="smoothK"||kind==="smoothD"?1:2;input.max=kind==="slow"?300:kind==="smoothK"||kind==="smoothD"?100:200;input.step=1}
 }
 input.dataset.id=cfg.id;input.dataset.field=kind;
 input.setAttribute("aria-label",text+" "+cfg.id);
 label.append(input);return label;
}
function syncPanel(){
 if(!state)return;
 state.rows.replaceChildren();
 for(const cfg of state.items){
  const row=document.createElement("div");row.className="cs-osc-instance";row.dataset.instance=cfg.id;
  for(const [field,text] of [
   ["visible","Aktiv"],["kind","Indikator"],
   ...(cfg.kind==="macd"?[["fast","Schnell"],["slow","Langsam"],["signal","Signal"]]:
    cfg.kind==="stochastic"?[["period","Periode"],["smoothK","%K Glättung"],["smoothD","%D Glättung"]]:[["period","Periode"]]),
   ["color","Farbe"],["lineWidth","Breite"],["label","Name"]
  ])row.append(control(field,text,cfg[field],cfg));
  for(const [action,name] of [["duplicate","Kopieren"],["remove","Entfernen"]]){
   const button=document.createElement("button");button.type="button";
   button.dataset.action=action;button.dataset.id=cfg.id;button.textContent=name;row.append(button);
  }
  state.rows.append(row);
 }
 state.count.textContent=state.items.length+" / "+MAX+" Instanzen";
}
function commit(items,message){
 const checked=normalizeList(items);
 if(!checked){announce("Ungültige Indikatorparameter oder zu viele Instanzen.");syncPanel();return false}
 state.items=checked;save();syncPanel();redraw();if(message)announce(message);return true;
}
function add(kind="rsi"){
 if(!state||!KINDS.includes(kind))return false;
 if(state.items.length>=MAX){announce("Maximal "+MAX+" Zusatzindikatoren.");return false}
 const cfg=newConfig(idNext(state.items),kind,COLORS[state.items.length%COLORS.length]);
 return commit([...state.items,cfg],kind.toUpperCase()+" hinzugefügt.");
}
function edit(id,field,value){
 if(!state)return false;
 const at=state.items.findIndex(item=>item.id===id);
 if(at<0)return false;
 let next={...state.items[at]};
 if(field==="kind"){
  const fresh=newConfig(next.id,value,next.color);
  if(!fresh)return false;
  next={...fresh,visible:next.visible,label:next.label,lineWidth:next.lineWidth};
 }else{
  if(!Object.hasOwn(next,field))return false;
  next[field]=value;
 }
 const updated=state.items.slice();updated[at]=next;
 return commit(updated);
}
function remove(id){
 if(!state||!state.items.some(item=>item.id===id))return false;
 return commit(state.items.filter(item=>item.id!==id));
}
function applySettings(raw){
 if(!state)return false;
 return commit(raw);
}
function updateBars(bars){
 if(!state||!Array.isArray(bars))return;
 const first=bars[0]||{},last=bars.at(-1)||{};
 const signature=window.ChartStudioDataSignature?.signature(bars)||
  [bars.length,first.time,first.close,last.time,last.open,last.close,
   last.high,last.low,last.tick_volume,last.real_volume].join("|");
 if(signature===state.signature)return;
 state.signature=signature;
 state.bars=window.ChartStudioIndicators?.math.validateBars(bars)||[];
 redraw();
}
function switchAccount(account){
 if(!state)return;
 state.account=account;state.items=restore(account);
 state.bars=[];state.signature=null;syncPanel();redraw();
}
function mount({chart,host,panel,account="titan"}){
 if(state||!chart||!host||!panel)return;
 const root=document.createElement("section");root.className="cs-osc-editor";
 const header=document.createElement("div");header.className="cs-osc-header";
 const title=document.createElement("strong");title.textContent="INDIKATOR-LABOR · MEHRFACH-PANES";
 const count=document.createElement("span");header.append(title,count);
 const info=document.createElement("p");info.textContent=
  "RSI, MACD, ATR, ADX und Stochastic mehrfach mit eigenen Parametern, Pane, Farbe und Linienstärke.";
 const tools=document.createElement("div");tools.className="cs-osc-presets";
 for(const kind of KINDS){
  const button=document.createElement("button");button.type="button";button.dataset.add=kind;
  button.textContent="+ "+kind.toUpperCase();tools.append(button);
 }
 const rows=document.createElement("div");rows.className="cs-osc-items";
 const status=document.createElement("p");status.className="cs-osc-message";
 status.setAttribute("role","status");status.setAttribute("aria-live","polite");
 root.append(header,info,tools,rows,status);panel.append(root);
 const stack=document.createElement("div");stack.className="cs-osc-panes";
 // Keep the original legacy indicator panes untouched.
 host.parentElement.insertAdjacentElement("afterend",stack);
 state={chart,host,root,rows,stack,status,count,account,
  items:restore(account),bars:[],signature:null,panes:new Map()};
 tools.addEventListener("click",event=>{
  const kind=event.target.closest("button[data-add]")?.dataset.add;
  if(kind)add(kind);
 });
 rows.addEventListener("change",event=>{
  const target=event.target,id=target?.dataset?.id,field=target?.dataset?.field;
  if(!id||!field)return;
  const value=field==="visible"?target.checked:
    ["period","fast","slow","signal","smoothK","smoothD","lineWidth"].includes(field)?Number(target.value):target.value;
  edit(id,field,value);
 });
 rows.addEventListener("click",event=>{
  const button=event.target.closest("button[data-action]");if(!button)return;
  if(button.dataset.action==="remove")return remove(button.dataset.id);
  if(button.dataset.action==="duplicate"){
   if(state.items.length>=MAX){announce("Maximal "+MAX+" Zusatzindikatoren.");return}
   const item=state.items.find(x=>x.id===button.dataset.id);
   if(item)commit([...state.items,{...item,id:idNext(state.items)}]);
  }
 });
 chart.timeScale().subscribeVisibleLogicalRangeChange(rangeSync);
 syncPanel();redraw();
}
window.ChartStudioOscillators=Object.freeze({mount,settings,applySettings,
 updateBars,switchAccount,add,edit,remove,normalize,normalizeList,MAX,KINDS});
})();

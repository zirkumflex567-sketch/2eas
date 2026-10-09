/* Chart Studio Appearance: per-account visual options only, no MT5 I/O.
 * Preserves original chart/chart-candle options for reset.
 */
(()=>{
"use strict";
const PREFIX="2eas:studio:appearance:v1:";
const DEFAULTS=Object.freeze({
 theme:"inherit",grid:true,crosshair:true,scale:"normal",
 upColor:"#10b981",downColor:"#f43f5e",
 wickVisible:true,borderVisible:true,lastPriceVisible:true
});
const THEMES=Object.freeze(["inherit","dark","light"]);
const SCALES=Object.freeze(["normal","logarithmic"]);
const copy=o=>JSON.parse(JSON.stringify(o));
function normalize(v){
 if(!v||typeof v!=="object"||Array.isArray(v))return null;
 if(Object.keys(v).some(k=>!Object.hasOwn(DEFAULTS,k)))return null;
 const obj={...DEFAULTS,...v};
 if(!THEMES.includes(obj.theme)||!SCALES.includes(obj.scale))return null;
 if(!["upColor","downColor"].every(k=>typeof obj[k]==="string"&&/^#[0-9a-fA-F]{6}$/.test(obj[k])))return null;
 for(const k of ["grid","crosshair","wickVisible","borderVisible","lastPriceVisible"])
  if(typeof obj[k]!=="boolean")return null;
 obj.upColor=obj.upColor.toLowerCase();obj.downColor=obj.downColor.toLowerCase();
 return obj;
}
let state=null;
function key(){return PREFIX+state.account+":XAUUSD"}
function restore(account){
 try{return normalize(JSON.parse(localStorage.getItem(PREFIX+account+":XAUUSD")||"null"))||copy(DEFAULTS)}
 catch(_){return copy(DEFAULTS)}
}
function persist(){
 try{localStorage.setItem(key(),JSON.stringify(state.settings))}
 catch(_){state.message.textContent="Speichern im Browser nicht möglich."}
}
function option(name,value,label){
 const shell=document.createElement("label");shell.className="cs-appearance-field";
 const title=document.createElement("span");title.textContent=label;
 let input;
 if(typeof value==="boolean"){
  input=document.createElement("input");input.type="checkbox";input.checked=value;
 }else if(name.endsWith("Color")){
  input=document.createElement("input");input.type="color";input.value=value;
 }else{
  input=document.createElement("select");
  const choices=name==="theme"?[["inherit","Chart-Design übernehmen"],["dark","Dunkel"],["light","Hell"]]:
   [["normal","Normale Preisskala"],["logarithmic","Logarithmische Preisskala"]];
  for(const [key,text] of choices){
   const opt=document.createElement("option");opt.value=key;opt.textContent=text;input.append(opt);
  }
  input.value=value;
 }
 input.dataset.key=name;input.setAttribute("aria-label",label);
 shell.append(title,input);return shell;
}
function sync(){
 if(!state)return;
 state.fields.replaceChildren();
 const names=[
  ["theme","Chart-Hintergrund"],["grid","Gitternetz"],
  ["crosshair","Fadenkreuz"],["scale","Preisskala"],
  ["upColor","Steigende Kerze"],["downColor","Fallende Kerze"],
  ["wickVisible","Kerzendochte"],["borderVisible","Kerzenränder"],
  ["lastPriceVisible","Aktueller Preis"]
 ];
 for(const [key,label] of names)state.fields.append(option(key,state.settings[key],label));
}
function apply(){
 if(!state)return;
 const o=state.settings,base=state.baseline;
 const selected=o.theme==="inherit"?null:
  o.theme==="dark"?{background:"#071723",text:"#bfd8e5",grid:"#253d4c"}:
  {background:"#fcfdff",text:"#172b3c",grid:"#e3eaf0"};
 const bg=selected?.background||base.background;
 const text=selected?.text||base.text;
 const gridColor=selected?.grid||base.grid;
 state.chart.applyOptions({
  layout:{background:{type:"solid",color:bg},backgroundColor:bg,textColor:text},
  grid:{vertLines:{visible:o.grid,color:gridColor},horzLines:{visible:o.grid,color:gridColor}},
  crosshair:{mode:0,vertLine:{visible:o.crosshair},horzLine:{visible:o.crosshair}},
  rightPriceScale:{mode:o.scale==="logarithmic"?1:0}
 });
 state.series.applyOptions({
  upColor:o.upColor,downColor:o.downColor,
  borderUpColor:o.upColor,borderDownColor:o.downColor,
  wickUpColor:o.upColor,wickDownColor:o.downColor,
  wickVisible:o.wickVisible,borderVisible:o.borderVisible,
  priceLineVisible:o.lastPriceVisible
 });
 window.ChartStudioChartTypes?.applyAppearance(o);
}
function settings(){return state?copy(state.settings):copy(DEFAULTS)}
function applySettings(next){
 if(!state)return false;
 const checked=normalize(next);
 if(!checked){state.message.textContent="Ungültige Chart-Darstellung.";return false}
 state.settings=checked;persist();sync();apply();return true;
}
function switchAccount(account){
 if(!state)return;
 state.account=account;state.settings=restore(account);sync();apply();
}
function mount({chart,candleSeries,panel,account="titan"}){
 if(state||!chart||!candleSeries||!panel)return;
 const opt=chart.options(),candle=candleSeries.options();
 const baseline={
  background:opt.layout?.background?.color||opt.layout?.backgroundColor||"#071723",
  text:opt.layout?.textColor||"#bfd8e5",
  grid:opt.grid?.vertLines?.color||"#253d4c",
  candle:copy({
   upColor:candle.upColor||"#10b981",downColor:candle.downColor||"#f43f5e",
   wickVisible:candle.wickVisible!==false,borderVisible:candle.borderVisible!==false,
   priceLineVisible:candle.priceLineVisible!==false
  })
 };
 const root=document.createElement("details");root.className="cs-appearance";
 const header=document.createElement("summary");header.textContent="CHART-EINSTELLUNGEN · Farben, Skalierung & Darstellung";
 const fields=document.createElement("div");fields.className="cs-appearance-grid";
 const foot=document.createElement("div");foot.className="cs-appearance-actions";
 const reset=document.createElement("button");reset.type="button";reset.textContent="Werkseinstellungen";
 const note=document.createElement("p");note.textContent="Anpassungen betreffen nur die Darstellung, niemals Strategien oder MT5-Orders.";
 note.setAttribute("role","status");
 foot.append(reset);root.append(header,fields,foot,note);
 panel.append(root);
 state={root,fields,message:note,chart,series:candleSeries,baseline,account,settings:restore(account)};
 fields.addEventListener("change",event=>{
  const element=event.target,name=element.dataset?.key;if(!name)return;
  const value=element.type==="checkbox"?element.checked:element.value;
  applySettings({...state.settings,[name]:value});
 });
 reset.addEventListener("click",()=>{
  applySettings({...DEFAULTS,upColor:baseline.candle.upColor,downColor:baseline.candle.downColor,
   wickVisible:baseline.candle.wickVisible,borderVisible:baseline.candle.borderVisible,
   lastPriceVisible:baseline.candle.priceLineVisible});
  note.textContent="Chart-Stil zurückgesetzt.";
 });
 sync();apply();
}
window.ChartStudioAppearance=Object.freeze({mount,switchAccount,settings,applySettings,normalize});
})();

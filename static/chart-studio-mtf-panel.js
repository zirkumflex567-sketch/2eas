/* Read-only MTF structure inspector for the two strictly verified chart accounts.
 * Explicit user refresh only; GET /api/candles (no trading/order or profile routes).
 */
(()=>{"use strict";
const TIMEFRAMES=Object.freeze(["D1","H4","H1"]);
const MAX_DURATION_MS=60000;
let state=null,serial=0;
function announce(message){if(state)state.message.textContent=message}
function cancel(){
 if(!state)return;
 serial++;
 state.abort?.abort();state.abort=null;
 state.refresh.disabled=false;
}
function switchContext(account,tf){
 if(!state)return;
 cancel();state.account=account;state.tf=tf;
 state.rows.replaceChildren();state.result=null;
 announce("Konto/Zeitfenster gewechselt. Bitte MTF-Analyse neu starten.");
}
function label(f){
 if(f.status!=="READY")return "Unbekannt (weniger als 201 geschlossene Kerzen)";
 return ({UP:"Aufwärtstrend",DOWN:"Abwärtstrend",SIDEWAYS:"Keine EMA-Einigkeit"})[f.bias]||"Nicht verfügbar";
}
function render(result){
 if(!state)return;
 const rows=document.createDocumentFragment();
 for(const tf of TIMEFRAMES){
  const f=result.frames[tf];
  const row=document.createElement("div");row.className="cs-mtf-row";
  const title=document.createElement("strong");title.textContent=tf+" · "+label(f);
  const info=document.createElement("span");
  const when=f.lastClosedBarTime?
   new Date(f.lastClosedBarTime*1000).toLocaleString("de-DE",{timeZone:"UTC"})+" UTC":"—";
  info.textContent=f.closedBars+" abgeschlossene Kerzen · Letzte: "+when;
  const ema=document.createElement("small");
  ema.textContent=f.status==="READY"?
   "Close "+f.lastClose.toFixed(2)+" · EMA21 "+f.ema21.toFixed(2)+
    " · EMA50 "+f.ema50.toFixed(2)+" · EMA200 "+f.ema200.toFixed(2):
    "Nicht genügend Historie für EMA200";
  row.append(title,info,ema);rows.append(row);
 }
 state.rows.replaceChildren(rows);
 announce("MTF · "+result.ready+"/3 Zeitfenster auswertbar · "+
  (result.agreement==="UP"?"Struktur einheitlich aufwärts":
   result.agreement==="DOWN"?"Struktur einheitlich abwärts":"Keine vollständige Trendausrichtung")+
  " · nur Indikatorstruktur, KEINE Tradefreigabe.");
}
async function refresh(){
 if(!state)return false;
 cancel();
 const generation=serial,account=state.account;
 const controller=new AbortController();state.abort=controller;
 state.refresh.disabled=true;state.rows.replaceChildren();
 announce("Lade ausschließlich verifizierte Brokerkerzen für D1/H4/H1 …");
 const asOf=Math.floor(Date.now()/1000),data={};
 const scope=location.pathname.startsWith("/stt")?"/stt":"";
 const abortTimer=setTimeout(()=>controller.abort(),MAX_DURATION_MS);
 try{
  for(const tf of TIMEFRAMES){
   const url=scope+"/api/candles?account="+encodeURIComponent(account)+
    "&tf="+encodeURIComponent(tf)+"&count=350";
   const response=await fetch(url,{method:"GET",cache:"no-store",credentials:"same-origin",
    signal:controller.signal,headers:{Accept:"application/json"}});
   if(!response.ok)throw Error("Broker-Historie "+tf+" HTTP "+response.status);
   const body=await response.json();
   if(body?.account?.id!==account||body?.timeframe!==tf||!Array.isArray(body?.candles))
    throw Error("Broker-Zuordnung oder Zeitfenster nicht bestätigt.");
   data[tf]=body.candles;
   if(serial!==generation||state.account!==account)return false;
  }
  const analysis=window.ChartStudioMTF?.calculate(data,asOf);
  if(!analysis)throw Error("Berechnungsmodul nicht verfügbar.");
  if(serial!==generation||state.account!==account)return false;
  state.result=analysis;render(analysis);return true;
 }catch(err){
  if(serial===generation){
   state.result=null;state.rows.replaceChildren();
   announce("MTF nicht verfügbar: "+(err?.name==="AbortError"?"Abruf abgebrochen":err.message)+
    ". Keine Ersatzdaten eines anderen Kontos.");
  }
  return false;
 }finally{
  clearTimeout(abortTimer);
  if(serial===generation){state.abort=null;state.refresh.disabled=false}
 }
}
function inspect(){
 if(!state)return null;
 return {account:state.account,tf:state.tf,ready:state.result?.ready||0,
  agreement:state.result?.agreement||null,asOf:state.result?.asOf||null,
  processing:!!state.abort};
}
function mount({panel,account="titan",timeframe="M15"}={}){
 if(!panel||state)return false;
 const root=document.createElement("details");root.className="cs-mtf";
 const summary=document.createElement("summary");summary.textContent="Multi-Timeframe-Trendstruktur (D1 / H4 / H1)";
 const intro=document.createElement("p");
 intro.textContent="Nur geschlossene Brokerkerzen, EMA21/50/200, gemeinsame UTC-Zeitbasis. Kein EA-Signal oder Orderversand.";
 const button=document.createElement("button");button.type="button";button.textContent="MTF-Brokerdaten prüfen";
 const message=document.createElement("output");message.setAttribute("role","status");message.setAttribute("aria-live","polite");
 const rows=document.createElement("div");rows.className="cs-mtf-rows";
 root.append(summary,intro,button,message,rows);panel.append(root);
 state={root,refresh:button,message,rows,account,tf:timeframe,abort:null,result:null};
 button.addEventListener("click",refresh);
 announce("Auf Klick werden D1/H4/H1 für dieses Konto gelesen.");
 return true;
}
window.ChartStudioMTFPanel=Object.freeze({mount,refresh,switchContext,inspect});
})();
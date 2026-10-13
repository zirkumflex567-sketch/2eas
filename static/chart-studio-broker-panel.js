(()=>{
"use strict";
let state=null;
const el=(tag,attrs={},text="")=>{const node=document.createElement(tag);for(const [key,value] of Object.entries(attrs))node.setAttribute(key,value);if(text)node.textContent=text;return node;};
const cell=value=>{const td=document.createElement("td");td.textContent=value==null||value===""?"—":String(value);return td;};
function table(container,headers,rows){
 const t=container.querySelector("table"),head=t.tHead||t.createTHead(),body=t.tBodies[0]||t.createTBody();
 head.replaceChildren();const tr=head.insertRow();for(const label of headers){const th=document.createElement("th");th.scope="col";th.textContent=label;tr.append(th)}
 body.replaceChildren();for(const row of rows){const r=body.insertRow();for(const value of row)r.append(cell(value));}
}
function clear(){
 if(!state)return;
 table(state.positions,["Ticket","Seite","Lots","Einstieg","SL","TP","P/L (MT5)","Swap (MT5)","Währung"],[]);
 table(state.orders,["Ticket","Typ","Lots","Preis","Stop-Limit","SL","TP"],[]);
 table(state.trades,["Deal","Seite","Entry","Preis","Lots","P/L","Kosten","Währung"],[]);
}
function clearBrokerMarkers(){window.ChartStudioBeta?.updateBrokerDeals(state?.account,[])}
function markerSummary(counts){
 if(!state?.historyBaseStatus)return;
 state.markerCounts=counts||{plotted:0,unplotted:0};
 const {plotted,unplotted}=state.markerCounts;
 const suffix=plotted+unplotted?" · Chart: "+plotted+" Deal-Marker, "+unplotted+" nicht darstellbar (keine exakte Kerzenzeit)":" · Keine darstellbaren Deal-Marker";
 state.historyStatus.textContent=state.historyBaseStatus+suffix;
}
function queryFilters(){
 const ticket=state.fields.ticket.value.trim(),magic=state.fields.magic.value.trim(),ownership=state.fields.ownership.value;
 return {ticket,magic,manual:ownership==="ANY"?null:ownership==="MANUAL"};
}
function filterParams(params){const f=queryFilters();if(f.ticket)params.set("ticket",f.ticket);if(f.magic)params.set("magic",f.magic);if(f.manual!==null)params.set("manual",String(f.manual));}
function apiScope(){return window.location.pathname.startsWith("/stt")?"/stt":"";}
async function loadPositions(){
 if(!state)return;
 const token=++state.positionToken,account=state.account;
 table(state.positions,["Ticket","Seite","Lots","Einstieg","SL","TP","P/L (MT5)","Swap (MT5)","Währung"],[]);
 table(state.orders,["Ticket","Typ","Lots","Preis","Stop-Limit","SL","TP"],[]);
 state.positionStatus.textContent="MT5-Brokerdaten werden gelesen …";
 const params=new URLSearchParams({account,symbol:"XAUUSD"});filterParams(params);
 try{
  const response=await fetch(apiScope()+"/api/chart/v1/positions?"+params.toString(),{cache:"no-store"});
  if(token!==state.positionToken||account!==state.account)return;
  if(!response.ok)throw new Error(response.status===503?"Brokerdaten sind nicht verfügbar.":"Brokerdaten konnten nicht geladen werden (HTTP "+response.status+").");
  const data=await response.json();
  if(data.account!==account||data.symbol!=="XAUUSD"||data.source!=="MT5_VERIFIED"||data.canExecute!==false)throw new Error("Brokerantwort hat keinen gültigen Read-only-Scope.");
  table(state.positions,["Ticket","Seite","Lots","Einstieg","SL","TP","P/L (MT5)","Swap (MT5)","Währung"],(data.positions||[]).map(x=>[x.ticket,x.type,x.volume,x.price_open,x.sl,x.tp,x.profit,x.swap,x.currency]));
  table(state.orders,["Ticket","Typ","Lots","Preis","Stop-Limit","SL","TP"],(data.orders||[]).map(x=>[x.ticket,x.type,x.volume_current,x.price_open,x.price_stoplimit,x.sl,x.tp]));
  state.positionStatus.textContent="Quelle MT5_VERIFIED · "+(data.positions.length||0)+" Position(en), "+(data.orders.length||0)+" Pending Order(s) · Nur lesen";
 }catch(error){if(token===state.positionToken)state.positionStatus.textContent=error.message;}
}
function utcRange(){
 const from=state.fields.from.value,to=state.fields.to.value;
 if(!/^\d{4}-\d\d-\d\d$/.test(from)||!/^\d{4}-\d\d-\d\d$/.test(to))throw new Error("Bitte beide UTC-Daten angeben.");
 const validCalendarDate=value=>{const parsed=Date.parse(value+"T00:00:00Z");return Number.isFinite(parsed)&&new Date(parsed).toISOString().slice(0,10)===value;};
 if(!validCalendarDate(from)||!validCalendarDate(to))throw new Error("Bitte gültige UTC-Kalenderdaten angeben.");
 const start=Date.parse(from+"T00:00:00Z"),stop=Date.parse(to+"T23:59:59.999Z");
 if(!Number.isFinite(start)||!Number.isFinite(stop)||stop<=start||stop-start>31*86400000)throw new Error("Der UTC-Zeitraum muss positiv und höchstens 31 Tage lang sein.");
 return {fromUtc:new Date(start).toISOString(),toUtc:new Date(stop).toISOString()};
}
async function loadTrades(cursor=null){
 if(!state)return;
 if(!cursor)table(state.trades,["Deal","Seite","Entry","Preis","Lots","P/L","Kosten","Währung"],[]);
 if(!cursor)clearBrokerMarkers();
 let range;try{range=utcRange();}catch(error){state.historyBaseStatus=null;clearBrokerMarkers();state.historyStatus.textContent=error.message;state.next.disabled=true;return;}
 const token=++state.historyToken,account=state.account;state.historyBaseStatus=null;
 state.historyStatus.textContent="Deal-Historie wird gelesen …";state.next.disabled=true;
 const params=new URLSearchParams({account,symbol:"XAUUSD",...range,limit:"50"});filterParams(params);if(cursor)params.set("cursor",cursor);
 try{
  const response=await fetch(apiScope()+"/api/chart/v1/trades?"+params.toString(),{cache:"no-store"});
  if(token!==state.historyToken||account!==state.account)return;
  if(response.status===410){state.cursor=null;clearBrokerMarkers();state.historyStatus.textContent="Historiencursor ungültig oder abgelaufen · Abfrage bitte neu starten.";return;}
  if(!response.ok)throw new Error(response.status===503?"Deal-Historie ist nicht verfügbar.":response.status===422?"UTC-Zeitraum oder Filter ungültig (HTTP 422).":"Deal-Historie konnte nicht geladen werden (HTTP "+response.status+").");
  const data=await response.json();
  if(data.account!==account||data.symbol!=="XAUUSD"||data.source!=="MT5_VERIFIED"||data.canExecute!==false)throw new Error("Historienantwort hat keinen gültigen Read-only-Scope.");
  table(state.trades,["Deal","Seite","Entry","Preis","Lots","P/L","Kosten","Währung"],(data.trades||[]).map(x=>[x.ticket,x.side,x.entry,x.price,x.volume,x.profit,(Number(x.commission)+Number(x.swap)+Number(x.fee)).toFixed(2),x.currency]));
  const markerCounts=window.ChartStudioBeta?.updateBrokerDeals(account,data.trades||[])||{plotted:0,unplotted:0};
  state.cursor=data.nextCursor||null;state.next.disabled=!state.cursor;
  state.historyBaseStatus="Quelle MT5_VERIFIED · "+(data.trades.length||0)+" Deal(s) · "+data.fromUtc+" bis "+data.toUtc+" UTC · Nur lesen";
  markerSummary(markerCounts);
 }catch(error){if(token===state.historyToken){state.cursor=null;clearBrokerMarkers();state.historyStatus.textContent=error.message;}}
}
function mount({panel,account}){
 if(state||!panel)return;
 const details=el("details",{class:"cs-broker-read-panel"});
 details.innerHTML='<summary>Brokerbuch · Positionen, Pending Orders &amp; Deals · nur lesen</summary><div class="cs-broker-read-content"><p>Verifizierte MT5-Daten. Deals werden nicht zu Positionen rekonstruiert; EA-Zuordnung bleibt UNKNOWN, wenn sie nicht belegt ist.</p><label>Ticket <input name="ticket" inputmode="numeric" maxlength="20" autocomplete="off"></label><label>Magic <input name="magic" inputmode="numeric" maxlength="20" autocomplete="off"></label><label>Zuordnung <select name="ownership" autocomplete="off"><option value="ANY">Alle / unbekannt</option><option value="MANUAL">MANUAL</option><option value="NON_MANUAL">Nicht MANUAL (UNKNOWN möglich)</option></select></label><button type="button" id="cs-broker-positions-refresh">Positionen aktualisieren</button><p id="cs-broker-positions-status" role="status" aria-live="polite"></p><h4>Offene Positionen</h4><div class="cs-broker-table-wrap" id="cs-broker-positions"><table><thead></thead><tbody></tbody></table></div><h4>Pending Orders</h4><div class="cs-broker-table-wrap" id="cs-broker-orders"><table><thead></thead><tbody></tbody></table></div><fieldset><legend>Deal-Historie · UTC</legend><label>Von <input type="date" name="fromUtc" autocomplete="off"></label><label>Bis einschließlich <input type="date" name="toUtc" autocomplete="off"></label><button type="button" id="cs-broker-history-load">Historie laden</button><button type="button" id="cs-broker-history-next" disabled>Nächste Seite</button></fieldset><p id="cs-broker-history-status" role="status" aria-live="polite">Historie noch nicht geladen.</p><div class="cs-broker-table-wrap" id="cs-broker-trades"><table><thead></thead><tbody></tbody></table></div></div>';
 panel.append(details);
 const now=new Date(),to=now.toISOString().slice(0,10),fromDate=new Date(now.getTime()-6*86400000),from=fromDate.toISOString().slice(0,10);
 const fields={ticket:details.querySelector('[name="ticket"]'),magic:details.querySelector('[name="magic"]'),ownership:details.querySelector('[name="ownership"]'),from:details.querySelector('[name="fromUtc"]'),to:details.querySelector('[name="toUtc"]')};
 fields.from.value=from;fields.to.value=to;
 state={panel,details,fields,account,positions:details.querySelector("#cs-broker-positions"),orders:details.querySelector("#cs-broker-orders"),trades:details.querySelector("#cs-broker-trades"),positionStatus:details.querySelector("#cs-broker-positions-status"),historyStatus:details.querySelector("#cs-broker-history-status"),next:details.querySelector("#cs-broker-history-next"),cursor:null,positionToken:0,historyToken:0};
 details.querySelector("#cs-broker-positions-refresh").addEventListener("click",loadPositions);
 details.querySelector("#cs-broker-history-load").addEventListener("click",()=>{state.cursor=null;loadTrades(null)});
 state.next.addEventListener("click",()=>{if(state.cursor)loadTrades(state.cursor)});
 for(const field of [fields.ticket,fields.magic,fields.ownership])field.addEventListener("change",()=>{state.cursor=null;state.historyToken++;state.historyBaseStatus=null;clearBrokerMarkers();table(state.trades,["Deal","Seite","Entry","Preis","Lots","P/L","Kosten","Währung"],[]);state.historyStatus.textContent="Filter geändert · Historie ab Seite eins neu laden.";state.next.disabled=true;loadPositions()});
 for(const field of [fields.from,fields.to])field.addEventListener("change",()=>{state.cursor=null;state.historyToken++;state.historyBaseStatus=null;clearBrokerMarkers();table(state.trades,["Deal","Seite","Entry","Preis","Lots","P/L","Kosten","Währung"],[]);state.historyStatus.textContent="Zeitraum geändert · Historie ab Seite eins neu laden.";state.next.disabled=true});
 loadPositions();
}
function setAccount(account){if(!state||typeof account!=="string")return;state.account=account;state.positionToken++;state.historyToken++;state.historyBaseStatus=null;state.cursor=null;state.fields.ticket.value="";state.fields.magic.value="";state.fields.ownership.value="ANY";clear();clearBrokerMarkers();state.positionStatus.textContent="Konto gewechselt · Brokerbuch wird neu geladen …";state.historyStatus.textContent="Konto gewechselt · Historie erneut laden.";state.next.disabled=true;loadPositions();}
window.ChartStudioBrokerPanel=Object.freeze({mount,setAccount,updateMarkerAvailability:markerSummary});
})();




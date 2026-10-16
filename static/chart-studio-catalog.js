/* Read-only Chart Studio indicator catalog. No broker calls, no trade routes. */
(()=>{"use strict";
const entries=Object.freeze([
 {id:"ema",name:"Exponential Moving Average",group:"Trend",desc:"EMA auf dem Preischart",type:"average",kind:"EMA"},
 {id:"sma",name:"Simple Moving Average",group:"Trend",desc:"SMA auf dem Preischart",type:"average",kind:"SMA"},
 {id:"wma",name:"Weighted Moving Average",group:"Trend",desc:"WMA auf dem Preischart",type:"average",kind:"WMA"},
 {id:"rma",name:"Wilder's Moving Average (RMA)",group:"Trend",desc:"Wilder-geglätteter Durchschnitt auf dem Preischart",type:"average",kind:"RMA"},
 {id:"smma",name:"Smoothed Moving Average (SMMA)",group:"Trend",desc:"Geglätteter gleitender Durchschnitt auf dem Preischart",type:"average",kind:"SMMA"},
 {id:"rsi",name:"Relative Strength Index",group:"Momentum",desc:"Separates RSI-Fenster",type:"oscillator",kind:"rsi"},
 {id:"macd",name:"MACD",group:"Momentum",desc:"MACD, Signal und Histogramm",type:"oscillator",kind:"macd"},
 {id:"atr",name:"Average True Range",group:"Volatilität",desc:"ATR-Fenster",type:"oscillator",kind:"atr"},
 {id:"adx",name:"Average Directional Index",group:"Trendstärke",desc:"ADX mit DI-Linien",type:"oscillator",kind:"adx"},
 {id:"cci",name:"Commodity Channel Index",group:"Momentum",desc:"CCI mit 20-Perioden-Standard",type:"oscillator",kind:"cci"},
 {id:"stochastic",name:"Stochastic",group:"Momentum",desc:"%K/%D-Oszillator mit konfigurierbarer Glättung",type:"oscillator",kind:"stochastic"},
 {id:"stochrsi",name:"StochRSI",group:"Momentum",desc:"Stochastic RSI mit RSI-, Stochastik- und Glättungsperioden",type:"oscillator",kind:"stochrsi"},
 {id:"supertrend",name:"Supertrend",group:"Trend",desc:"ATR-basierter, farbiger Trend-Overlay (Standard 10 × 3,0)",type:"toggle",kind:"supertrend"},
 {id:"donchian",name:"Donchian-Kanal",group:"Trend",desc:"20-Kerzen-Hoch/Tief mit Mittellinie; vollständiger Lookback erforderlich",type:"toggle",kind:"donchian"},
 {id:"keltner",name:"Keltner-Kanal",group:"Volatilität",desc:"EMA-Mittellinie mit Wilder-ATR-Bändern; konfigurierbare Perioden und Breite",type:"toggle",kind:"keltner"},
 {id:"atrBands",name:"ATR Bands",group:"Volatilität",desc:"SMA-Mittellinie plus/minus Wilder-ATR (20 / 14 × 2); eigener Kanal neben dem EMA-zentrierten Keltner",type:"toggle",kind:"atrBands"},
 {id:"linearRegression",name:"Linear Regression Channel",group:"Trend",desc:"Rollierende OLS-Mittellinie mit Residual-Standardabweichungsband; kein Vorwärtsprojekt",type:"toggle",kind:"linearRegression"},
 {id:"ichimoku",name:"Ichimoku Cloud",group:"Trend",desc:"Tenkan/Kijun, vorwärts projizierte Senkou-Wolke und rückwärts versetztes Chikou; Quellenzeiten bleiben sichtbar",type:"toggle",kind:"ichimoku"},
 {id:"pivots",name:"Classic Pivot Points",group:"Levels",desc:"Brokerbestätigte D1/W1-Pivots P sowie R1–R3/S1–S3 aus abgeschlossenen MT5-Kerzen; keine synthetischen Bars",type:"toggle",kind:"pivots"},
 {id:"momentum",name:"Momentum",group:"Momentum",desc:"Close-Differenz zum Schlusskurs vor der gewählten Periode",type:"oscillator",kind:"momentum"},
 {id:"roc",name:"Rate of Change (ROC)",group:"Momentum",desc:"Prozentuale Close-Änderung über die gewählte Periode",type:"oscillator",kind:"roc"},
 {id:"sar",name:"Parabolic SAR",group:"Trend",desc:"Trendfolge-Overlay mit konfigurierbarem Beschleunigungsfaktor (AF 0,02 / 0,20)",type:"toggle",kind:"sar"},
 {id:"obv",name:"On-Balance Volume (OBV)",group:"Volumen",desc:"Kumuliertes Broker-Realvolumen, sonst Tickvolumen-Proxy, nach Schlusskursrichtung",type:"oscillator",kind:"obv"},
 {id:"mfi",name:"Money Flow Index (MFI)",group:"Volumen",desc:"Typical-Price-Money-Flow aus Broker-Realvolumen oder ausdrücklich Tickvolumen-Proxy",type:"oscillator",kind:"mfi"},
 {id:"volume",name:"Broker-Volumen",group:"Volumen",desc:"Reales oder Tickvolumen, kein garantierter Orderflow",type:"toggle",kind:"volume"},
 {id:"vwap",name:"VWAP (UTC)",group:"Volumen",desc:"UTC-VWAP, bei Tickvolumen nur Proxy",type:"toggle",kind:"vwap"},
 {id:"footprint",name:"Footprint (echte Ausführungen)",group:"Orderflow",desc:"M1/M5/M15 · MT5-Ausführungsseite mit positivem Last und volume_real; sonst UNAVAILABLE",type:"footprint",kind:"footprint"}
]);
function search(query){const q=String(query||"").trim().toLocaleLowerCase("de");
 return entries.filter(e=>(e.name+" "+e.id+" "+e.group+" "+e.desc).toLocaleLowerCase("de").includes(q));}
function decimalParts(value,{signed=false,positive=false}={}){
 if(typeof value!=="string"||value.length>64)return null;
 const pattern=signed?/^-?(?:0|[1-9]\d*)(?:\.\d{1,28})?$/:/^(?:0|[1-9]\d*)(?:\.\d{1,28})?$/;
 if(!pattern.test(value)||value==="-0")return null;
 const negative=value[0]==="-",raw=negative?value.slice(1):value,[whole,fraction=""]=raw.split(".");
 const units=BigInt(whole+fraction)*(negative?-1n:1n);
 if(positive&&units<=0n)return null;
 return {units,scale:fraction.length};
}
function scaledUnits(value,scale){return value.units*10n**BigInt(scale-value.scale)}
function sameDelta(buy,sell,delta){
 const scale=Math.max(buy.scale,sell.scale,delta.scale);
 return scaledUnits(buy,scale)-scaledUnits(sell,scale)===scaledUnits(delta,scale);
}
function compareDecimals(a,b){const scale=Math.max(a.scale,b.scale);const left=scaledUnits(a,scale),right=scaledUnits(b,scale);return left<right?-1:left>right?1:0}
function mount({panel,getContext}={}){
 if(!panel||panel.querySelector(".cs-catalog"))return false;
 const root=document.createElement("section");root.className="cs-catalog";
 const title=document.createElement("h3");title.textContent="Indikator-Katalog";
 const label=document.createElement("label");label.textContent="Indikator suchen";
 const input=document.createElement("input");input.type="search";input.placeholder="EMA, RSI, MACD, Volumen …";
 input.setAttribute("aria-label","Indikator suchen");label.append(input);
 const counter=document.createElement("small"),list=document.createElement("div");list.className="cs-catalog-results";
 const status=document.createElement("output");status.setAttribute("role","status");status.setAttribute("aria-live","polite");
 const footprintStatus=document.createElement("output");footprintStatus.className="cs-footprint-status";
 footprintStatus.setAttribute("role","status");footprintStatus.setAttribute("aria-live","polite");
 footprintStatus.textContent="Footprint ungeprüft · Broker-Kerzenvolumen bleibt Tick-/Realvolumen, kein bestätigter Orderflow.";
 const footprintLevels=document.createElement("div");footprintLevels.className="cs-footprint-levels";
 root.append(title,label,counter,list,status,footprintStatus,footprintLevels);
 const inspectFootprint=async()=>{
  const scope=typeof getContext==="function"?getContext():null;
  if(!scope||typeof scope.account!=="string"||typeof scope.symbol!=="string"||typeof scope.timeframe!=="string"){
   footprintStatus.textContent="UNAVAILABLE · Chart-Scope nicht verfügbar.";return;
  }
  if(scope.account==="blueberry"){
   footprintStatus.textContent="UNAVAILABLE · Blueberry ist für Footprint-Demoprüfungen ausgeschlossen.";
   footprintLevels.replaceChildren();return;
  }
  if(!["M1","M5","M15"].includes(scope.timeframe)){
   footprintStatus.textContent="UNAVAILABLE · Footprint-Prüfung unterstützt M1, M5 oder M15.";
   footprintLevels.replaceChildren();return;
  }
  footprintStatus.textContent="Footprint wird read-only geprüft …";footprintLevels.replaceChildren();
  const query=new URLSearchParams({account:scope.account,symbol:scope.symbol,timeframe:scope.timeframe});
  const rootPath=window.location.pathname.startsWith("/stt")?"/stt":"";
  try{
   const response=await fetch(rootPath+"/api/chart/v1/footprint?"+query,{method:"GET",cache:"no-store",credentials:"same-origin"});
   const data=await response.json();
   const current=typeof getContext==="function"?getContext():null;
   if(!current||current.account!==scope.account||current.symbol!==scope.symbol||current.timeframe!==scope.timeframe)return;
   if(!response.ok||data?.account!==scope.account||data?.symbol!==scope.symbol||data?.timeframe!==scope.timeframe||data?.source!=="MT5_VERIFIED"||data?.canExecute!==false||!Array.isArray(data?.levels))throw Error("READ_SCOPE_INVALID");
   if(data.status==="UNAVAILABLE"){
    const reason=data.reason==="NO_VERIFIED_EXECUTIONS"?"keine verifizierten Ausführungen mit eindeutiger BUY/SELL-Seite und positivem Last/volume_real in der abgeschlossenen Kerze":data.reason==="CANDLE_TIME_FUTURE"?"MT5 meldet für den letzten geschlossenen Balken einen UTC-Zeitstempel in der Zukunft":String(data.reason||"Quelle nicht verfügbar");
    footprintStatus.textContent="UNAVAILABLE · "+reason+". Es werden keine Quote-/Tickzahl-Proxys verwendet.";return;
   }
   if(data.status!=="AVAILABLE"||data.levels.length===0||data.levels.length>10000||
      !Number.isInteger(data.executionCount)||data.executionCount<1||data.executionCount>100000||
      !Number.isInteger(data.tickCount)||data.tickCount<data.executionCount||data.tickCount>100000||
      !Number.isInteger(data.ignoredTickCount)||data.ignoredTickCount<0||data.ignoredTickCount>data.tickCount||
      data.executionCount+data.ignoredTickCount!==data.tickCount)throw Error("FOOTPRINT_DATA_INVALID");
   const table=document.createElement("table"),head=document.createElement("thead"),body=document.createElement("tbody"),row=document.createElement("tr");
   for(const label of ["Preis","Buy","Sell","Delta","Trades"]){const cell=document.createElement("th");cell.scope="col";cell.textContent=label;row.append(cell)}
   head.append(row);table.append(head,body);
   const seen=new Set();let tradeTotal=0,previousPrice=null;
   for(const level of data.levels){
    const price=decimalParts(level?.price,{positive:true}),buy=decimalParts(level?.buyVolume),sell=decimalParts(level?.sellVolume),delta=decimalParts(level?.delta,{signed:true});
    if(!price||!buy||!sell||!delta||!Number.isInteger(level?.trades)||level.trades<1||level.trades>data.executionCount||
       (buy.units===0n&&sell.units===0n)||!sameDelta(buy,sell,delta)||seen.has(level.price)||(previousPrice&&compareDecimals(previousPrice,price)>=0))throw Error("FOOTPRINT_LEVEL_INVALID");
    seen.add(level.price);previousPrice=price;tradeTotal+=level.trades;
    const tr=document.createElement("tr");
    for(const value of [level.price,level.buyVolume,level.sellVolume,level.delta,String(level.trades)]){const cell=document.createElement("td");cell.textContent=value;tr.append(cell)}
    body.append(tr);
   }
   if(tradeTotal!==data.executionCount)throw Error("FOOTPRINT_COUNT_MISMATCH");
   footprintStatus.textContent="AVAILABLE · "+data.executionCount+" verifizierte Ausführungen · "+String(data.barOpenUtc||"")+" · "+scope.account+" / "+scope.symbol+" / "+scope.timeframe;
   footprintLevels.append(table);
  }catch(error){
   const current=typeof getContext==="function"?getContext():null;
   if(current?.account===scope.account&&current?.symbol===scope.symbol&&current?.timeframe===scope.timeframe){
    footprintStatus.textContent="UNAVAILABLE · MT5-Footprint konnte nicht verifiziert werden.";footprintLevels.replaceChildren();
   }
  }
 };
 const render=()=>{
  const filtered=search(input.value);counter.textContent=filtered.length+" Treffer";list.replaceChildren();
  for(const e of filtered){
   const row=document.createElement("div");row.className="cs-catalog-entry";row.dataset.indicator=e.id;
   const info=document.createElement("span");const name=document.createElement("strong");
   name.textContent=e.name;const detail=document.createElement("small");
   detail.textContent=e.group+" · "+e.desc;info.append(name,detail);
   const button=document.createElement("button");button.type="button";button.textContent=e.type==="footprint"?"Prüfen":e.type==="toggle"?"Anzeigen":"Hinzufügen";
   button.setAttribute("aria-label",e.type==="footprint"?"Footprint-Daten prüfen":e.name+" hinzufügen");
   button.addEventListener("click",()=>{
    if(e.type==="footprint"){inspectFootprint();return;}
    let ok=false;
    if(e.type==="average")ok=window.ChartStudioAverages?.add(e.kind,e.kind==="EMA"?21:20)===true;
    else if(e.type==="oscillator")ok=window.ChartStudioOscillators?.add(e.kind)===true;
    else{const api=window.ChartStudioIndicators;const config=api?.settings()?.[e.kind];
     if(config&&!config.enabled){api.updateConfig(e.kind,"enabled",true);ok=true}
     else if(config?.enabled){ok=true}}
    status.textContent=ok?e.name+" aktiviert. Einstellungen im jeweiligen Editor anpassen.":e.name+" konnte nicht hinzugefügt werden (Limit oder Modul nicht geladen).";
   });
   row.append(info,button);list.append(row);
  }
  if(!filtered.length){const no=document.createElement("p");no.textContent="Kein passender Indikator.";list.append(no)}
 };
 input.addEventListener("input",render);
 panel.prepend(root);render();return true;
}
window.ChartStudioCatalog=Object.freeze({mount,search,entries});
})();

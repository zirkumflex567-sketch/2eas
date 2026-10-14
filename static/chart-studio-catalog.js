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
 {id:"volume",name:"Broker-Volumen",group:"Volumen",desc:"Reales oder Tickvolumen, kein garantierter Orderflow",type:"toggle",kind:"volume"},
 {id:"vwap",name:"VWAP (UTC)",group:"Volumen",desc:"UTC-VWAP, bei Tickvolumen nur Proxy",type:"toggle",kind:"vwap"}
]);
function search(query){const q=String(query||"").trim().toLocaleLowerCase("de");
 return entries.filter(e=>(e.name+" "+e.id+" "+e.group+" "+e.desc).toLocaleLowerCase("de").includes(q));}
function mount({panel}={}){
 if(!panel||panel.querySelector(".cs-catalog"))return false;
 const root=document.createElement("section");root.className="cs-catalog";
 const title=document.createElement("h3");title.textContent="Indikator-Katalog";
 const label=document.createElement("label");label.textContent="Indikator suchen";
 const input=document.createElement("input");input.type="search";input.placeholder="EMA, RSI, MACD, Volumen …";
 input.setAttribute("aria-label","Indikator suchen");label.append(input);
 const counter=document.createElement("small"),list=document.createElement("div");list.className="cs-catalog-results";
 const status=document.createElement("output");status.setAttribute("role","status");status.setAttribute("aria-live","polite");
 root.append(title,label,counter,list,status);
 const render=()=>{
  const filtered=search(input.value);counter.textContent=filtered.length+" Treffer";list.replaceChildren();
  for(const e of filtered){
   const row=document.createElement("div");row.className="cs-catalog-entry";row.dataset.indicator=e.id;
   const info=document.createElement("span");const name=document.createElement("strong");
   name.textContent=e.name;const detail=document.createElement("small");
   detail.textContent=e.group+" · "+e.desc;info.append(name,detail);
   const button=document.createElement("button");button.type="button";button.textContent=e.type==="toggle"?"Anzeigen":"Hinzufügen";
   button.setAttribute("aria-label",e.name+" hinzufügen");
   button.addEventListener("click",()=>{
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
(function(){
"use strict";
const MAX_BARS=100000,MAX_SESSIONS=20,MAX_RESULTS=3000,PROXY="STRUCTURE_LIQUIDITY_HYPOTHESIS";
const PRESETS=Object.freeze([
 {id:"asia",label:"Asia · Tokio",timeZone:"Asia/Tokyo",start:"09:00",end:"18:00"},
 {id:"frankfurt",label:"Frankfurt",timeZone:"Europe/Berlin",start:"08:00",end:"17:00"},
 {id:"london",label:"London",timeZone:"Europe/London",start:"08:00",end:"17:00"},
 {id:"new-york",label:"New York",timeZone:"America/New_York",start:"08:00",end:"17:00"},
 {id:"rollover",label:"New York Rollover",timeZone:"America/New_York",start:"17:00",end:"18:00"}
]);
function validTime(value){return typeof value==="string"&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)}
function zoneFormatter(timeZone){try{return new Intl.DateTimeFormat("en-GB-u-ca-gregory-nu-latn",{timeZone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"})}catch(_){return null}}
function zonedParts(epochMs,formatter){const values={};for(const part of formatter.formatToParts(new Date(epochMs)))if(part.type!=="literal")values[part.type]=Number(part.value);return {year:values.year,month:values.month,day:values.day,hour:values.hour,minute:values.minute,second:values.second}}
function dateKey(parts){return String(parts.year).padStart(4,"0")+"-"+String(parts.month).padStart(2,"0")+"-"+String(parts.day).padStart(2,"0")}
function parseDateKey(key){if(typeof key!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(key))return null;const [year,month,day]=key.split("-").map(Number),date=new Date(Date.UTC(year,month-1,day));return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day?date:null}
function addDate(key,amount){const date=parseDateKey(key);if(!date)return null;date.setUTCDate(date.getUTCDate()+amount);return dateKey({year:date.getUTCFullYear(),month:date.getUTCMonth()+1,day:date.getUTCDate()})}
function localToEpoch(date,time,formatter){
 const day=parseDateKey(date);if(!day||!validTime(time)||!formatter)return null;
 const [hour,minute]=time.split(":").map(Number),target=Date.UTC(day.getUTCFullYear(),day.getUTCMonth(),day.getUTCDate(),hour,minute),desired={year:day.getUTCFullYear(),month:day.getUTCMonth()+1,day:day.getUTCDate(),hour,minute,second:0};
 let guess=target;
 for(let i=0;i<6;i++){const p=zonedParts(guess,formatter),represented=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second),delta=target-represented;if(delta===0)break;guess+=delta}
 const got=zonedParts(guess,formatter);
 if(got.year!==desired.year||got.month!==desired.month||got.day!==desired.day||got.hour!==desired.hour||got.minute!==desired.minute||got.second!==0)return null;
 return guess/1000;
}
function cleanSession(raw){
 if(!raw||typeof raw!=="object"||Array.isArray(raw)||typeof raw.id!=="string"||!/^[a-z0-9_-]{1,32}$/i.test(raw.id)||typeof raw.label!=="string"||!raw.label.trim()||raw.label.length>48||/[\u0000-\u001f\u007f]/.test(raw.label)||typeof raw.timeZone!=="string"||raw.timeZone.length>64||!validTime(raw.start)||!validTime(raw.end))return null;
 const formatter=zoneFormatter(raw.timeZone);if(!formatter)return null;
 return {id:raw.id,label:raw.label.trim(),timeZone:raw.timeZone,start:raw.start,end:raw.end,formatter};
}
function sessionWindows(fromUtc,toUtc,sessions){
 if(!Number.isFinite(fromUtc)||!Number.isFinite(toUtc)||fromUtc>toUtc||!Array.isArray(sessions))return [];
 const clean=sessions.slice(0,MAX_SESSIONS).map(cleanSession).filter(Boolean),windows=[];
 const first=new Date(fromUtc*1000);first.setUTCHours(0,0,0,0);first.setUTCDate(first.getUTCDate()-2);
 const last=new Date(toUtc*1000);last.setUTCHours(0,0,0,0);last.setUTCDate(last.getUTCDate()+2);
 for(let cursor=first;cursor<=last;cursor.setUTCDate(cursor.getUTCDate()+1)){
  const localDate=dateKey({year:cursor.getUTCFullYear(),month:cursor.getUTCMonth()+1,day:cursor.getUTCDate()}),weekday=cursor.getUTCDay();if(weekday===0||weekday===6)continue;
  for(const session of clean){let endDate=localDate;if(session.end<=session.start)endDate=addDate(localDate,1);
   const start=localToEpoch(localDate,session.start,session.formatter),end=localToEpoch(endDate,session.end,session.formatter);
   if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end<fromUtc||start>toUtc)continue;
   windows.push({id:session.id,label:session.label,timeZone:session.timeZone,localDate,start,end,startUtc:new Date(start*1000).toISOString(),endUtc:new Date(end*1000).toISOString()});
  }
 }
 return windows.sort((a,b)=>a.start-b.start||a.id.localeCompare(b.id)).slice(0,MAX_RESULTS);
}
function cleanBars(input,timeframeSeconds,asOfUtc){
 if(!Array.isArray(input)||input.length>MAX_BARS||!Number.isFinite(timeframeSeconds)||timeframeSeconds<=0||timeframeSeconds>86400||!Number.isFinite(asOfUtc))return [];
 const sorted=input.filter(row=>row&&Number.isSafeInteger(row.time)&&row.time>0&&[row.open,row.high,row.low,row.close].every(v=>Number.isFinite(Number(v))&&Number(v)>0))
  .map(row=>({time:row.time,open:Number(row.open),high:Number(row.high),low:Number(row.low),close:Number(row.close)}))
  .filter(row=>row.high>=Math.max(row.open,row.low,row.close)&&row.low<=Math.min(row.open,row.high,row.close)&&row.time+timeframeSeconds<=asOfUtc)
  .sort((a,b)=>a.time-b.time);
 const out=[];for(const row of sorted){if(out.length&&out[out.length-1].time===row.time)continue;out.push(row)}return out;
}
function range(rows){if(!rows.length)return null;let high=-Infinity,low=Infinity;for(const row of rows){high=Math.max(high,row.high);low=Math.min(low,row.low)}return {high,low,barCount:rows.length}}
function coverage(rows,start,end,timeframeSeconds,asOfUtc){
 if(end>asOfUtc)return "OPEN";if(!rows.length)return "UNKNOWN";
 const ordered=[...rows].sort((a,b)=>a.time-b.time),coversStart=ordered[0].time<=start+timeframeSeconds,coversEnd=ordered[ordered.length-1].time+timeframeSeconds>=end;
 let gap=false;for(let i=1;i<ordered.length;i++)if(ordered[i].time-ordered[i-1].time>timeframeSeconds*1.5){gap=true;break}
 return coversStart&&coversEnd&&!gap?"COMPLETE":"PARTIAL";
}
function makeSessions(bars,config,tf,asOf){
 if(!bars.length)return [];
 const windows=sessionWindows(bars[0].time,bars[bars.length-1].time+tf,config.sessions||[]),results=[];
 for(const win of windows){const rows=bars.filter(bar=>bar.time<win.end&&bar.time+tf>win.start),values=range(rows),orEnd=Math.min(win.end,win.start+Math.max(1,Number(config.openingRangeMinutes)||60)*60),openingRows=rows.filter(bar=>bar.time<orEnd&&bar.time+tf>win.start),opening=range(openingRows);
  results.push({...win,...(values||{high:null,low:null,barCount:0}),coverage:coverage(rows,win.start,win.end,tf,asOf),openingRange:{startUtc:win.startUtc,endUtc:new Date(orEnd*1000).toISOString(),...(opening||{high:null,low:null,barCount:0}),coverage:coverage(openingRows,win.start,orEnd,tf,asOf)},calendar:"WEEKDAYS_ONLY_HOLIDAYS_UNKNOWN"});
 }
 return results;
}
function localPeriods(bars,timeZone,asOf,tf){
 const formatter=zoneFormatter(timeZone);if(!formatter)return {timeZone,previousDay:null,previousWeek:null,coverage:"UNKNOWN"};
 const today=dateKey(zonedParts(asOf*1000,formatter)),previousDayKey=addDate(today,-1),date=parseDateKey(today),weekday=(date.getUTCDay()+6)%7,currentWeekStart=addDate(today,-weekday),previousWeekStart=addDate(currentWeekStart,-7),previousWeekEnd=addDate(currentWeekStart,-1);
 const dayRows=bars.filter(bar=>dateKey(zonedParts(bar.time*1000,formatter))===previousDayKey),weekRows=bars.filter(bar=>{const key=dateKey(zonedParts(bar.time*1000,formatter));return key>=previousWeekStart&&key<=previousWeekEnd});
 const build=(rows,startDate,endDate)=>{const value=range(rows);if(!value)return {coverage:"UNKNOWN",timeZone,startDate,endDate,high:null,low:null,barCount:0,source:"MT5_VERIFIED_OHLC_OBSERVED_ONLY"};return {...value,coverage:"OBSERVED_ONLY",timeZone,startDate,endDate,source:"MT5_VERIFIED_OHLC_OBSERVED_ONLY"}};
 return {timeZone,previousDay:build(dayRows,previousDayKey,previousDayKey),previousWeek:build(weekRows,previousWeekStart,previousWeekEnd),timeframeSeconds:tf};
}
function trueRanges(bars){return bars.map((bar,i)=>i?Math.max(bar.high-bar.low,Math.abs(bar.high-bars[i-1].close),Math.abs(bar.low-bars[i-1].close)):bar.high-bar.low)}
function structure(bars,config,tf,asOf){
 const strength=Math.max(1,Math.min(20,Math.floor(Number(config.swingStrength)||2))),atrPeriod=Math.max(2,Math.min(200,Math.floor(Number(config.atrPeriod)||14))),atrMult=Math.max(0,Math.min(2,Number(config.equalAtrMultiplier)||0.1)),tick=Number(config.tickSize),hasTick=Number.isFinite(tick)&&tick>0&&tick<=1e6,ranges=trueRanges(bars),pivots=[];
 for(let i=strength;i<bars.length-strength&&pivots.length<MAX_RESULTS;i++){
  const row=bars[i],confirm=bars[i+strength];if(confirm.time+tf>asOf)continue;
  const left=bars.slice(i-strength,i),right=bars.slice(i+1,i+strength+1),isHigh=left.every(v=>row.high>v.high)&&right.every(v=>row.high>v.high),isLow=left.every(v=>row.low<v.low)&&right.every(v=>row.low<v.low);
  const start=Math.max(0,i-atrPeriod+1),atrRows=ranges.slice(start,i+1),atr=atrRows.length>=atrPeriod?atrRows.reduce((a,b)=>a+b,0)/atrRows.length:null;
  if(isHigh)pivots.push({kind:"HIGH",time:row.time,timeUtc:new Date(row.time*1000).toISOString(),price:row.high,confirmedAtUtc:new Date((confirm.time+tf)*1000).toISOString(),confirmedAt:confirm.time+tf,atr});
  if(isLow)pivots.push({kind:"LOW",time:row.time,timeUtc:new Date(row.time*1000).toISOString(),price:row.low,confirmedAtUtc:new Date((confirm.time+tf)*1000).toISOString(),confirmedAt:confirm.time+tf,atr});
 }
 const equalLevels=[];for(const kind of ["HIGH","LOW"]){const same=pivots.filter(item=>item.kind===kind);for(let i=1;i<same.length;i++){const a=same[i-1],b=same[i];if(!a.atr||!b.atr)continue;const tolerance=Math.max(hasTick?tick*2:0,((a.atr+b.atr)/2)*atrMult);if(Math.abs(a.price-b.price)>tolerance)continue;equalLevels.push({kind,level:(a.price+b.price)/2,tolerance,firstTimeUtc:a.timeUtc,secondTimeUtc:b.timeUtc,confirmedAtUtc:b.confirmedAtUtc,evidenceType:PROXY})}}
 const confirmRows=Array.isArray(config.confirmCandles)?config.confirmCandles:bars,confirmTf=Math.max(tf,Math.min(86400,Number(config.confirmTimeframeSeconds)||tf)),closedConfirm=cleanBars(confirmRows,confirmTf,asOf),sweeps=[];
 for(const level of equalLevels){for(const bar of bars){if(bar.time<level.confirmedAt||sweeps.length>=MAX_RESULTS)continue;
  const above=level.kind==="HIGH"&&bar.high>level.level+level.tolerance&&bar.close<level.level,below=level.kind==="LOW"&&bar.low<level.level-level.tolerance&&bar.close>level.level;if(!above&&!below)continue;
  const confirm=closedConfirm.find(item=>item.time>=bar.time+tf&&(above?item.close<level.level:item.close>level.level));if(!confirm)continue;
  sweeps.push({direction:above?"ABOVE":"BELOW",level:level.level,wickHigh:bar.high,wickLow:bar.low,close:bar.close,timeUtc:new Date(bar.time*1000).toISOString(),confirmedAtUtc:new Date((confirm.time+confirmTf)*1000).toISOString(),confirmTimeframeSeconds:confirmTf,evidenceType:PROXY,label:"Struktur-/Liquiditäts-Hypothese"});
 }}
 return {pivots,equalLevels,sweeps,confirmTimeframeSeconds:confirmTf,evidenceType:PROXY};
}
function analyze(input,config={}){
 const tf=Number(config.timeframeSeconds),asOf=Number(config.asOfUtc),bars=cleanBars(input,tf,asOf),timezone=typeof config.calendarTimeZone==="string"?config.calendarTimeZone:"UTC";
 if(!Number.isFinite(tf)||tf<=0||tf>86400||!Number.isFinite(asOf)||asOf<=0)return {source:"MT5_VERIFIED_OHLC",timeframeSeconds:null,asOfUtc:null,bars:0,sessions:[],previous:{timeZone:timezone,previousDay:null,previousWeek:null,coverage:"UNKNOWN"},pivots:[],equalLevels:[],sweeps:[],confirmTimeframeSeconds:null,evidenceType:PROXY,weekendGaps:[]};
 const from=bars[0]?.time??asOf,to=bars[bars.length-1]?.time+tf??asOf;
 const gaps=[];for(let i=1;i<bars.length;i++){const previous=bars[i-1],current=bars[i];if(current.time-previous.time>tf*1.5&&gaps.length<MAX_RESULTS)gaps.push({fromUtc:new Date((previous.time+tf)*1000).toISOString(),toUtc:new Date(current.time*1000).toISOString(),label:"Datenlücke · Wochenend-/Handelspause möglich, Ursache ungeprüft"})}
 return {source:"MT5_VERIFIED_OHLC",timeframeSeconds:tf,asOfUtc:new Date(asOf*1000).toISOString(),bars:bars.length,sessions:makeSessions(bars,config,tf,asOf),previous:localPeriods(bars,timezone,asOf,tf),...structure(bars,config,tf,asOf),weekendGaps:gaps};
}
function draw(ctx,model,coordinates,dims){
 if(!ctx||!model||!coordinates||!dims)return;
 const right=Math.min(dims.w,Math.max(0,dims.w-1));
 for(const session of model.sessions||[]){const x1=coordinates.timeToX(session.start),x2=coordinates.timeToX(session.end);if(!Number.isFinite(x1)||!Number.isFinite(x2)||x2<0||x1>dims.w)continue;
  const left=Math.max(0,Math.min(dims.w,x1)),width=Math.max(1,Math.min(dims.w,x2)-left);ctx.save();ctx.fillStyle=session.coverage==="COMPLETE"?"rgba(57,177,207,.055)":"rgba(255,190,108,.045)";ctx.fillRect(left,0,width,dims.h);ctx.strokeStyle="rgba(104,207,230,.30)";ctx.setLineDash([3,4]);ctx.strokeRect(left,1,width,Math.max(1,dims.h-2));
  if(Number.isFinite(session.high)&&Number.isFinite(session.low)){const highY=coordinates.priceToY(session.high),lowY=coordinates.priceToY(session.low);if(Number.isFinite(highY)){ctx.setLineDash([]);ctx.strokeStyle="#5fd9e8";ctx.beginPath();ctx.moveTo(left,highY);ctx.lineTo(Math.min(dims.w,left+width),highY);ctx.stroke()}if(Number.isFinite(lowY)){ctx.strokeStyle="#5fd9e8";ctx.beginPath();ctx.moveTo(left,lowY);ctx.lineTo(Math.min(dims.w,left+width),lowY);ctx.stroke()}}
  if(Number.isFinite(session.openingRange?.high)){const y=coordinates.priceToY(session.openingRange.high);if(Number.isFinite(y)){ctx.setLineDash([2,3]);ctx.strokeStyle="#ffc76f";ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(Math.min(dims.w,left+width),y);ctx.stroke()}}
  if(Number.isFinite(session.openingRange?.low)){const y=coordinates.priceToY(session.openingRange.low);if(Number.isFinite(y)){ctx.setLineDash([2,3]);ctx.strokeStyle="#ffc76f";ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(Math.min(dims.w,left+width),y);ctx.stroke()}}
  ctx.setLineDash([]);ctx.font="10px sans-serif";ctx.fillStyle="#def9ff";ctx.fillText(session.label+" · "+session.timeZone,left+4,14,Math.max(20,width-8));ctx.restore();
 }
 const previous=model.previous||{};for(const [key,label,color] of [["previousDay","PDH/PDL · UTC","#efa96f"],["previousWeek","PWH/PWL · UTC","#c89fff"]]){const band=previous[key];if(!band||band.coverage==="UNKNOWN")continue;for(const [side,value] of [["H",band.high],["L",band.low]]){const y=coordinates.priceToY(value);if(!Number.isFinite(y)||y<0||y>dims.h)continue;ctx.save();ctx.strokeStyle=color;ctx.setLineDash([7,4]);ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(right,y);ctx.stroke();ctx.font="10px sans-serif";ctx.fillStyle=color;ctx.fillText(label+" "+side,4,Math.max(11,y-3));ctx.restore()}}
 for(const level of model.equalLevels||[]){const y=coordinates.priceToY(level.level);if(!Number.isFinite(y)||y<0||y>dims.h)continue;ctx.save();ctx.strokeStyle="#dcadf5";ctx.setLineDash([2,5]);ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(right,y);ctx.stroke();ctx.font="10px sans-serif";ctx.fillStyle="#efd6ff";ctx.fillText("Hypothese · EQ"+(level.kind==="HIGH"?"H":"L"),4,Math.max(11,y-3));ctx.restore()}
 for(const pivot of model.pivots||[]){const x=coordinates.timeToX(pivot.time),y=coordinates.priceToY(pivot.price);if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>dims.w||y<0||y>dims.h)continue;ctx.save();ctx.fillStyle=pivot.kind==="HIGH"?"#f9b780":"#79d9c2";ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);ctx.fill();ctx.restore()}
 for(const sweep of model.sweeps||[]){const time=Date.parse(sweep.timeUtc)/1000,x=coordinates.timeToX(time),y=coordinates.priceToY(sweep.level);if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>dims.w||y<0||y>dims.h)continue;ctx.save();ctx.strokeStyle="#e4a6ff";ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(right,y);ctx.stroke();ctx.font="10px sans-serif";ctx.fillStyle="#f2d9ff";ctx.fillText("Hypothese · Sweep "+sweep.direction,Math.min(dims.w-120,x+5),Math.max(12,y-4));ctx.restore()}
}
function mount({panel,getContext,getCandles,getAsOfUtc=()=>null,refreshQuote=()=>{},onRender=()=>{}}={}){
 if(!panel||typeof getContext!=="function"||typeof getCandles!=="function"||typeof getAsOfUtc!=="function")return null;
 const details=document.createElement("details");details.className="cs-market-structure";details.dataset.testid="market-structure";
 const summary=document.createElement("summary");summary.textContent="Sessions · Struktur-/Liquiditätshypothesen";
 const body=document.createElement("div"),calendar=document.createElement("p");calendar.className="cs-market-calendar";calendar.textContent="Kalender: Werktage Mo–Fr; Feiertage nicht geprüft. Sämtliche Zeiten aus UTC-Kerzen, getrennt von Broker-Serverzeit.";
 const form=document.createElement("div");form.className="cs-market-controls";
 const inputs=new Map();for(const preset of PRESETS){const label=document.createElement("label"),input=document.createElement("input");input.type="checkbox";input.dataset.sessionId=preset.id;input.checked=["asia","london","new-york"].includes(preset.id);label.append(input,document.createTextNode(preset.label));inputs.set(preset.id,input);form.append(label)}
 const customZone=document.createElement("input");customZone.type="text";customZone.maxLength=64;customZone.value="Europe/Berlin";customZone.setAttribute("aria-label","Benutzerdefinierte Session Zeitzone");
 const customStart=document.createElement("input");customStart.type="time";customStart.value="09:00";customStart.setAttribute("aria-label","Benutzerdefinierter Sessionstart");
 const customEnd=document.createElement("input");customEnd.type="time";customEnd.value="12:00";customEnd.setAttribute("aria-label","Benutzerdefiniertes Sessionende");
 const customToggle=document.createElement("input");customToggle.type="checkbox";customToggle.setAttribute("aria-label","Benutzerdefinierte Session anzeigen");
 const customLabel=document.createElement("label");customLabel.append(customToggle,document.createTextNode("Custom"),customZone,customStart,customEnd);form.append(customLabel);
 const strengthLabel=document.createElement("label");strengthLabel.append(document.createTextNode("Pivotstaerke "));const strengthInput=document.createElement("input");strengthInput.type="number";strengthInput.min="1";strengthInput.max="20";strengthInput.step="1";strengthInput.value="2";strengthInput.setAttribute("aria-label","Pivotstaerke in Bestaetigungsbars");strengthLabel.append(strengthInput);form.append(strengthLabel);
 const toleranceLabel=document.createElement("label");toleranceLabel.append(document.createTextNode("Equal-Level-Toleranz · ATR "));const toleranceInput=document.createElement("input");toleranceInput.type="number";toleranceInput.min="0";toleranceInput.max="2";toleranceInput.step="0.05";toleranceInput.value="0.1";toleranceInput.setAttribute("aria-label","Equal-Level ATR-Toleranz");toleranceLabel.append(toleranceInput);form.append(toleranceLabel);
 const tickLabel=document.createElement("label");tickLabel.append(document.createTextNode("Ticksize · optional "));const tickInput=document.createElement("input");tickInput.type="number";tickInput.min="0";tickInput.max="1000000";tickInput.step="any";tickInput.placeholder="unbekannt";tickInput.setAttribute("aria-label","Instrument Ticksize");tickLabel.append(tickInput);form.append(tickLabel);
 const status=document.createElement("p");status.setAttribute("role","status");status.setAttribute("aria-live","polite");
 const confirm=document.createElement("label");confirm.textContent="Sweep ConfirmTF ";const select=document.createElement("select");select.setAttribute("aria-label","Sweep ConfirmTF");for(const [value,label] of [["same","Chart-TF"],["900","M15"],["3600","H1"],["14400","H4"]]){const option=document.createElement("option");option.value=value;option.textContent=label;select.append(option)}confirm.append(select);
 body.append(calendar,form,confirm,status);details.append(summary,body);panel.append(details);
 let context=null,model=null,config={},confirmCandles=null,confirmLoadedFor="",confirmBusy=false,confirmGeneration=0,confirmController=null,confirmError="",quoteGeneration=0,confirmFetchedAt=0;function storageKey(value){return "2eas:studio:market-structure:v1:"+[value.account,value.symbol,value.timeframe].map(x=>encodeURIComponent(x)).join(":")}
 function read(){try{const value=JSON.parse(localStorage.getItem(storageKey(context))||"{}");return value&&typeof value==="object"&&!Array.isArray(value)?value:{}}catch(_){return {}}}
 function save(){if(!context)return;try{localStorage.setItem(storageKey(context),JSON.stringify(config))}catch(_){status.textContent="Einstellungen nur temporär verfügbar · lokaler Speicher gesperrt."}}
 function sessions(){const selected=PRESETS.filter(p=>inputs.get(p.id).checked).map(p=>({...p}));if(customToggle.checked)selected.push({id:"custom",label:"Custom",timeZone:customZone.value,start:customStart.value,end:customEnd.value});return selected}
 const timeframeSeconds=tf=>({M1:60,M5:300,M15:900,M30:1800,H1:3600,H4:14400,D1:86400})[tf]||900;
 function selectedConfirmSeconds(tf){return select.value==="same"?tf:Number(select.value)}
 function loadConfirmCandles(force=false){const tf=timeframeSeconds(context?.timeframe),requested=selectedConfirmSeconds(tf),scope={...context};if(requested===tf){confirmController?.abort();confirmController=null;confirmCandles=getCandles();confirmLoadedFor=[scope.account,scope.symbol,scope.timeframe].join("/");confirmBusy=false;recalc();return Promise.resolve(true)}
  const loadedKey=[scope.account,scope.symbol,scope.timeframe,requested].join("/");if(!force&&(confirmBusy||confirmLoadedFor===loadedKey))return Promise.resolve(!confirmBusy);
  confirmController?.abort();confirmController=new AbortController();const controller=confirmController,generation=++confirmGeneration;confirmBusy=true;confirmCandles=null;confirmError="";status.textContent="MT5-ConfirmTF-Kerzen werden read-only geladen …";onRender();
  const root=window.location.pathname.startsWith("/stt")?"/stt":"",url=root+"/api/candles?"+new URLSearchParams({account:scope.account,tf:Object.entries({M5:300,M15:900,H1:3600,H4:14400}).find(([,value])=>value===requested)?.[0]||scope.timeframe,symbol:scope.symbol,count:"1000"});
  const timeout=setTimeout(()=>controller.abort(),12000);
  return fetch(url,{method:"GET",cache:"no-store",credentials:"same-origin",signal:controller.signal}).then(async response=>{const data=await response.json();if(generation!==confirmGeneration||scope.account!==context.account||scope.symbol!==context.symbol||scope.timeframe!==context.timeframe)return false;
   const tfName=Object.entries({M5:300,M15:900,H1:3600,H4:14400}).find(([,value])=>value===requested)?.[0]||scope.timeframe;
   if(!response.ok||data.accountId!==scope.account||data.symbol!==scope.symbol||data.timeframe!==tfName||data.source!=="MT5_VERIFIED"||data.canExecute!==false||!Array.isArray(data.candles))throw Error("ConfirmTF-Provenienz oder Scope stimmt nicht.");
   confirmCandles=data.candles;confirmLoadedFor=loadedKey;confirmFetchedAt=Date.now();confirmBusy=false;confirmController=null;confirmError="";clearTimeout(timeout);recalc();return true;
  }).catch(error=>{if(generation===confirmGeneration){confirmCandles=null;confirmBusy=false;confirmLoadedFor="";confirmController=null;confirmError=error.name==="AbortError"?"ConfirmTF-Abfrage abgebrochen.":"ConfirmTF UNKNOWN · "+error.message+" · Sweep nicht bestaetigt.";recalc()}return false}).finally(()=>clearTimeout(timeout));
 }
 function recalc(){const bars=getCandles(),tf=timeframeSeconds(context?.timeframe);
  const quoteTime=getAsOfUtc(),parsedQuote=typeof quoteTime==="string"?Date.parse(quoteTime)/1000:Number(quoteTime),asOf=Number.isFinite(parsedQuote)&&parsedQuote>0?parsedQuote:null;
  const confirmTf=selectedConfirmSeconds(tf),confirmReady=confirmTf===tf||confirmCandles!==null;
  if(confirmReady&&confirmTf!==tf&&asOf&&confirmCandles?.length&&Date.now()-confirmFetchedAt>30000){const last=confirmCandles[confirmCandles.length-1],lastTime=Number(last?.time);if(Number.isSafeInteger(lastTime)&&asOf>=lastTime+confirmTf*2&&!confirmBusy)void loadConfirmCandles(true)}
  model=analyze(bars,{timeframeSeconds:tf,asOfUtc:asOf,sessions:sessions(),openingRangeMinutes:60,calendarTimeZone:"UTC",swingStrength:Number(strengthInput.value)||2,atrPeriod:14,equalAtrMultiplier:Number(toleranceInput.value),tickSize:Number(tickInput.value)||config.tickSize,confirmTimeframeSeconds:confirmTf,confirmCandles:confirmTf===tf?bars:confirmCandles||[]});
  if(!bars?.length)status.textContent="Struktur UNKNOWN · keine Candle-Daten geladen.";else if(!asOf)status.textContent="Struktur UNKNOWN · verifizierter Quote-Zeitpunkt fehlt; keine Kerze wird als abgeschlossen behandelt.";else status.textContent=model.sessions.length+" Sessionfenster · "+model.bars+" geschlossene MT5-verifizierte OHLC-Kerzen · PDH/PDL/PWH/PWL UTC · OHLC nur beobachtet, keine Feiertagskalender · ConfirmTF "+(confirmReady?select.selectedOptions[0]?.textContent:"UNKNOWN · nicht geladen")+" · "+model.equalLevels.length+" EQH/EQL-Hypothesen, "+model.sweeps.length+" bestaetigte Sweep-Hypothesen.";if(confirmError)status.textContent+=" · "+confirmError;
  onRender();return model;
 }
 function setContext(raw){if(!raw||!["account","symbol","timeframe"].every(key=>typeof raw[key]==="string"&&raw[key].trim()))return false;const next={account:raw.account.trim(),symbol:raw.symbol.trim(),timeframe:raw.timeframe.trim()},changed=!!context&&["account","symbol","timeframe"].some(key=>context[key]!==next[key]);if(changed){confirmGeneration++;confirmController?.abort();confirmController=null;confirmCandles=null;confirmLoadedFor="";confirmBusy=false;confirmError=""}context=next;const currentTf=timeframeSeconds(context.timeframe);for(const option of select.options)option.disabled=option.value!=="same"&&Number(option.value)<currentTf;const saved=read();for(const [id,input] of inputs)input.checked=saved.sessions? saved.sessions[id]===true:["asia","london","new-york"].includes(id);customToggle.checked=saved.custom===true;if(typeof saved.timeZone==="string")customZone.value=saved.timeZone;if(typeof saved.start==="string")customStart.value=saved.start;if(typeof saved.end==="string")customEnd.value=saved.end;if(typeof saved.pivotStrength==="string")strengthInput.value=saved.pivotStrength;if(typeof saved.equalTolerance==="string")toleranceInput.value=saved.equalTolerance;if(typeof saved.tickSize==="string")tickInput.value=saved.tickSize;if(["same","900","3600","14400"].includes(saved.confirmTF)&&!select.querySelector("option:checked")?.disabled)select.value=saved.confirmTF;if(select.selectedOptions[0]?.disabled)select.value="same";if(changed){model=null;status.textContent="Warte auf OHLC-Kerzen für "+context.account+" · "+context.symbol+" · "+context.timeframe+".";onRender()}else recalc();const quoteNonce=++quoteGeneration;Promise.resolve(refreshQuote({...context})).then(()=>{if(quoteNonce===quoteGeneration)recalc()}).catch(()=>{});if(select.value!=="same"&&(!confirmLoadedFor||changed))void loadConfirmCandles(true);return true}
 function persist(){config={sessions:Object.fromEntries([...inputs].map(([id,input])=>[id,input.checked])),custom:customToggle.checked,timeZone:customZone.value,start:customStart.value,end:customEnd.value,pivotStrength:strengthInput.value,equalTolerance:toleranceInput.value,tickSize:tickInput.value,confirmTF:select.value};save();if(select.value!=="same")void loadConfirmCandles(true);else recalc()}
 form.addEventListener("change",persist);form.addEventListener("input",persist);select.addEventListener("change",persist);summary.addEventListener("click",()=>{requestAnimationFrame(onRender)});
 setContext(getContext());return Object.freeze({setContext,updateBars:recalc,draw(ctx,coords,dims){if(details.open)draw(ctx,model,coords,dims)},getModel:()=>model?JSON.parse(JSON.stringify(model)):null,getSummary:()=>({scope:context?{...context}:null,bars:model?.bars||0,sessions:model?.sessions?.length||0,equalLevels:model?.equalLevels?.length||0,sweeps:model?.sweeps?.length||0,source:model?.source||"UNKNOWN",previousDay:model?.previous?.previousDay?.coverage||"UNKNOWN",previousWeek:model?.previous?.previousWeek?.coverage||"UNKNOWN"}),destroy(){confirmGeneration++;quoteGeneration++;confirmController?.abort();details.remove()}});
}
window.ChartStudioMarketStructure=Object.freeze({mount,core:Object.freeze({sessionWindows,analyze,cleanBars,localToEpoch,cleanSession,PRESETS,PROXY})});
})();

(()=>{
"use strict";
const PREFIX="2eas:studio:alerts:v1:",MAX_RULES=20,MAX_PRICE=1e9,POLL_MS=5000,MAX_AGE=30;
function cleanScope(value){
 if(!value||typeof value!=="object"||Array.isArray(value))return null;
 const result={};for(const key of ["account","symbol","timeframe"]){const raw=value[key];if(typeof raw!=="string"||!raw.trim()||raw.length>64||/[\u0000-\u001f\u007f]/.test(raw))return null;result[key]=raw.trim()}
 return result;
}
function cleanRule(raw){
 if(!raw||typeof raw!=="object"||Array.isArray(raw)||typeof raw.id!=="string"||!/^[a-zA-Z0-9_-]{1,64}$/.test(raw.id)||!['ABOVE','BELOW'].includes(raw.direction)||typeof raw.price!=="number"||!Number.isFinite(raw.price)||raw.price<=0||raw.price>MAX_PRICE||typeof raw.triggered!=="boolean")return null;
 const triggeredAt=raw.triggeredAt===null||raw.triggeredAt===undefined?null:typeof raw.triggeredAt==="string"&&Number.isFinite(Date.parse(raw.triggeredAt))?raw.triggeredAt:null;
 return {id:raw.id,direction:raw.direction,price:raw.price,triggered:raw.triggered,triggeredAt};
}
function quotePrice(quote,scope,now){
 if(!quote||quote.account!==scope.account||quote.symbol!==scope.symbol||quote.source!=="MT5_VERIFIED"||quote.canExecute!==false||quote.freshness!=="FRESH")return null;
 const bid=Number(quote.bid),ask=Number(quote.ask),age=Number(quote.ageSeconds),stamp=Date.parse(quote.quoteTimeUtc);
 if(!Number.isFinite(bid)||bid<=0||!Number.isFinite(ask)||ask<bid||!Number.isFinite(age)||age<0||age>MAX_AGE||!Number.isFinite(stamp))return null;
 const computedAge=(now-stamp)/1000;
 if(computedAge< -1||computedAge>MAX_AGE||Math.abs(computedAge-age)>5)return null;
 return {price:(bid+ask)/2,time:new Date(stamp).toISOString()};
}
function createEngine({account,symbol,timeframe,initial=[],now=()=>Date.now()}={}){
 const scope=cleanScope({account,symbol,timeframe});if(!scope||typeof now!=="function")throw new TypeError("Invalid alert scope");
 const rules=new Map(),lastPrice=new Map();let lastQuoteTime=null,stale=true;
 for(const item of Array.isArray(initial)?initial.slice(0,MAX_RULES):[]){const clean=cleanRule(item);if(clean&&!rules.has(clean.id))rules.set(clean.id,clean)}
 function list(){return [...rules.values()].map(rule=>({...rule}))}
 function add(raw){if(rules.size>=MAX_RULES)return null;const clean=cleanRule({...raw,triggered:false,triggeredAt:null});if(!clean||rules.has(clean.id))return null;rules.set(clean.id,clean);lastPrice.delete(clean.id);return {...clean}}
 function remove(id){lastPrice.delete(id);return rules.delete(id)}
 function rearm(id){const rule=rules.get(id);if(!rule)return false;rule.triggered=false;rule.triggeredAt=null;lastPrice.delete(id);return true}
 function observe(quote){
  const normalized=quotePrice(quote,scope,Number(now()));
  if(!normalized){lastPrice.clear();lastQuoteTime=null;stale=true;return []}
  stale=false;
  if(normalized.time===lastQuoteTime)return [];
  lastQuoteTime=normalized.time;
  const events=[];
  for(const rule of rules.values()){
   const previous=lastPrice.get(rule.id);lastPrice.set(rule.id,normalized.price);
   if(rule.triggered||previous===undefined)continue;
   const crossed=rule.direction==="ABOVE"?previous<rule.price&&normalized.price>=rule.price:previous>rule.price&&normalized.price<=rule.price;
   if(!crossed)continue;
   rule.triggered=true;rule.triggeredAt=normalized.time;
   events.push({id:rule.id,account:scope.account,symbol:scope.symbol,timeframe:scope.timeframe,direction:rule.direction,price:rule.price,observedPrice:normalized.price,quoteTimeUtc:normalized.time});
  }
  return events;
 }
 return Object.freeze({scope:Object.freeze({...scope}),add,remove,rearm,list,observe,get stale(){return stale},hasActive(){return [...rules.values()].some(rule=>!rule.triggered)},canPoll(){return rules.size>0&&[...rules.values()].some(rule=>!rule.triggered)}});
}
function mount({panel,getContext,fetchImpl=window.fetch?.bind(window),storage=window.localStorage,notification=window.Notification}={}){
 if(!panel||typeof getContext!=="function")return null;
 const details=document.createElement("details");details.className="cs-alerts";details.dataset.testid="price-alerts";
 const summary=document.createElement("summary");summary.textContent="Preisalarme · verifizierte MT5-Quotes · keine Handelsaktion";
 const body=document.createElement("div");body.className="cs-alerts-body";
 const form=document.createElement("form");form.className="cs-alert-form";
 const directionLabel=document.createElement("label");directionLabel.textContent="Auslösen";
 const direction=document.createElement("select");direction.setAttribute("aria-label","Preisalarm Richtung");for(const [value,label] of [["ABOVE","Beim Kreuzen nach oben"],["BELOW","Beim Kreuzen nach unten"]]){const option=document.createElement("option");option.value=value;option.textContent=label;direction.append(option)}directionLabel.append(direction);
 const priceLabel=document.createElement("label");priceLabel.textContent="Preis";
 const price=document.createElement("input");price.type="number";price.min="0.00000001";price.max=String(MAX_PRICE);price.step="any";price.required=true;price.setAttribute("aria-label","Preisalarm Preis");priceLabel.append(price);
 const addButton=document.createElement("button");addButton.type="submit";addButton.textContent="Alarm hinzufügen";
 const permissionButton=document.createElement("button");permissionButton.type="button";permissionButton.textContent="Browserbenachrichtigungen aktivieren";permissionButton.dataset.cmd="notification-permission";
 form.append(directionLabel,priceLabel,addButton);body.append(form,permissionButton);
 const status=document.createElement("p");status.setAttribute("role","status");status.setAttribute("aria-live","polite");status.textContent="Keine Alarme aktiv.";
 const list=document.createElement("ul");list.setAttribute("aria-label","Gespeicherte Preisalarme");body.append(status,list);details.append(summary,body);panel.prepend(details);
 let context=null,engine=null,timer=null,busy=false,generation=0,destroyed=false,pollController=null;
 function key(scope){return PREFIX+encodeURIComponent(scope.account)+":"+encodeURIComponent(scope.symbol)+":"+encodeURIComponent(scope.timeframe)}
 function read(scope){try{const raw=JSON.parse(storage.getItem(key(scope))||"[]");return Array.isArray(raw)?raw.map(cleanRule).filter(Boolean).slice(0,MAX_RULES):[]}catch(_){return []}}
 function save(){if(!engine)return;try{storage.setItem(key(context),JSON.stringify(engine.list()))}catch(_){status.textContent="Alarme nur temporär verfügbar: lokaler Speicher nicht beschreibbar."}}
 function render(){
  if(!engine)return;list.replaceChildren();const rows=engine.list();
  for(const rule of rows){const li=document.createElement("li"),text=document.createElement("span");text.textContent=(rule.direction==="ABOVE"?"Kreuzt aufwärts ":"Kreuzt abwärts ")+rule.price+(rule.triggered?" · Ausgelöst "+rule.triggeredAt:" · Aktiv");li.append(text);
   if(rule.triggered){const rearmButton=document.createElement("button");rearmButton.type="button";rearmButton.textContent="Wieder scharf";rearmButton.dataset.alertAction="rearm";rearmButton.dataset.alertId=rule.id;li.append(rearmButton)}
   const deleteButton=document.createElement("button");deleteButton.type="button";deleteButton.textContent="Entfernen";deleteButton.dataset.alertAction="delete";deleteButton.dataset.alertId=rule.id;li.append(deleteButton);list.append(li)}
  if(!rows.length){const empty=document.createElement("li");empty.textContent="Keine Preisalarme gespeichert.";list.append(empty)}
  addButton.disabled=rows.length>=MAX_RULES;
  permissionButton.disabled=typeof notification!=="function"||notification.permission==="granted"||notification.permission==="denied";
  if(notification?.permission==="granted")permissionButton.textContent="Browserbenachrichtigungen aktiv";
  else if(notification?.permission==="denied")permissionButton.textContent="Browserbenachrichtigungen blockiert";
 }
 function stop(){generation++;if(timer!==null){clearInterval(timer);timer=null}pollController?.abort();pollController=null;busy=false}
 function updateContext(raw){
  const next=cleanScope(raw);if(!next)return false;
  if(context&&context.account===next.account&&context.symbol===next.symbol&&context.timeframe===next.timeframe)return true;
  stop();context=next;engine=createEngine({...context,initial:read(context)});status.textContent="Alarmstatus wartet auf frische MT5-Quote für "+context.account+" · "+context.symbol+" · "+context.timeframe+".";render();start();return true;
 }
 function onVisibilityChange(){
  if(document.hidden){
   if(engine?.canPoll()){
    stop();engine.observe(null);
    status.textContent="Alarm pausiert · Hintergrundtab. Verpasste Preisübergänge werden nicht nachgemeldet.";
   }
   return;
  }
  if(engine?.canPoll()){
   engine.observe(null);
   status.textContent="Alarm wird fortgesetzt · warte auf erste frische Quote.";
   start();
  }
 }
 function emit(events){for(const event of events){const text="Preisalarm: "+event.symbol+" "+(event.direction==="ABOVE"?"über ":"unter ")+event.price+" (Quote "+event.observedPrice+")";status.textContent=text;
   if(typeof notification==="function"&&notification.permission==="granted")try{new notification("2EAs Preisalarm",{body:text,tag:"2eas-alert-"+event.account+"-"+event.id})}catch(_){/* In-app status remains available. */}}
 }
 async function poll(){
  if(destroyed||document.hidden||busy||!engine?.canPoll())return;
  const requestGeneration=generation,requested={...context},controller=new AbortController();busy=true;pollController=controller;
  try{
   const root=window.location.pathname.startsWith("/stt")?"/stt":"",url=root+"/api/chart/v1/quotes?account="+encodeURIComponent(requested.account)+"&symbol="+encodeURIComponent(requested.symbol);
   const timeout=setTimeout(()=>controller.abort(),8000);let response,data;
   try{response=await fetchImpl(url,{method:"GET",cache:"no-store",credentials:"same-origin",signal:controller.signal});data=await response.json()}finally{clearTimeout(timeout)}
   if(destroyed||requestGeneration!==generation||requested.account!==context.account||requested.symbol!==context.symbol||requested.timeframe!==context.timeframe)return;
   if(!response.ok)throw Error("Quote nicht verfügbar");
   const events=engine.observe(data);save();render();if(events.length)emit(events);else if(engine.stale)status.textContent="Alarm pausiert · MT5-Quote fehlt oder ist älter als "+MAX_AGE+" Sekunden.";else if(!engine.canPoll())status.textContent="Alle Preisalarme ausgelöst. Bei Bedarf manuell wieder scharf schalten.";else status.textContent="Überwacht · "+requested.account+" · "+requested.symbol+" · frische MT5-Quote.";
   if(!engine.canPoll()&&timer!==null){clearInterval(timer);timer=null}
  }catch(_){if(requestGeneration===generation){engine.observe(null);status.textContent="Alarm pausiert · Quote oder Netzwerk nicht verfügbar.";render()}}
  finally{if(requestGeneration===generation){busy=false;if(pollController===controller)pollController=null}}
 }
 function start(){if(!document.hidden&&engine?.canPoll()&&timer===null){void poll();timer=setInterval(()=>void poll(),POLL_MS)}}
 form.addEventListener("submit",event=>{event.preventDefault();const value=price.valueAsNumber;if(!Number.isFinite(value)||value<=0||value>MAX_PRICE){status.textContent="Preis muss größer als 0 und höchstens "+MAX_PRICE+" sein.";return}
  const id=(window.crypto?.randomUUID?.()||("a"+Date.now().toString(36)+Math.random().toString(36).slice(2))).replace(/[^A-Za-z0-9_-]/g,"").slice(0,64);
  if(!engine.add({id,direction:direction.value,price:value})){status.textContent="Alarm konnte nicht hinzugefügt werden (maximal "+MAX_RULES+" eindeutige Alarme).";return}
  price.value="";save();render();status.textContent="Alarm erstellt · wartet auf erste frische Quote, danach auf den Preisübergang.";start();
 });
 permissionButton.addEventListener("click",async()=>{
  if(typeof notification!=="function"){status.textContent="Dieser Browser unterstützt keine Browserbenachrichtigungen; In-App-Hinweise bleiben aktiv.";return}
  try{const permission=await notification.requestPermission();status.textContent=permission==="granted"?"Browserbenachrichtigungen aktiviert.":permission==="denied"?"Browserbenachrichtigungen blockiert; In-App-Hinweise bleiben aktiv.":"Berechtigung nicht erteilt; In-App-Hinweise bleiben aktiv.";render()}catch(_){status.textContent="Berechtigungsanfrage fehlgeschlagen; In-App-Hinweise bleiben aktiv."}
 });
 list.addEventListener("click",event=>{const button=event.target.closest("button[data-alert-action]");if(!button)return;const id=button.dataset.alertId;
  if(button.dataset.alertAction==="delete")engine.remove(id);else if(button.dataset.alertAction==="rearm")engine.rearm(id);save();render();status.textContent=engine.canPoll()?"Wieder scharf · warte auf erste frische Quote.":"Alarm entfernt.";start();
 });
 document.addEventListener("visibilitychange",onVisibilityChange);
 updateContext(getContext());
 return Object.freeze({setContext:updateContext,poll,render,destroy(){destroyed=true;stop();document.removeEventListener("visibilitychange",onVisibilityChange);details.remove()},getState:()=>({context:context?{...context}:null,alerts:engine?.list()||[],stale:engine?.stale===true})});
}
window.ChartStudioAlerts=Object.freeze({mount,core:Object.freeze({createEngine,cleanScope,cleanRule,quotePrice,MAX_RULES,MAX_AGE})});
})();

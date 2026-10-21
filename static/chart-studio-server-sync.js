/* Client-side encrypted Chart Studio sync. Keys and plaintext never leave this page. */
(()=>{
"use strict";
const FORMAT=1, KEY_PREFIX="2eas-sync:v1:";
const DB_NAME="2eas-chart-sync", STORE="encrypted-outbox";
let state=null;
const textEncoder=new TextEncoder();
function bytesToB64url(bytes){
 let binary="";for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
 return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
}
function b64urlToBytes(value){
 if(typeof value!=="string"||! /^[A-Za-z0-9_-]+$/.test(value))throw Error("Ungültige Base64url-Daten.");
 const raw=atob(value.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-value.length%4)%4));
 return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
function randomBundleId(){return "sync_"+bytesToB64url(crypto.getRandomValues(new Uint8Array(18)))}
function scopeAad(bundle){
 if(!bundle||typeof bundle.bundleId!=="string"||typeof bundle.account!=="string"||typeof bundle.symbol!=="string")throw Error("Sync-Scope fehlt.");
 const base=`2eas-sync\0v${FORMAT}\0${bundle.bundleId}\0${bundle.account}\0${bundle.symbol}`;
 return textEncoder.encode(bundle.account==="global"?`${base}\0global-market-drawings`:base);
}
async function generateKey(){
 const raw=crypto.getRandomValues(new Uint8Array(32));
 return {raw,key:await crypto.subtle.importKey("raw",raw,{name:"AES-GCM"},false,["encrypt","decrypt"])};
}
function encodePackage(bundle){
 const payload={bundleId:bundle.bundleId,account:bundle.account,symbol:bundle.symbol,key:bytesToB64url(bundle.raw)};
 return KEY_PREFIX+bytesToB64url(textEncoder.encode(JSON.stringify(payload)));
}
async function createRecoveryPackage(account,symbol){
 if(!/^[a-z0-9_-]{1,32}$/.test(account||"")||!/^[A-Z0-9._-]{1,32}$/.test(symbol||""))throw Error("Ungültiger Konto- oder Symbol-Scope.");
 const generated=await generateKey();
 const bundle={bundleId:randomBundleId(),account,symbol,key:generated.key,raw:generated.raw};
 return {...bundle,recoveryPackage:encodePackage(bundle)};
}
async function createGlobalDrawingRecoveryPackage(symbol){return createRecoveryPackage("global",symbol)}
async function parseRecoveryPackage(value){
 if(typeof value!=="string"||!value.startsWith(KEY_PREFIX))throw Error("Recovery-Paket muss mit 2eas-sync:v1: beginnen.");
 const encoded=value.slice(KEY_PREFIX.length),decoded=b64urlToBytes(encoded);
 if(bytesToB64url(decoded)!==encoded)throw Error("Recovery-Paket ist nicht kanonisch kodiert.");
 let data;try{data=JSON.parse(new TextDecoder().decode(decoded))}catch{throw Error("Recovery-Paket ist beschädigt.")}
 if(!data||Object.keys(data).sort().join(",")!=="account,bundleId,key,symbol"||
  !/^[A-Za-z0-9_-]{16,64}$/.test(data.bundleId||"")||
  !/^[a-z0-9_-]{1,32}$/.test(data.account||"")||
  !/^[A-Z0-9._-]{1,32}$/.test(data.symbol||""))throw Error("Recovery-Paket enthält einen ungültigen Scope.");
 const raw=b64urlToBytes(data.key);
 if(raw.length!==32)throw Error("Der Recovery-Key muss genau 256 Bit besitzen.");
 const key=await crypto.subtle.importKey("raw",raw,{name:"AES-GCM"},false,["encrypt","decrypt"]);
 return {bundleId:data.bundleId,account:data.account,symbol:data.symbol,key,raw,recoveryPackage:value};
}
function validateGlobalDrawings(drawings){
 const counts={horizontal:1,vertical:1,text:1,trend:2,rect:2,ellipse:2,fib:2,fibfan:2,fibtime:2,fibtrend:3,ray:2,ruler:2,channel:3};
 const fields=new Set(["kind","anchors","id","label","visible","locked","levels"]),ids=new Set();
 if(!Array.isArray(drawings)||drawings.length>1000)throw Error("Ungültige globale Zeichnungen.");
 for(const drawing of drawings){
  if(!drawing||typeof drawing!=="object"||Array.isArray(drawing)||Object.keys(drawing).some(key=>!fields.has(key))||
   !Object.hasOwn(counts,drawing.kind)||!Array.isArray(drawing.anchors)||drawing.anchors.length!==counts[drawing.kind])throw Error("Ungültige globale Zeichnungsgeometrie.");
  if(drawing.anchors.some(point=>!point||Object.keys(point).sort().join(",")!=="price,time"||
   !Number.isInteger(point.time)||point.time<1||point.time>7258118400||
   typeof point.price!=="number"||!Number.isFinite(point.price)||point.price<=0))throw Error("Ungültiger globaler Zeichenanker.");
  if(drawing.id!==undefined&&(typeof drawing.id!=="string"||! /^[A-Za-z0-9_-]{1,32}$/.test(drawing.id)||ids.has(drawing.id)))throw Error("Ungültige globale Zeichnungs-ID.");
  if(drawing.id)ids.add(drawing.id);
  if(drawing.label!==undefined&&(typeof drawing.label!=="string"||drawing.label.length>40||/[\u0000-\u001f]/.test(drawing.label)))throw Error("Ungültige globale Beschriftung.");
  if(drawing.kind==="text"&&(!drawing.label||!drawing.label.trim()))throw Error("Textmarkierungen brauchen eine Beschriftung.");
  if(drawing.visible!==undefined&&typeof drawing.visible!=="boolean")throw Error("Ungültiger Sichtbarkeitswert.");
  if(drawing.locked!==undefined&&typeof drawing.locked!=="boolean")throw Error("Ungültiger Sperrwert.");
  if(drawing.levels!==undefined&&(drawing.kind!=="fib"||!Array.isArray(drawing.levels)||drawing.levels.length>32))throw Error("Ungültige globale Fibonacci-Level.");
  if(window.ChartStudioDrawingGeometry?.validDrawing&&!window.ChartStudioDrawingGeometry.validDrawing(drawing))throw Error("Ungültige globale Zeichnungsgeometrie.");
 }
}
function validateDocument(document,bundle){
 const global=document?.kind==="global-market-drawings";
 if(global){
  if(Object.keys(document).sort().join(",")!=="drawings,kind,schemaVersion,symbol"||document.schemaVersion!==1||
   typeof document.symbol!=="string"||!Array.isArray(document.drawings))throw Error("Ungültiges globales Zeichnungsbundle.");
  validateGlobalDrawings(document.drawings);
  if(bundle&&bundle.account!=="global")throw Error("Symbolweite Zeichnungen benötigen einen globalen Sync-Scope.");
  const encoded=textEncoder.encode(JSON.stringify(document));if(encoded.byteLength>524288)throw Error("Chart-Layout ist zu groß.");
  return encoded;
 }
 if(bundle&&bundle.account==="global")throw Error("Globaler Sync-Scope benötigt ein Symbol-Zeichnungsbundle.");
 const allowed=new Set(["schemaVersion","drawings","options","indicators","movingAverages","chartAppearance","oscillatorInstances","chartType","timeframe","symbol"]);
 const forbidden=new Set(["accountid","brokerpositions","openpositions","pendingorders","positiondraft","orderticket","tradeticket","dealmarkers","orderid","positionid","dealid","ticket"]);
 function walk(value){
  if(Array.isArray(value)){value.forEach(walk);return}
  if(!value||typeof value!=="object")return;
  for(const [key,item] of Object.entries(value)){
   const normalized=key.toLowerCase();
   if(forbidden.has(normalized)||(normalized==="positions"&&typeof item!=="boolean")||normalized==="orders")throw Error("Broker-/Positions-/Orderdaten dürfen nicht synchronisiert werden.");
   walk(item);
  }
 }
 if(!document||typeof document!=="object"||Array.isArray(document))throw Error("Ungültiges Chart-Layout für den Sync.");
 walk(document);
 if(Object.keys(document).some(key=>!allowed.has(key))||document.schemaVersion!==1||
  !Array.isArray(document.drawings)||!document.options||typeof document.options!=="object"||
  !document.indicators||typeof document.indicators!=="object"||typeof document.timeframe!=="string")
  throw Error("Ungültiges Chart-Layout für den Sync.");
 const encoded=textEncoder.encode(JSON.stringify(document));
 if(encoded.byteLength>524288)throw Error("Chart-Layout ist zu groß.");
 return encoded;
}
async function encryptDocument(document,bundle){
 const plaintext=validateDocument(document,bundle),nonce=crypto.getRandomValues(new Uint8Array(12));
 if(document.symbol!==undefined&&document.symbol!==bundle.symbol)throw Error("Layout gehört zu einem anderen Symbol.");
 const key=bundle.key||await crypto.subtle.importKey("raw",bundle.raw,{name:"AES-GCM"},false,["encrypt"]);
 const ciphertext=await crypto.subtle.encrypt({name:"AES-GCM",iv:nonce,additionalData:scopeAad(bundle),tagLength:128},key,plaintext);
 return {formatVersion:FORMAT,nonce:bytesToB64url(nonce),ciphertext:bytesToB64url(new Uint8Array(ciphertext))};
}
async function decryptDocument(envelope,bundle){
 if(!envelope||envelope.formatVersion!==FORMAT)throw Error("Dieses verschlüsselte Format wird von dieser Version nicht unterstützt.");
 const key=bundle.key||await crypto.subtle.importKey("raw",bundle.raw,{name:"AES-GCM"},false,["decrypt"]);
 const plaintext=await crypto.subtle.decrypt({name:"AES-GCM",iv:b64urlToBytes(envelope.nonce),additionalData:scopeAad(bundle),tagLength:128},key,b64urlToBytes(envelope.ciphertext));
 const document=JSON.parse(new TextDecoder().decode(plaintext));validateDocument(document,bundle);
 if(document.symbol!==undefined&&document.symbol!==bundle.symbol)throw Error("Layout gehört zu einem anderen Symbol.");
 return document;
}
function el(tag,attrs={},text=""){
 const n=document.createElement(tag);for(const [key,val] of Object.entries(attrs)){
  if(key==="className")n.className=val;else if(key==="textContent")n.textContent=val;else n.setAttribute(key,String(val));
 }if(text)n.textContent=text;return n;
}
function show(message){if(state)state.message.textContent=message}
function rootPath(){return location.pathname.startsWith("/stt")?"/stt":""}
async function checkAvailability(){
 try{const response=await fetch(rootPath()+"/api/chart/v1/capabilities",{method:"GET",cache:"no-store",credentials:"same-origin"}),data=await response.json();
  if(!response.ok||data.features?.encryptedDeviceSync!==true)throw Error("Der verschlüsselte Gerätesync ist serverseitig deaktiviert.");
  state.enabled=true;for(const control of state.controls)control.disabled=false;show("Verschlüsselt aktiv · Layout-Recht oder Trade-Recht erforderlich.");
 }catch(error){state.enabled=false;for(const control of state.controls)control.disabled=true;show(error.message||"Sync-Status ist nicht verfügbar.")}
}
function bundleKey(bundle){return `${bundle.bundleId}|${bundle.account}|${bundle.symbol}`}
function openOutbox(){return new Promise((resolve,reject)=>{
  if(!window.indexedDB){reject(Error("Verschlüsselte Offline-Ablage ist nicht verfügbar."));return}
  const request=indexedDB.open(DB_NAME,1);
  request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE)};
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||Error("Offline-Ablage konnte nicht geöffnet werden."));
 })}
async function outbox(action,key,value){
 const db=await openOutbox();return new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,action==="get"?"readonly":"readwrite"),store=tx.objectStore(STORE);
  const req=action==="get"?store.get(key):action==="delete"?store.delete(key):store.put(value,key);
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||Error("Offline-Ablage fehlgeschlagen."));
  tx.oncomplete=()=>db.close();tx.onerror=()=>{db.close();reject(tx.error||Error("Offline-Ablage fehlgeschlagen."))};
 })
}
function syncUrl(bundle){return `/api/chart/v1/device-sync/${encodeURIComponent(bundle.bundleId)}`}
async function request(bundle,method,path,body){
 const response=await fetch(rootPath()+path,{method,cache:"no-store",credentials:"same-origin",
  headers:body===undefined?{"Accept":"application/json"}:{"Accept":"application/json","Content-Type":"application/json"},
  ...(body===undefined?{}:{body:JSON.stringify(body)})});
 const data=await response.json().catch(()=>({}));if(!response.ok){
  const detail=data.detail,error=new Error(typeof detail==="string"?detail:detail?.message||`HTTP ${response.status}`);
  error.status=response.status;error.currentRevision=detail?.currentRevision;throw error;
 }return data;
}
function activeScopeAccount(){return state?.mode==="global"?"global":state?.account}
function scopeMatches(bundle){return !!state&&!!bundle&&bundle.account===activeScopeAccount()&&bundle.symbol===state.symbol}
function assertCurrentScope(bundle,generation){if(!state||state.scopeGeneration!==generation||state.bundle!==bundle||!scopeMatches(bundle))throw Error("Scope wurde während des Syncs gewechselt; Vorgang verworfen.")}
function scopeKey(account,symbol){return `${account}|${symbol}`}
function rememberBundle(bundle){if(state&&bundle)state.bundleCache.set(scopeKey(bundle.account,bundle.symbol),bundle)}
function refreshMode(){
 if(!state)return;
 const global=state.mode==="global";
 state.scopeSelect.value=state.mode;
 state.scopeGeneration++;state.bundle=state.bundleCache.get(scopeKey(activeScopeAccount(),state.symbol))||null;
 state.revision=0;state.conflict=null;state.conflictBox.hidden=true;
 state.recovery.value=state.bundle?.recoveryPackage||"";
 state.save.textContent=global?"Symbolweite Markierungen verschlüsselt speichern":"Aktuelles Layout verschlüsselt speichern";
 state.load.textContent=global?"Symbolweite Markierungen laden":"Serverstand laden";
 state.migrationRow.hidden=global;
 state.legacyImport.hidden=!global||typeof state.hasLegacyGlobalDrawings!=="function"||!state.hasLegacyGlobalDrawings();
 show(global?"Sync-Modus: ausdrücklich geteilte Zeichnungen dieses Symbols über Geräte synchronisieren.":"Sync-Modus: Konto-Layout dieses Symbols synchronisieren.");
}
function setMode(mode){if(!state||!['layout','global'].includes(mode)||mode===state.mode)return;state.mode=mode;refreshMode()}
async function getCurrent(bundle){return request(bundle,"GET",syncUrl(bundle)+`?account=${encodeURIComponent(bundle.account)}&symbol=${encodeURIComponent(bundle.symbol)}`)}
function renderConflict(localEnvelope,document){
 if(!state||!state.bundle||!scopeMatches(state.bundle))return;state.conflict={localEnvelope,document,bundleKey:bundleKey(state.bundle),scopeGeneration:state.scopeGeneration};state.conflictBox.replaceChildren();
 state.conflictBox.append(el("strong",{},"Versionskonflikt: Beide Layoutstände bleiben erhalten."));
 const mine=el("button",{type:"button"},"Meine Änderungen"),remote=el("button",{type:"button"},"Serverstand"),copy=el("button",{type:"button"},"Als Kopie speichern");
 state.conflictBox.append(mine,remote,copy);state.conflictBox.hidden=false;
 mine.addEventListener("click",()=>void resolveConflict("mine"));remote.addEventListener("click",()=>void resolveConflict("remote"));copy.addEventListener("click",()=>void resolveConflict("copy"));
}
async function resolveConflict(choice){
 const bundle=state?.bundle,conflict=state?.conflict;if(!bundle||!conflict)return;
 if(conflict.bundleKey!==bundleKey(bundle)||conflict.scopeGeneration!==state.scopeGeneration){state.conflict=null;state.conflictBox.hidden=true;show("Konflikt gehört zu einem anderen Konto oder Symbol und wurde verworfen.");return}
 const generation=state.scopeGeneration;
 try{
  if(choice==="remote"){
   const current=await getCurrent(bundle);assertCurrentScope(bundle,generation);if(current.formatVersion!==FORMAT){downloadEnvelope(current);throw Error("Remoteformat nicht unterstützt; Ciphertext wurde archiviert.")}
   const doc=await decryptDocument(current,bundle);assertCurrentScope(bundle,generation);if(!state.importDocument(doc))throw Error("Serverlayout konnte nicht geladen werden.");state.revision=current.revision;await outbox("delete",bundleKey(bundle));show(`Serverstand v${current.revision} geladen.`);
  }else if(choice==="mine"){
   const current=await getCurrent(bundle);assertCurrentScope(bundle,generation);
   if(current.formatVersion!==FORMAT){downloadEnvelope(current);const error=Error("Neues Serverformat kann nicht überschrieben werden; Ciphertext wurde archiviert.");error.status=409;error.unsupportedFormat=true;throw error}
   const result=await request(bundle,"PUT",syncUrl(bundle),{account:bundle.account,symbol:bundle.symbol,expectedRevision:current.revision,formatVersion:conflict.localEnvelope.formatVersion,nonce:conflict.localEnvelope.nonce,ciphertext:conflict.localEnvelope.ciphertext});
   await verifyRemote(result,bundle,conflict.document);assertCurrentScope(bundle,generation);state.revision=result.revision;await outbox("delete",bundleKey(bundle));show(`Eigene Änderungen als v${result.revision} gespeichert.`);
  }else if(choice==="copy"){
   const oldBundle=bundle,created=await createRecoveryPackage(bundle.account,bundle.symbol);assertCurrentScope(bundle,generation);state.bundle=created;rememberBundle(created);state.recovery.value=created.recoveryPackage;
   state.revision=0;const envelope=await encryptDocument(conflict.document,created);
   const result=await request(created,"PUT",syncUrl(created),{account:created.account,symbol:created.symbol,expectedRevision:0,...envelope});
   await verifyRemote(result,created,conflict.document);assertCurrentScope(created,generation);state.revision=result.revision;await outbox("delete",bundleKey(oldBundle));show("Kopie gespeichert. Recovery-Paket jetzt sichern.");
  }
  state.conflict=null;state.conflictBox.hidden=true;
 }catch(error){show("Konflikt bleibt erhalten: "+error.message)}
}
function downloadEnvelope(envelope){
 const blob=new Blob([JSON.stringify(envelope)],{type:"application/json"}),url=URL.createObjectURL(blob),a=el("a",{href:url,download:`2eas-sync-${envelope.bundleId||"archive"}-r${envelope.revision||0}.json`});
 document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),0);
}
function exportLocalLayout(){
 try{const layout={...JSON.parse(new TextDecoder().decode(validateDocument(state.exportDocument()))),symbol:state.symbol},payload={format:"2eas-chart-layout:v1",account:state.account,symbol:state.symbol,document:layout};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),a=el("a",{href:url,download:`2eas-layout-${state.account}-${state.symbol}.json`});
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),0);show("Layoutdatei exportiert. Sie enthält Chart-Konfiguration, keine Brokerpositionen.")
 }catch(error){show("Lokaler Export fehlgeschlagen: "+error.message)}
}
async function importLocalLayout(file){
 if(!file||file.size>600000){show("Layoutdatei fehlt oder ist zu groß.");return}
 try{const payload=JSON.parse(await file.text()),doc=payload?.format==="2eas-chart-layout:v1"?payload.document:payload;
  if(payload?.format==="2eas-chart-layout:v1"&&(payload.account!==state.account||payload.symbol!==state.symbol))throw Error("Layoutdatei gehört zu einem anderen Konto oder Symbol.");
  validateDocument(doc);if(doc.symbol!==undefined&&doc.symbol!==state.symbol)throw Error("Layoutdatei gehört zu einem anderen Symbol.");
  if(!state.importDocument(doc))throw Error("Layout konnte nicht im Chart geöffnet werden.");show("Layout lokal geladen. Mit ‘Aktuelles Layout verschlüsselt speichern’ sicher in das neue Bundle übernehmen.");
 }catch(error){show("Layoutdatei abgewiesen: "+error.message)}
}
async function verifyRemote(result,bundle,expectedDocument){
 if(result.bundleId!==bundle.bundleId||result.account!==bundle.account||result.symbol!==bundle.symbol)throw Error("Serverantwort hat einen abweichenden Scope.");
 const roundtrip=await decryptDocument(result,bundle);
 if(JSON.stringify(roundtrip)!==JSON.stringify(expectedDocument))throw Error("Serverrevision konnte nicht identisch entschlüsselt werden.");
}
async function saveLocal(){
 const bundle=state?.bundle;if(!bundle||!scopeMatches(bundle)){show("Recovery-Paket für aktuelles Konto/Symbol zuerst importieren oder neu erstellen.");return}
 const generation=state.scopeGeneration;
 const captured=state.exportDocument();if(!captured){show("Chart ist noch nicht bereit.");return}
 let document,expectedRevision=null;
 try{document=JSON.parse(new TextDecoder().decode(validateDocument(captured)))}catch(error){show(error.message);return}
 const envelope=await encryptDocument(document,bundle),key=bundleKey(bundle);
 try{
   const current=await getCurrent(bundle);assertCurrentScope(bundle,generation);expectedRevision=current.revision;
   if(current.formatVersion!==FORMAT){downloadEnvelope(current);const error=Error("Neues Serverformat kann nicht überschrieben werden; Ciphertext wurde archiviert.");error.status=409;error.unsupportedFormat=true;throw error}
  const result=await request(bundle,"PUT",syncUrl(bundle),{account:bundle.account,symbol:bundle.symbol,expectedRevision, ...envelope});
  await verifyRemote(result,bundle,document);assertCurrentScope(bundle,generation);state.revision=result.revision;await outbox("delete",key);show(`Verschlüsselt gespeichert · Revision ${result.revision}.`);
 }catch(error){
  if(error.status===404){
   try{expectedRevision=0;const result=await request(bundle,"PUT",syncUrl(bundle),{account:bundle.account,symbol:bundle.symbol,expectedRevision,...envelope});await verifyRemote(result,bundle,document);assertCurrentScope(bundle,generation);state.revision=result.revision;await outbox("delete",key);show(`Verschlüsselt gespeichert · Revision ${result.revision}.`);return}catch(next){error=next}
  }
  if(error.status===409){await outbox("put",key,{account:bundle.account,symbol:bundle.symbol,bundleId:bundle.bundleId,envelope,baseRevision:expectedRevision,queuedUtc:Date.now()});assertCurrentScope(bundle,generation);renderConflict(envelope,document);show(error.unsupportedFormat?"Unbekanntes Serverformat archiviert. „Meine Änderungen“ bleibt gesperrt; „Als Kopie speichern“ erhält beide Stände.":"Neue Revision vorhanden. Wähle eine Konfliktlösung.");return}
  if(error.status&&(error.status<500||error.status===503)){show("Sync vom Server abgewiesen: "+error.message);return}
  try{await outbox("put",key,{account:bundle.account,symbol:bundle.symbol,bundleId:bundle.bundleId,envelope,baseRevision:expectedRevision,queuedUtc:Date.now()});show("Offline: verschlüsselter Stand liegt in der lokalen Warteschlange.")}
  catch(queueError){show(`Sync fehlgeschlagen: ${error.message}; Offline-Ablage: ${queueError.message}`)}
 }
}
async function loadRemote(){
 const bundle=state?.bundle;if(!bundle||!scopeMatches(bundle)){show("Recovery-Paket für aktuelles Konto/Symbol zuerst importieren.");return}
 const generation=state.scopeGeneration;
 try{const remote=await getCurrent(bundle);assertCurrentScope(bundle,generation);if(remote.formatVersion!==FORMAT){downloadEnvelope(remote);throw Error("Unbekanntes Format; Ciphertext wurde als Archiv heruntergeladen.")}
  const document=await decryptDocument(remote,bundle);assertCurrentScope(bundle,generation);if(!state.importDocument(document))throw Error("Layout passt nicht zum aktiven Chart.");state.revision=remote.revision;show(`Verschlüsselter Serverstand v${remote.revision} geladen.`)
 }catch(error){show(error.status===404?"Für dieses Recovery-Paket gibt es noch keinen Serverstand.":"Laden fehlgeschlagen: "+error.message)}
}
async function loadHistory(){
 const bundle=state?.bundle;if(!bundle||!scopeMatches(bundle)){show("Recovery-Paket für aktuelles Konto/Symbol zuerst importieren.");return}
 const generation=state.scopeGeneration;
 try{const data=await request(bundle,"GET",syncUrl(bundle)+`/history?account=${encodeURIComponent(bundle.account)}&symbol=${encodeURIComponent(bundle.symbol)}`);assertCurrentScope(bundle,generation);
  state.history.replaceChildren(el("option",{value:""},"Revision wählen"));
  for(const item of data.items||[])state.history.append(el("option",{value:item.revision},`Revision ${item.revision} · ${new Date(item.createdUtc*1000).toLocaleString()}`));
  show(`${(data.items||[]).length} verschlüsselte Revisionen verfügbar.`)
 }catch(error){show("Revisionshistorie nicht verfügbar: "+error.message)}
}
async function restoreHistory(){
 const bundle=state?.bundle,revision=Number(state?.history.value);if(!bundle||!Number.isInteger(revision)||revision<1){show("Zuerst eine Revision auswählen.");return}
 const generation=state.scopeGeneration;
 try{const data=await request(bundle,"GET",syncUrl(bundle)+`/history?account=${encodeURIComponent(bundle.account)}&symbol=${encodeURIComponent(bundle.symbol)}`);assertCurrentScope(bundle,generation);const item=(data.items||[]).find(entry=>entry.revision===revision);
  if(!item)throw Error("Revision ist nicht mehr verfügbar.");if(item.formatVersion!==FORMAT){downloadEnvelope({...item,bundleId:bundle.bundleId,account:bundle.account,symbol:bundle.symbol});throw Error("Format nicht unterstützt; Revision wurde als Ciphertext archiviert.")}
  const document=await decryptDocument(item,bundle);assertCurrentScope(bundle,generation);if(!state.importDocument(document))throw Error("Layout passt nicht zum aktiven Chart.");show(`Revision ${revision} geladen. Das aktuelle Serverhead bleibt unverändert.`)
 }catch(error){show("Revision konnte nicht geladen werden: "+error.message)}
}
async function rotateKey(){
 const oldBundle=state?.bundle;if(!oldBundle||!scopeMatches(oldBundle)){show("Recovery-Paket für aktuelles Konto/Symbol zuerst importieren.");return}
 const generation=state.scopeGeneration;
 try{
  if(await outbox("get",bundleKey(oldBundle)))throw Error("Erst den vorgemerkten Offline-Stand synchronisieren oder verwerfen.");
  assertCurrentScope(oldBundle,generation);
  const history=await request(oldBundle,"GET",syncUrl(oldBundle)+`/history?account=${encodeURIComponent(oldBundle.account)}&symbol=${encodeURIComponent(oldBundle.symbol)}`);
  assertCurrentScope(oldBundle,generation);
  const documents=[];
  for(const item of [...(history.items||[])].reverse()){
   if(item.formatVersion!==FORMAT){downloadEnvelope({...item,bundleId:oldBundle.bundleId,account:oldBundle.account,symbol:oldBundle.symbol});throw Error("Unbekannte Revision archiviert; Rotation abgebrochen.")}
   documents.push(await decryptDocument(item,oldBundle));assertCurrentScope(oldBundle,generation);
  }
  if(!documents.length)throw Error("Keine Revisionen zum Rotieren vorhanden.");
  const fresh=await createRecoveryPackage(oldBundle.account,oldBundle.symbol);assertCurrentScope(oldBundle,generation);
  let revision=0;
  show("Schlüsselrotation läuft · alte Historie bleibt als verschlüsseltes Archiv erhalten.");
  for(const document of documents){
   assertCurrentScope(oldBundle,generation);
   const envelope=await encryptDocument(document,fresh);assertCurrentScope(oldBundle,generation);
   const result=await request(fresh,"PUT",syncUrl(fresh),{
    account:fresh.account,symbol:fresh.symbol,expectedRevision:revision,...envelope});
   await verifyRemote(result,fresh,document);assertCurrentScope(oldBundle,generation);revision=result.revision;
  }
  assertCurrentScope(oldBundle,generation);state.bundle=fresh;rememberBundle(fresh);state.recovery.value=fresh.recoveryPackage;state.revision=revision;
  show(`${documents.length} Revisionen mit neuem Schlüssel verifiziert. Recovery-Paket sichern; alte Schlüssel werden nicht widerrufen.`);
 }catch(error){show("Schlüsselrotation abgebrochen: "+error.message)}
}async function retryPending(){
 const bundle=state?.bundle;if(!bundle)return;
 const generation=state.scopeGeneration;
 try{const pending=await outbox("get",bundleKey(bundle));if(!pending)return;
  let currentRevision=0,currentExists=false;try{const current=await getCurrent(bundle);assertCurrentScope(bundle,generation);if(current.formatVersion!==FORMAT){downloadEnvelope(current);throw Error("Neues Serverformat archiviert; Offline-Stand bleibt erhalten und wird nicht überschrieben.")}currentRevision=current.revision;currentExists=true}catch(error){if(error.status!==404)throw error}
  const baseRevision=Number.isInteger(pending.baseRevision)?pending.baseRevision:null;
  if(currentExists&&(baseRevision===null||baseRevision!==currentRevision)){const document=await decryptDocument(pending.envelope,bundle);assertCurrentScope(bundle,generation);renderConflict(pending.envelope,document);show("Offline-Stand kollidiert mit einer neuen oder unbekannten Revision. Konfliktlösung erforderlich.");return}
  if(!currentExists&&baseRevision!==null&&baseRevision!==0){const document=await decryptDocument(pending.envelope,bundle);assertCurrentScope(bundle,generation);renderConflict(pending.envelope,document);show("Offline-Stand kann nicht automatisch mit dem fehlenden Serverstand abgeglichen werden. Konfliktlösung erforderlich.");return}
  const result=await request(bundle,"PUT",syncUrl(bundle),{account:bundle.account,symbol:bundle.symbol,expectedRevision:currentExists?baseRevision:0,...pending.envelope});
  const document=await decryptDocument(pending.envelope,bundle);
  await verifyRemote(result,bundle,document);assertCurrentScope(bundle,generation);state.revision=result.revision;await outbox("delete",bundleKey(bundle));show(`Offline-Stand als v${result.revision} synchronisiert.`)
 }catch(error){if(!state||state.scopeGeneration!==generation||!scopeMatches(bundle))return;if(error.status===409){const pending=await outbox("get",bundleKey(bundle));if(!state||state.scopeGeneration!==generation||!scopeMatches(bundle))return;if(pending){const document=await decryptDocument(pending.envelope,bundle);assertCurrentScope(bundle,generation);renderConflict(pending.envelope,document)}show("Offline-Stand kollidiert mit einer neuen Revision. Konfliktlösung erforderlich.")}else show("Offline-Stand bleibt verschlüsselt vorgemerkt: "+error.message)}
}
function importKey(){
 const raw=state.recovery.value.trim(),generation=state.scopeGeneration,mode=state.mode,symbol=state.symbol;void (async()=>{
  try{const bundle=await parseRecoveryPackage(raw);if(!scopeMatches(bundle))throw Error("Recovery-Paket gehört zu einem anderen Konto oder Symbol.");
   if(!state||state.scopeGeneration!==generation||state.mode!==mode||state.symbol!==symbol)throw Error("Scope wechselte während des Imports; Vorgang verworfen.");
   state.bundle=bundle;rememberBundle(bundle);state.revision=0;show("Recovery-Paket importiert; Serverstand wird geprüft.");await loadRemote();await retryPending();
  }catch(error){show("Recovery-Paket ungültig: "+error.message)}
 })();
}
function mount({panel,account:accountId,exportDocument,importDocument,exportGlobalDrawings,importGlobalDrawings,hasLegacyGlobalDrawings,importLegacyGlobalDrawings,getAccount,getSymbol}){
 if(state||!panel||typeof exportDocument!=="function"||typeof importDocument!=="function")return;
 const section=el("section",{className:"cs-server-sync"}),title=el("div",{className:"cs-server-sync-head"},"VERSCHLÜSSELTER GERÄTE-SYNC · AES-GCM");
 const scopeSelect=el("select",{"aria-label":"Sync-Modus"});
 scopeSelect.append(el("option",{value:"layout"},"Konto-Layout"),el("option",{value:"global"},"Symbolweite Markierungen"));title.append(scopeSelect);
 const legacyImport=el("button",{type:"button"},"Alte browserlokale Markierungen übernehmen");legacyImport.hidden=true;
 const create=el("button",{type:"button"},"Neuen Sync-Schlüssel erstellen"),recovery=el("textarea",{rows:"3",spellcheck:"false","aria-label":"Recovery-Paket","placeholder":"Recovery-Paket hier sichern oder auf diesem Gerät importieren"});
 const row=el("div",{className:"cs-server-sync-row"}),connect=el("button",{type:"button"},"Recovery-Paket importieren"),save=el("button",{type:"button"},"Aktuelles Layout verschlüsselt speichern"),load=el("button",{type:"button"},"Serverstand laden"),copy=el("button",{type:"button"},"Recovery-Paket kopieren");row.append(connect,save,load,copy);
 const migrationRow=el("div",{className:"cs-server-sync-row"}),exportLayout=el("button",{type:"button"},"Lokales Layout exportieren"),layoutFile=el("input",{type:"file",accept:"application/json,.json","aria-label":"Layoutdatei importieren"}),importLayout=el("button",{type:"button"},"Layoutdatei importieren");migrationRow.append(exportLayout,layoutFile,importLayout);
 const historyRow=el("div",{className:"cs-server-sync-row"}),history=el("button",{type:"button"},"Revisionen laden"),historySelect=el("select",{"aria-label":"Verschlüsselte Revision wählen"}),restore=el("button",{type:"button"},"Revision lokal öffnen"),rotate=el("button",{type:"button"},"Schlüssel rotieren");historyRow.append(history,historySelect,restore,rotate);
 const conflictBox=el("div",{className:"cs-sync-conflict"});conflictBox.hidden=true;
 const message=el("p",{role:"status","aria-live":"polite"},"Schlüssel wird nur auf diesem Gerät gehalten. Serverzugriff braucht angemeldeten Nutzer mit Layout- oder Trade-Recht.");
 section.append(title,legacyImport,create,recovery,row,migrationRow,historyRow,conflictBox,message);panel.append(section);
 state={account:accountId,symbol:getSymbol?.()||"XAUUSD",mode:"layout",scopeGeneration:0,bundle:null,bundleCache:new Map(),revision:0,recovery,history:historySelect,scopeSelect,save,load,migrationRow,legacyImport,hasLegacyGlobalDrawings,importLegacyGlobalDrawings,conflictBox,message,
  exportDocument:()=>state.mode==="global"?exportGlobalDrawings?.():exportDocument(),
  importDocument:document=>state.mode==="global"?(importGlobalDrawings?.(document)===true):importDocument(document),
  getAccount,getSymbol,conflict:null,enabled:false,controls:[scopeSelect,create,recovery,connect,save,load,copy,history,historySelect,restore,rotate]};
 scopeSelect.disabled=true;
 scopeSelect.addEventListener("change",()=>setMode(scopeSelect.value));
 legacyImport.addEventListener("click",()=>{
  if(state.mode!=="global"||typeof state.importLegacyGlobalDrawings!=="function"||
   !window.confirm("Vorhandene browserlokale Markierungen in den aktuell angemeldeten Nutzerscope übernehmen? Die alte Quelle bleibt erhalten."))return;
  if(state.importLegacyGlobalDrawings()){legacyImport.hidden=true;show("Alte Markierungen lokal übernommen. Zum Gerätesync jetzt ein Recovery-Paket sichern und verschlüsselt speichern.")}
  else show("Alte Markierungen konnten nicht sicher übernommen werden.");
 });
 create.addEventListener("click",()=>void (async()=>{const generation=state.scopeGeneration,mode=state.mode,symbol=state.symbol;try{
  const bundle=state.mode==="global"?await createGlobalDrawingRecoveryPackage(state.symbol):await createRecoveryPackage(state.account,state.symbol);
  if(!state||state.scopeGeneration!==generation||state.mode!==mode||state.symbol!==symbol){show("Scope wechselte während der Schlüsselerstellung; Paket wurde verworfen.");return}
  state.bundle=bundle;rememberBundle(bundle);state.revision=0;recovery.value=bundle.recoveryPackage;
  show("Recovery-Paket kopieren und sicher aufbewahren; ohne Schlüssel ist keine Wiederherstellung möglich.");await retryPending()
 }catch(error){show("Schlüssel konnte nicht erstellt werden: "+error.message)}})());
 connect.addEventListener("click",importKey);save.addEventListener("click",()=>void saveLocal());load.addEventListener("click",()=>void loadRemote());history.addEventListener("click",()=>void loadHistory());restore.addEventListener("click",()=>void restoreHistory());rotate.addEventListener("click",()=>void rotateKey());
 exportLayout.addEventListener("click",exportLocalLayout);importLayout.addEventListener("click",()=>void importLocalLayout(layoutFile.files?.[0]));
 copy.addEventListener("click",()=>{if(!navigator.clipboard?.writeText){show("Kopieren blockiert; Recovery-Paket manuell markieren und kopieren.");return}void navigator.clipboard.writeText(recovery.value).then(()=>show("Recovery-Paket kopiert; jetzt sicher aufbewahren."),()=>show("Kopieren blockiert; Recovery-Paket manuell markieren und kopieren."))});
 void checkAvailability();
}
function scope(account,symbol){
 if(!state)return;const previous=scopeKey(activeScopeAccount(),state.symbol),next=scopeKey(state.mode==="global"?"global":account,symbol);if(previous!==next)state.scopeGeneration++;state.account=account;state.symbol=symbol;
 state.legacyImport.hidden=state.mode!=="global"||typeof state.hasLegacyGlobalDrawings!=="function"||!state.hasLegacyGlobalDrawings();
 if(!scopeMatches(state.bundle)){state.bundle=state.bundleCache.get(scopeKey(activeScopeAccount(),symbol))||null;state.revision=0;state.conflict=null;state.conflictBox.hidden=true;state.recovery.value=state.bundle?.recoveryPackage||"";show(state.bundle?"Recovery-Schlüssel für diesen Konto-/Symbolscope auf diesem Gerät geladen.":"Konto oder Symbol gewechselt. Sync-Schlüssel für diesen Scope importieren.")}
}
window.ChartStudioDeviceSync=Object.freeze({createRecoveryPackage,createGlobalDrawingRecoveryPackage,parseRecoveryPackage,encryptDocument,decryptDocument,validateDocument});
window.ChartStudioServerSync=Object.freeze({mount,account(id){if(state)scope(id,state.getSymbol?.()||state.symbol)},scope});
})();

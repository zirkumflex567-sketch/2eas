/* Optional authenticated server-side chart workspace sync.
 * Bearer token lives ONLY in JS memory; never in localStorage, URL or HTML.
 * Default backend is disabled until operator explicitly configures a strong secret.
 */
(()=>{
"use strict";
let state=null;
const endpoint="/api/chart/v1/workspace";
function path(){return window.location.pathname.startsWith("/stt")?"/stt":""}
function el(tag,attrs={},text=""){
 const n=document.createElement(tag);
 for(const [key,val] of Object.entries(attrs)){
  if(key==="className")n.className=val;
  else n.setAttribute(key,String(val));
 }
 if(text)n.textContent=text;
 return n;
}
function show(msg){if(state)state.message.textContent=msg}
function account(name){
 if(!state)return;
 state.account=name;state.epoch++;state.revisions.clear();state.select.replaceChildren();
 const option=el("option",{value:""},"Serverlayout wählen");state.select.append(option);
 if(state.token)void refresh();
}
function headers(){return {"Authorization":"Bearer "+state.token,"Accept":"application/json"}}
async function request(method,url,document){
 if(!state?.token)throw Error("Zuerst einen Server-Token eingeben.");
 const opts={method,headers:headers(),cache:"no-store"};
 if(document!==undefined){
  opts.headers["Content-Type"]="application/json";
  opts.body=JSON.stringify(document);
 }
 const result=await fetch(path()+url,opts);
 const data=await result.json().catch(()=>({}));
 if(!result.ok){
  const detail=data.detail;
  const message=typeof detail==="string"?detail:detail?.message;
  const error=new Error(message||"Serverfehler "+result.status);
  error.status=result.status;
  throw error;
 }
 return data;
}
async function refresh(){
 if(!state?.token)return;
 const accountId=state.account,epoch=++state.epoch;
 show("Server-Layouts werden geladen …");
 try{
  const data=await request("GET",endpoint+"s?account="+encodeURIComponent(accountId)+"&symbol=XAUUSD");
  if(!state||epoch!==state.epoch||accountId!==state.account)return;
  if(data.account!==accountId||!Array.isArray(data.items))throw Error("Antwort gehört zum falschen Konto.");
  state.revisions.clear();state.select.replaceChildren(el("option",{value:""},"Serverlayout wählen"));
  for(const item of data.items){
   if(typeof item.name!=="string"||!Number.isInteger(item.revision))continue;
   state.revisions.set(item.name,item.revision);
   state.select.append(el("option",{value:item.name},item.name+" · v"+item.revision));
  }
  show(data.items.length+" Server-Layouts für "+accountId+" geladen.");
 }catch(err){if(epoch===state.epoch)show("Server-Sync: "+err.message)}
}
async function action(type){
 if(!state?.token){show("Server nicht verbunden.");return}
 const accountId=state.account,epoch=state.epoch;
 const name=(type==="save"?state.name.value.trim():state.select.value);
 if(!name||name.length>64){show("Bitte einen Layoutnamen (1–64 Zeichen) wählen.");return}
 try{
  if(type==="save"){
   const document=state.exportDocument();
   if(!document)throw Error("Chart ist noch nicht bereit.");
   const expectedRevision=state.revisions.get(name)||0;
   const result=await request("PUT",endpoint,{
    account:accountId,symbol:"XAUUSD",name,expectedRevision,document
   });
   if(epoch!==state.epoch||accountId!==state.account)return;
   if(result.account!==accountId||result.name!==name)throw Error("Falsches Konto in Antwort.");
   await refresh();
   state.select.value=name;
   show("Serverlayout '"+name+"' gespeichert (Revision "+result.revision+").");
  }else if(type==="load"){
   const result=await request("GET",endpoint+"?account="+encodeURIComponent(accountId)+
    "&symbol=XAUUSD&name="+encodeURIComponent(name));
   if(epoch!==state.epoch||accountId!==state.account)return;
   if(result.account!==accountId||result.name!==name)throw Error("Falsches Konto in Antwort.");
   if(!state.importDocument(result.document))throw Error("Layout enthält nicht unterstützte Daten.");
   state.revisions.set(name,result.revision);
   show("Serverlayout '"+name+"' v"+result.revision+" geladen.");
  }else if(type==="delete"){
   const rev=state.revisions.get(name);
   if(!rev)throw Error("Bitte zuerst aktualisieren.");
   if(!window.confirm("Serverlayout '"+name+"' löschen?"))return;
   await request("DELETE",endpoint,{account:accountId,symbol:"XAUUSD",name,expectedRevision:rev});
   if(epoch!==state.epoch||accountId!==state.account)return;
   await refresh();
   show("Serverlayout gelöscht.");
  }
 }catch(err){
  if(epoch!==state.epoch||accountId!==state.account)return;
  show((err.status===409?"Versionskonflikt: Bitte aktualisieren. ": "Server-Sync: ")+err.message);
 }
}
function mount({panel,account:accountId,exportDocument,importDocument,getAccount}){
 if(state||!panel||typeof exportDocument!=="function"||typeof importDocument!=="function")return;
 const section=el("section",{className:"cs-server-sync"});
 const top=el("div",{className:"cs-server-sync-head"},"SERVER-LAYOUTS · SQLite (opt-in)");
 const row=el("div",{className:"cs-server-sync-row"});
 const password=el("input",{type:"password",autocomplete:"off",spellcheck:"false",
  placeholder:"Server-Token (nicht gespeichert)","aria-label":"Server-Token"});
 const connect=el("button",{type:"button"},"Verbinden");
 const disconnect=el("button",{type:"button"},"Trennen");
 row.append(password,connect,disconnect);
 const select=el("select",{"aria-label":"Server-Layout wählen"});
 const name=el("input",{type:"text",maxlength:"64",placeholder:"Name für neues Serverlayout",
  "aria-label":"Neuer Layoutname"});
 const actions=el("div",{className:"cs-server-sync-row"});
 const save=el("button",{type:"button"},"Server speichern");
 const load=el("button",{type:"button"},"Server laden");
 const remove=el("button",{type:"button"},"Server löschen");
 const refreshButton=el("button",{type:"button"},"Aktualisieren");
 actions.append(select,name,save,load,remove,refreshButton);
 const message=el("p",{role:"status","aria-live":"polite"},"Deaktiviert bis CHART_STUDIO_STORAGE_ENABLED=1 mit starkem Token gesetzt ist.");
 section.append(top,row,actions,message);
 panel.append(section);
 state={account:accountId,token:"",epoch:0,revisions:new Map(),select,name,message,
  exportDocument,importDocument,getAccount};
 account(accountId);
 connect.addEventListener("click",()=>{
  const token=password.value;
  password.value="";
  if(token.length<32){show("Ein Server-Token mit mindestens 32 Zeichen ist erforderlich.");return}
  state.token=token;void refresh();
 });
 disconnect.addEventListener("click",()=>{state.token="";state.epoch++;state.revisions.clear();
  account(getAccount());show("Server getrennt. Token nicht gespeichert.");});
 refreshButton.addEventListener("click",()=>void refresh());
 save.addEventListener("click",()=>void action("save"));
 load.addEventListener("click",()=>void action("load"));
 remove.addEventListener("click",()=>void action("delete"));
}
window.ChartStudioServerSync=Object.freeze({mount,account});
})();
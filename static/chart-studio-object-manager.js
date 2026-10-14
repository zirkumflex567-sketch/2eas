/* Chart Studio Object Manager (read-only broker): named, lockable, hideable
 * drawings with account-scoped state supplied by the beta drawing adapter.
 * All potentially untrusted object labels are rendered via textContent.
 */
(()=>{
"use strict";
const NAMES=Object.freeze({
 horizontal:"Preislinie",vertical:"Zeitlinie",trend:"Trendlinie",rect:"Rechteck",fib:"Fibonacci",
 ray:"Strahl",ruler:"Messung",channel:"Parallelkanal"
});
let state=null;
function make(tag,attrs={},text){
 const node=document.createElement(tag);
 for(const [name,value] of Object.entries(attrs)){
  if(name==="className")node.className=value;
  else node.setAttribute(name,String(value));
 }
 if(text!==undefined)node.textContent=String(text);
 return node;
}
function render(){
 if(!state)return;
 const items=state.getItems(),selected=state.getSelected();
 state.list.replaceChildren();
 state.count.textContent=items.length+" Zeichnungen";
 if(!state.root.open)return;
 if(!items.length){
  state.list.append(make("p",{className:"cs-object-empty"},"Noch keine Zeichnungen vorhanden."));
  return;
 }
 const fragment=document.createDocumentFragment();
 for(let i=items.length-1;i>=0;i--){
  const d=items[i],name=d.label||NAMES[d.kind]||"Objekt";
  const row=make("div",{className:"cs-object-row","data-index":i,
   "data-object-id":d.id||"", "data-selected":String(i===selected)});
  const picker=make("button",{type:"button","data-action":"select","data-index":i,
   "aria-label":"Objekt auswählen "+name},(i+1)+". "+(NAMES[d.kind]||"Objekt"));
  const label=make("input",{type:"text","data-field":"label","data-index":i,
   maxlength:40,"aria-label":"Objektname "+(i+1),placeholder:"Objektname"});
  label.value=d.label||"";
  const toggle=make("button",{type:"button","data-action":"visibility","data-index":i,
   "aria-pressed":String(d.visible!==false),"aria-label":"Sichtbarkeit "+name},
   d.visible===false?"Einblenden":"Ausblenden");
  const lock=make("button",{type:"button","data-action":"lock","data-index":i,
   "aria-pressed":String(d.locked===true),"aria-label":"Bearbeitungssperre "+name},
   d.locked===true?"Entsperren":"Sperren");
  const up=make("button",{type:"button","data-action":"up","data-index":i,
   "aria-label":"Objekt nach vorne "+name},"↑");
  const down=make("button",{type:"button","data-action":"down","data-index":i,
   "aria-label":"Objekt nach hinten "+name},"↓");
  const duplicate=make("button",{type:"button","data-action":"duplicate","data-index":i,
   "aria-label":"Duplizieren "+name},"Kopie");
  const del=make("button",{type:"button","data-action":"remove","data-index":i,
   "aria-label":"Löschen "+name},"✕");
  up.disabled=i===items.length-1;down.disabled=i===0;
  duplicate.disabled=items.length>=500;
  row.append(picker,label,toggle,lock,up,down,duplicate,del);
  fragment.append(row);
 }
 state.list.append(fragment);
}
function mount({panel,getItems,getSelected,operate}){
 if(state||!panel||typeof getItems!=="function"||
  typeof getSelected!=="function"||typeof operate!=="function")return;
 const root=make("details",{className:"cs-object-manager"});
 const summary=make("summary",{},"OBJEKT-MANAGER · Zeichnungen");
 const count=make("span",{className:"cs-object-count"},"0 Zeichnungen");
 const hint=make("p",{},"Anklicken, umbenennen, sperren, ein-/ausblenden, duplizieren oder sortieren. Alles rückgängig machbar.");
 const list=make("div",{className:"cs-object-list"});
 summary.append(count);root.append(summary,hint,list);panel.append(root);
 state={root,list,count,getItems,getSelected,operate};
 root.addEventListener("toggle",()=>{if(root.open)render()});
 list.addEventListener("click",event=>{
  const b=event.target.closest("button[data-action]");if(!b)return;
  const i=Number(b.dataset.index),items=getItems();
  if(!Number.isInteger(i)||i<0||i>=items.length)return;
  operate(i,b.dataset.action);
 });
 list.addEventListener("change",event=>{
  const field=event.target.closest('input[data-field="label"]');
  if(!field)return;
  const i=Number(field.dataset.index),items=getItems();
  if(!Number.isInteger(i)||i<0||i>=items.length)return;
  operate(i,"rename",field.value);
 });
 render();
}
window.ChartStudioObjectManager=Object.freeze({mount,render});
})();

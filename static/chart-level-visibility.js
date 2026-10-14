/* Account-local visibility state for the dashboard's broker/chart price levels. */
(()=>{"use strict";
const definitions=Object.freeze([
 {key:"daily_high",field:"daily_high",title:"Daily High (Res)",color:"#f43f5e",style:2},
 {key:"daily_low",field:"daily_low",title:"Daily Low (Sup)",color:"#10b981",style:2},
 {key:"daily_poc",field:"daily_poc",title:"Daily POC",color:"#f59e0b",style:0},
 {key:"daily_vah",field:"daily_vah",title:"Daily VAH",color:"#fb923c",style:1},
 {key:"daily_val",field:"daily_val",title:"Daily VAL",color:"#fbbf24",style:1},
 {key:"weekly_high",field:"weekly_high",title:"Weekly High (Res)",color:"#e11d48",style:1},
 {key:"weekly_low",field:"weekly_low",title:"Weekly Low (Sup)",color:"#059669",style:1},
 {key:"weekly_poc",field:"weekly_poc",title:"Weekly POC",color:"#06b6d4",style:0},
 {key:"weekly_vah",field:"weekly_vah",title:"Weekly VAH",color:"#38bdf8",style:1},
 {key:"weekly_val",field:"weekly_val",title:"Weekly VAL",color:"#67e8f9",style:1}
]);
const keys=definitions.map(row=>row.key),keySet=new Set(keys),defaults=Object.freeze(Object.fromEntries(keys.map(key=>[key,true])));
const storageKey=account=>"2eas:chart-level-visibility:v1:"+account;
const sessionChoices=new Map();
function choicesFor(account){let choices=sessionChoices.get(account);if(!choices){choices={};sessionChoices.set(account,choices)}return choices}
function validAccount(account){return account==="titan"||account==="goldm15"}
function parse(account,storage){
 if(!validAccount(account))return null;
 try{
  const raw=storage.getItem(storageKey(account));if(raw===null)return {};
  const value=JSON.parse(raw);
  if(!value||typeof value!=="object"||Array.isArray(value)||Object.keys(value).some(key=>!keySet.has(key)||typeof value[key]!=="boolean"))return null;
  return value;
 }catch(_){return null}
}
function read(account,storage=window.localStorage){
 const saved=parse(account,storage);return Object.freeze({...defaults,...(saved||{}),...(sessionChoices.get(account)||{})});
}
function hasChoice(account,key,storage=window.localStorage){
 const saved=parse(account,storage);return Object.hasOwn(sessionChoices.get(account)||{},key)||!!saved&&Object.hasOwn(saved,key);
}
function set(account,key,visible,storage=window.localStorage){
 if(!validAccount(account)||!keySet.has(key)||typeof visible!=="boolean")return false;
 const saved=parse(account,storage)||{};const next={...saved,[key]:visible};
 choicesFor(account)[key]=visible;
 try{storage.setItem(storageKey(account),JSON.stringify(next))}catch(_){/* Session preference remains usable without persistence. */}
 return true
}
function render(box,levels,account,{storage=window.localStorage,onChange=()=>{},document=window.document}={}){
 if(!box)return;
 const focusedKey=document.activeElement?.dataset?.levelKey||"";
 box.replaceChildren();box.hidden=!levels.length;
 if(!levels.length)return;
 const heading=document.createElement("div");heading.className="stone-chart-level-heading";heading.textContent="PREISLEVEL";box.append(heading);
 for(const level of levels){
  const row=document.createElement("div");row.className="stone-chart-level";row.style.setProperty("--level-color",level.color);
  const toggle=document.createElement("input");toggle.type="checkbox";toggle.className="stone-chart-level-toggle";
  toggle.dataset.levelKey=level.key;toggle.checked=level.enabled===true;
  toggle.setAttribute("aria-label",level.title+" im Chart anzeigen");
  toggle.addEventListener("change",()=>{
   if(!set(account,level.key,toggle.checked,storage)){toggle.checked=level.enabled===true;return}
   onChange(level.key,toggle.checked);
  });
  const label=document.createElement("span");label.className="stone-chart-level-name";label.textContent=level.title;
  const value=document.createElement("strong");value.className="stone-chart-level-price";value.textContent=Number(level.price).toFixed(2);
  row.append(toggle,label,value);
  if(level.note){const note=document.createElement("small");note.className="stone-chart-level-note";note.textContent=level.note;row.append(note)}
  box.append(row);
 }
 if(focusedKey){const replacement=box.querySelector(`[data-level-key="${focusedKey}"]`);replacement?.focus({preventScroll:true})}
}
window.DashboardChartLevelVisibility=Object.freeze({definitions,read,hasChoice,set,render});
})();

/* Stone Ritual: UI-only celebration controller, no trade actions. */
(()=>{
"use strict";
const key="two_eas_ritual_settings_v1";
const defaults={mode:"mystic",strength:3,trade:true,profit:true,showEma:false,expanded:false};
const modes=["off","mystic","chaos","ritual"];
let settings={...defaults};
try {const s=JSON.parse(localStorage.getItem(key)||"null");
 if(s&&typeof s==="object")settings={...settings,...s};} catch(_){}
if(!modes.includes(settings.mode))settings.mode="mystic";
settings.strength=Math.max(1,Math.min(5,Number(settings.strength)||3));
const seen=new Map(), motion=window.matchMedia?.("(prefers-reduced-motion: reduce)")||{matches:false};
const byId=id=>document.getElementById(id);
let panel=null,toggle=null,emaStrip=null,status=null,emaState=null;
const save=()=>{try{localStorage.setItem(key,JSON.stringify(settings));}catch(_){}};
function allowed(){return settings.mode!=="off"&&!motion.matches&&!document.hidden&&document.body.classList.contains("theme-stone");}
function configureFX(){
  document.body.classList.toggle("stone-fx-off",settings.mode==="off");
  try{window.StoneChartFX?.configure({enabled:settings.mode!=="off",ambient:settings.mode!=="off"});}catch(_){}
}
function info(s){if(status)status.textContent=s;}
function updateEMAs(values){
 emaState=values;
 if(!emaStrip)return;
 const fmt=n=>n!==null&&n!==undefined&&Number.isFinite(Number(n))?Number(n).toFixed(2):"—";
 for(const [id,k] of [["stone-ema-20","ema20"],["stone-ema-50","ema50"],["stone-ema-200","ema200"]]){
  const n=byId(id);if(n)n.textContent=fmt(values?.[k]);
 }
 const tf=byId("stone-ema-tf");if(tf)tf.textContent=values?.timeframe||"—";
}
function clearEMAs(){updateEMAs({timeframe:"—",ema20:null,ema50:null,ema200:null});}
function sync(){
 if(!panel)return;
 panel.hidden=!settings.expanded;
 toggle.setAttribute("aria-expanded",String(settings.expanded));
 toggle.textContent=settings.expanded?"✦ FX schließen":"✧ Chart-FX";
 panel.querySelectorAll("[data-fx-mode]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.fxMode===settings.mode)));
 for(const [id,k] of [["fx-ontrade","trade"],["fx-onprofit","profit"],["fx-onema","showEma"]]){
  const el=byId(id);if(el)el.checked=!!settings[k];
 }
 const range=byId("fx-strength");if(range)range.value=String(settings.strength);
 const power=byId("fx-power");if(power)power.textContent=settings.strength+"/5";
 if(emaStrip)emaStrip.hidden=!settings.showEma;
 configureFX();
}
function flash(kind,options={}){
 if(!allowed()){info(motion.matches?"Bewegungsreduktion aktiv.":settings.mode==="off"?"FX deaktiviert.":"FX nur im STEIN-Design.");return false;}
 const profit=kind==="profit",demo=!!options.demo;
 const visualMode=options.previewMode||settings.mode;
 const multi=visualMode==="ritual"?1.55:visualMode==="chaos"?1.25:.85;
 const duration=Math.round((profit?6500:2800)*multi*(.78+.1*settings.strength));
 const count=Math.min(72,Math.round((profit?43:20)*multi*(.55+.18*settings.strength)));
 const palette=profit?["#ffbb3e","#ffe8a0","#63ffd1","#ba91ff"]:["#3ce9ff","#ffbd7b","#b397ff"];
 const chart=byId("tv-chart")?.closest(".glass-card");
 const targets=[chart,document.querySelector(".stone-asset-panel--volume"),
  document.querySelector(".stone-asset-panel--diagnostic"),document.querySelector(".stone-asset-panel--matrix"),
  document.querySelector(".stone-asset-panel--positions"),document.querySelector(".stone-asset-panel--journal"),
  document.querySelector("header.glass-card"),...Array.from(document.querySelectorAll(".stone-target-row")).slice(0,8)].filter(Boolean);
 if(!targets.length)return false;
 try{window.StoneChartFX?.trigger(kind,settings.strength);}catch(_){}
 for(let i=0;i<count;i++){
  const host=targets[Math.floor(Math.random()*targets.length)];
  const color=palette[Math.floor(Math.random()*palette.length)],delay=Math.random()*duration*.78;
  const durationOne=profit?600+Math.random()*950:300+Math.random()*720;
  if(host.animate)host.animate([
   {filter:"brightness(1)",boxShadow:"0 0 0 transparent"},
   {filter:profit?"brightness(1.65)":"brightness(1.35)",boxShadow:"0 0 "+(profit?38:22)+"px "+color},
   {filter:"brightness(1)",boxShadow:"0 0 0 transparent"}
  ],{duration:durationOne,delay,easing:"ease-in-out",iterations:1});
  if(i%2===0){
   const spark=document.createElement("span");
   spark.className="stone-event-spark";spark.setAttribute("aria-hidden","true");
   spark.style.setProperty("--spark-color",color);
   spark.style.left=(5+Math.random()*90)+"%";
   spark.style.top=(5+Math.random()*90)+"%";
   spark.style.animationDelay=delay+"ms";
   spark.style.animationDuration=(500+Math.random()*800)+"ms";
   host.append(spark);setTimeout(()=>spark.remove(),delay+1450);
  }
 }
 const host=chart||targets[0];
 host.querySelector(".stone-event-toast")?.remove();
 const toast=document.createElement("div");
 toast.className="stone-event-toast"+(profit?" stone-event-toast--profit":"");
 toast.setAttribute("role","status");
 const amount=profit&&Number.isFinite(Number(options.profit))?" +$"+Number(options.profit).toFixed(2):"";
 toast.textContent=(demo?"DEMO · ":"")+(profit?"✦ GEWINN REALISIERT ✦":"⚡ TRADE BESTÄTIGT")+amount;
 host.append(toast);setTimeout(()=>toast.remove(),duration);
 info((demo?"Demo: ":"")+(profit?"Gewinn-Eskalation":"Trade-Impuls")+" gestartet.");
 return true;
}
function observeTrades(accountId,journal=[],positions=[]){
 if(!["titan","goldm15"].includes(accountId))return;
 const list=[...(Array.isArray(journal)?journal:[])];
 if(Array.isArray(positions))for(const p of positions)if(p?.ticket!=null)list.push({...p,account:accountId,status:"OPEN"});
 let acc=seen.get(accountId);
 if(!acc){acc={initialized:false,keys:new Set()};seen.set(accountId,acc);}
 const candidates=[];
 for(const item of list){
  if(!item||(item.account&&item.account!==accountId)||item.ticket==null)continue;
  const kind=item.status==="OPEN"?"OPEN":item.status==="CLOSED"?"CLOSED":null;if(!kind)continue;
  const k=kind+":"+item.ticket;if(acc.keys.has(k))continue;
  acc.keys.add(k);
  if(!acc.initialized)continue; // Baseline, not an event
  const ts=Number(item.time_ts)||0;
  if(!ts||Math.abs(Date.now()/1000-ts)>900)continue;
  const net=Number(item.net_profit_usd??item.profit_usd);
  if(kind==="CLOSED"&&net>0&&settings.profit)candidates.push({kind:"profit",profit:net,ts});
  if(kind==="OPEN"&&settings.trade)candidates.push({kind:"trade",ts});
 }
 acc.initialized=true;
 if(acc.keys.size>3000)acc.keys=new Set([...acc.keys].slice(-1500));
 const winner=candidates.sort((a,b)=>(b.kind==="profit")-(a.kind==="profit")||b.ts-a.ts)[0];
 if(winner)flash(winner.kind,{profit:winner.profit});
}
function boot(){
 const chart=byId("tv-chart"),shell=chart?.parentElement,card=chart?.closest(".glass-card");
 if(!shell||!card||byId("stone-fx-panel"))return;
 toggle=document.createElement("button");toggle.type="button";toggle.id="stone-fx-toggle";
 toggle.className="stone-fx-toggle";toggle.setAttribute("aria-controls","stone-fx-panel");
 const expand=byId("stone-chart-expand-btn");
 if(expand)expand.insertAdjacentElement("afterend",toggle);else card.prepend(toggle);
 toggle.addEventListener("click",()=>{settings.expanded=!settings.expanded;save();sync();});
 panel=document.createElement("section");panel.id="stone-fx-panel";panel.className="stone-fx-panel";
 panel.setAttribute("aria-label","Mythische Chart-Effekte");
 panel.innerHTML=[
 '<div class="stone-fx-head"><strong>✧ MYTHIC FX</strong><span>Nur visuell · Keine Orders</span></div>',
 '<div class="stone-fx-modes" role="group" aria-label="Effektmodus">',
 '<button type="button" data-fx-mode="off">Aus</button>',
 '<button type="button" data-fx-mode="mystic">Mystisch</button>',
 '<button type="button" data-fx-mode="chaos">Chaos</button>',
 '<button type="button" data-fx-mode="ritual">Eskalation</button></div>',
 '<div class="stone-fx-controls">',
 '<label>Stärke <input id="fx-strength" type="range" min="1" max="5" step="1"/><b id="fx-power">3/5</b></label>',
 '<label><input id="fx-ontrade" type="checkbox"/> Bestätigter Trade</label>',
 '<label><input id="fx-onprofit" type="checkbox"/> Realisierter Gewinn</label>',
 '<label><input id="fx-onema" type="checkbox"/> EMA-Werte anzeigen</label></div>',
 '<div class="stone-fx-tests">',
 '<button type="button" data-fx-test="trade">⚡ Trade testen</button>',
 '<button type="button" data-fx-test="profit">✦ Gewinn testen</button>',
 '<button type="button" data-fx-test="chaos">✧ Chaos testen</button></div>',
 '<p id="stone-fx-info" role="status" aria-live="polite">Tests lösen niemals Orders aus.</p>'
 ].join("");
 shell.insertAdjacentElement("beforebegin",panel);
 status=byId("stone-fx-info");
 emaStrip=document.createElement("div");emaStrip.className="stone-ema-live";emaStrip.id="stone-ema-live";
 emaStrip.innerHTML=[
 '<b>EMAs <span id="stone-ema-tf">—</span></b>',
 '<span class="stone-ema-blue">EMA20 <strong id="stone-ema-20">—</strong></span>',
 '<span class="stone-ema-amber">EMA50 <strong id="stone-ema-50">—</strong></span>',
 '<span class="stone-ema-purple">EMA200 <strong id="stone-ema-200">—</strong></span>'
 ].join("");
 shell.insertAdjacentElement("beforebegin",emaStrip);
 panel.addEventListener("click",ev=>{
  const mode=ev.target.closest("[data-fx-mode]")?.dataset.fxMode;
  if(mode){settings.mode=mode;save();sync();info("Modus "+mode.toUpperCase());return;}
  const test=ev.target.closest("[data-fx-test]")?.dataset.fxTest;
  if(test){
   const mode=test==="chaos"?"ritual":undefined;
   flash(test==="profit"?"profit":"trade",{demo:true,profit:test==="profit"?125:undefined,previewMode:mode});
   if(test==="chaos")info("Demo: Chaos-Test mit maximalen Effekten.");
  }
 });
 panel.addEventListener("input",ev=>{
  if(ev.target.id==="fx-strength"){settings.strength=Number(ev.target.value);save();sync();}
 });
 panel.addEventListener("change",ev=>{
  const t=ev.target;
  if(t.id==="fx-ontrade")settings.trade=t.checked;
  if(t.id==="fx-onprofit")settings.profit=t.checked;
  if(t.id==="fx-onema")settings.showEma=t.checked;
  save();sync();
 });
 updateEMAs(emaState);sync();
}
if(document.readyState==="complete")boot();
else window.addEventListener("load",boot,{once:true});
window.StoneCelebration=Object.freeze({
 observeTrades,updateEMAs,clearEMAs,applyChartSettings:configureFX,test:(kind)=>flash(kind,{demo:true}),
 configure:(patch)=>{settings={...settings,...patch};if(!modes.includes(settings.mode))settings.mode="off";save();sync();},
 settings:()=>({...settings})
});
})();

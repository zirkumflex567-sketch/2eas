/* Stone Ritual: UI-only celebration controller, no trade actions. */
(()=>{
"use strict";
const key="two_eas_ritual_settings_v1";
const defaults={mode:"mystic",strength:3,trade:true,profit:true,sl:true,sound:true,showEma:false,expanded:false};
const modes=["off","mystic","chaos","ritual"];
let settings={...defaults};
try {const s=JSON.parse(localStorage.getItem(key)||"null");
 if(s&&typeof s==="object")settings={...settings,...s};} catch(_){}
if(!modes.includes(settings.mode))settings.mode="mystic";
settings.strength=Math.max(1,Math.min(5,Number(settings.strength)||3));
const seen=new Map(), motion=window.matchMedia?.("(prefers-reduced-motion: reduce)")||{matches:false};
const byId=id=>document.getElementById(id);
let panel=null,toggle=null,soundToggle=null,emaStrip=null,status=null,emaState=null,renderedSig="";
const save=()=>{try{localStorage.setItem(key,JSON.stringify(settings));}catch(_){}};

/* Arcade Audio Synthesizer: 100% Web Audio API, Zero Latency, Offline */
const ArcadeAudio=(()=>{
 let ctx=null;
 function getContext(){
  if(!ctx){
   const A=window.AudioContext||window.webkitAudioContext;
   if(A)ctx=new A();
  }
  if(ctx&&ctx.state==="suspended")ctx.resume().catch(()=>{});
  return ctx;
 }
 function unlock(){const c=getContext();if(c&&c.state==="suspended")c.resume().catch(()=>{});}
 if(typeof window!=="undefined"){
  ["click","keydown","touchstart","pointerdown"].forEach(e=>{
   window.addEventListener(e,unlock,{once:true,passive:true});
  });
 }
 function playTradeSound(){
  if(!settings.sound)return;
  try{
   const c=getContext();if(!c)return;
   const t0=c.currentTime+0.01;
   const o1=c.createOscillator(),g1=c.createGain();
   o1.type="sine";o1.frequency.setValueAtTime(987.77,t0);o1.frequency.setValueAtTime(1318.51,t0+0.07);
   g1.gain.setValueAtTime(0.001,t0);g1.gain.exponentialRampToValueAtTime(0.24,t0+0.015);g1.gain.exponentialRampToValueAtTime(0.001,t0+0.28);
   o1.connect(g1);g1.connect(c.destination);o1.start(t0);o1.stop(t0+0.29);
   const o2=c.createOscillator(),flt=c.createBiquadFilter(),g2=c.createGain();
   o2.type="triangle";flt.type="lowpass";flt.frequency.setValueAtTime(2200,t0);
   o2.frequency.setValueAtTime(440,t0);o2.frequency.exponentialRampToValueAtTime(880,t0+0.12);
   g2.gain.setValueAtTime(0.001,t0);g2.gain.linearRampToValueAtTime(0.18,t0+0.02);g2.gain.exponentialRampToValueAtTime(0.001,t0+0.22);
   o2.connect(flt);flt.connect(g2);g2.connect(c.destination);o2.start(t0);o2.stop(t0+0.23);
  }catch(_){}
 }
 function playWinSound(){
  if(!settings.sound)return;
  try{
   const c=getContext();if(!c)return;
   const t0=c.currentTime+0.01;
   const notes=[523.25,659.25,783.99,1046.50,1318.51,1567.98];
   notes.forEach((freq,i)=>{
    const osc=c.createOscillator(),g=c.createGain(),st=t0+i*0.07;
    osc.type="triangle";osc.frequency.setValueAtTime(freq,st);
    g.gain.setValueAtTime(0.001,st);g.gain.exponentialRampToValueAtTime(0.22,st+0.01);g.gain.exponentialRampToValueAtTime(0.001,st+0.24);
    osc.connect(g);g.connect(c.destination);osc.start(st);osc.stop(st+0.25);
   });
   const coinDts=[0.44,0.53,0.62,0.72,0.83];
   const coinP=[2093.0,2637.0,2093.0,3136.0,2637.0];
   coinDts.forEach((dt,i)=>{
    const osc=c.createOscillator(),g=c.createGain(),st=t0+dt;
    osc.type="sine";osc.frequency.setValueAtTime(coinP[i],st);
    g.gain.setValueAtTime(0.001,st);g.gain.exponentialRampToValueAtTime(0.20,st+0.008);g.gain.exponentialRampToValueAtTime(0.001,st+0.16);
    osc.connect(g);g.connect(c.destination);osc.start(st);osc.stop(st+0.17);
   });
  }catch(_){}
 }
 function playSlSound(){
  if(!settings.sound)return;
  try{
   const c=getContext();if(!c)return;
   const t0=c.currentTime+0.01;
   const steps=[{freq:349.23,dur:0.10},{freq:293.66,dur:0.10},{freq:220.00,dur:0.12},{freq:146.83,dur:0.28}];
   let cur=t0;
   steps.forEach(st=>{
    const osc=c.createOscillator(),g=c.createGain();
    osc.type="sawtooth";osc.frequency.setValueAtTime(st.freq,cur);
    g.gain.setValueAtTime(0.001,cur);g.gain.exponentialRampToValueAtTime(0.22,cur+0.01);g.gain.exponentialRampToValueAtTime(0.001,cur+st.dur);
    osc.connect(g);g.connect(c.destination);osc.start(cur);osc.stop(cur+st.dur+0.01);
    cur+=st.dur;
   });
   try{
    const bufLen=Math.floor(c.sampleRate*0.35),buf=c.createBuffer(1,bufLen,c.sampleRate);
    const data=buf.getChannelData(0);
    for(let i=0;i<bufLen;i++)data[i]=(Math.random()*2-1)*Math.exp(-i/(c.sampleRate*0.07));
    const noise=c.createBufferSource();noise.buffer=buf;
    const flt=c.createBiquadFilter();flt.type="lowpass";flt.frequency.setValueAtTime(900,t0);flt.frequency.linearRampToValueAtTime(140,t0+0.35);
    const gn=c.createGain();gn.gain.setValueAtTime(0.18,t0);gn.gain.exponentialRampToValueAtTime(0.001,t0+0.35);
    noise.connect(flt);flt.connect(gn);gn.connect(c.destination);noise.start(t0);noise.stop(t0+0.36);
   }catch(_){}
  }catch(_){}
 }
 return {playTradeSound,playWinSound,playSlSound,unlock};
})();
function allowed(){return settings.mode!=="off"&&!motion.matches&&!document.hidden&&document.body.classList.contains("theme-stone");}
function configureFX(){
  document.body.classList.toggle("stone-fx-off",settings.mode==="off");
  try{window.StoneChartFX?.configure({enabled:settings.mode!=="off",ambient:settings.mode!=="off"});}catch(_){}
}
function info(s){if(status)status.textContent=s;}
function collectActiveMAs(values){
 const beta=window.ChartStudioBeta?.getLiveMAs?.();
 const avgApi=window.ChartStudioAverages;
 const customAverages=avgApi?.getLiveAverages?avgApi.getLiveAverages():[];
 const items=[];
 const seen=new Set();

 const baseDefs=[
  {key:"ema20",type:"EMA",period:20,label:"EMA20",colorClass:"stone-ema-blue",color:"#50dbfd",id:"stone-ema-20"},
  {key:"ema50",type:"EMA",period:50,label:"EMA50",colorClass:"stone-ema-amber",color:"#ffc078",id:"stone-ema-50"},
  {key:"ema200",type:"EMA",period:200,label:"EMA200",colorClass:"stone-ema-purple",color:"#be9aff",id:"stone-ema-200"}
 ];

 for(const def of baseDefs){
  const isVisible=beta?(beta.opts?.[def.key]!==false):true;
  if(!isVisible)continue;
  const val=values?.[def.key]!==undefined?values[def.key]:(emaState?.[def.key]!==undefined?emaState[def.key]:null);
  items.push({
   id:def.id,
   type:def.type,
   period:def.period,
   label:def.label,
   colorClass:def.colorClass,
   color:def.color,
   value:val
  });
  seen.add(def.type+":"+def.period);
 }

 if(beta&&Array.isArray(beta.extras)){
  for(const ext of beta.extras){
   if(!ext||ext.visible===false)continue;
   const sig=(ext.type||"SMA")+":"+ext.period;
   if(seen.has(sig))continue;
   seen.add(sig);
   items.push({
    id:"stone-ma-"+(ext.id||sig),
    type:ext.type||"SMA",
    period:ext.period,
    label:ext.label||(ext.type+ext.period),
    color:ext.color||"#76e9a8",
    value:ext.value
   });
  }
 }

 if(Array.isArray(customAverages)){
  for(const ma of customAverages){
   if(!ma||ma.visible===false)continue;
   const sig=(ma.type||"EMA")+":"+ma.period;
   const isBaseDup=(!ma.source||ma.source==="close")&&(!ma.label||ma.label.trim()===""||ma.label.trim()===(ma.type+ma.period))&&seen.has(sig);
   if(isBaseDup)continue;
   seen.add(sig);
   items.push({
    id:"stone-ma-"+(ma.id||sig),
    type:ma.type||"EMA",
    period:ma.period,
    label:(ma.label&&ma.label.trim())||(ma.type+ma.period),
    color:ma.color||"#68dfff",
    value:ma.value
   });
  }
 }

 items.sort((a,b)=>{
  const pa=Number.isFinite(a.period)?a.period:9999;
  const pb=Number.isFinite(b.period)?b.period:9999;
  if(pa!==pb)return pa-pb;
  return (a.type||"").localeCompare(b.type||"");
 });

 return items;
}
function renderEmaStrip(items,tf){
 if(!emaStrip)return;
 const fmt=n=>n!==null&&n!==undefined&&Number.isFinite(Number(n))?Number(n).toFixed(2):"—";
 const allEma=items.length>0&&items.every(it=>(it.type||"EMA").toUpperCase()==="EMA");
 const badgeText=allEma?"EMAs":"MAs";
 const currentSig=items.map(it=>it.id+":"+it.label+":"+(it.color||"")+":"+(it.colorClass||"")).join("|")+"::"+badgeText;

 if(currentSig!==renderedSig){
  renderedSig=currentSig;
  emaStrip.replaceChildren();
  const titleB=document.createElement("b");
  titleB.textContent=badgeText+" ";
  const tfSpan=document.createElement("span");
  tfSpan.id="stone-ema-tf";
  tfSpan.textContent=tf||"—";
  titleB.append(tfSpan);
  emaStrip.append(titleB);

  for(const it of items){
   const span=document.createElement("span");
   if(it.colorClass)span.className=it.colorClass;
   if(it.color)span.style.color=it.color;
   span.textContent=it.label+" ";
   const strong=document.createElement("strong");
   strong.id=it.id;
   strong.textContent=fmt(it.value);
   span.append(strong);
   emaStrip.append(span);
  }
 }else{
  const tfSpan=byId("stone-ema-tf");
  if(tfSpan&&tf!==undefined)tfSpan.textContent=tf||"—";
  for(const it of items){
   const strong=byId(it.id);
   if(strong)strong.textContent=fmt(it.value);
  }
 }
}
function updateEMAs(values){
 if(values&&typeof values==="object")emaState={...(emaState||{}),...values};
 if(!emaStrip)return;
 const tf=values?.timeframe||emaState?.timeframe||"—";
 const items=collectActiveMAs(emaState);
 renderEmaStrip(items,tf);
}
function clearEMAs(){
 emaState={timeframe:"—",ema20:null,ema50:null,ema200:null};
 renderedSig="";
 updateEMAs(emaState);
}
function sync(){
 if(!panel)return;
 panel.hidden=!settings.expanded;
 toggle.setAttribute("aria-expanded",String(settings.expanded));
 toggle.textContent=settings.expanded?"✦ FX schließen":"✧ Chart-FX";
 if(soundToggle){
  soundToggle.textContent=settings.sound?"🔊 Sound: AN":"🔇 Sound: AUS";
  soundToggle.classList.toggle("sound-off",!settings.sound);
  soundToggle.title=settings.sound?"Arcade-Sounds aktivieren/deaktivieren (aktuell AN)":"Arcade-Sounds aktivieren/deaktivieren (aktuell AUS)";
 }
 panel.querySelectorAll("[data-fx-mode]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.fxMode===settings.mode)));
 for(const [id,k] of [["fx-ontrade","trade"],["fx-onprofit","profit"],["fx-onsl","sl"],["fx-onsound","sound"],["fx-onema","showEma"]]){
  const el=byId(id);if(el)el.checked=!!settings[k];
 }
 const range=byId("fx-strength");if(range)range.value=String(settings.strength);
 const power=byId("fx-power");if(power)power.textContent=settings.strength+"/5";
 if(emaStrip)emaStrip.hidden=!settings.showEma;
 configureFX();
}
function flash(kind,options={}){
 if(settings.sound){
  if(kind==="profit")ArcadeAudio.playWinSound();
  else if(kind==="sl"||kind==="chaos"||kind==="loss")ArcadeAudio.playSlSound();
  else if(kind==="trade")ArcadeAudio.playTradeSound();
 }
 if(!allowed()){info(motion.matches?"Bewegungsreduktion aktiv.":settings.mode==="off"?"FX deaktiviert.":"FX nur im STEIN-Design.");return false;}
 const profit=kind==="profit",sl=kind==="sl"||kind==="chaos"||kind==="loss",demo=!!options.demo;
 const visualMode=options.previewMode||(sl?"chaos":settings.mode);
 const multi=visualMode==="ritual"?1.55:visualMode==="chaos"?1.25:.85;
 const duration=Math.round((profit?6500:sl?4200:2800)*multi*(.78+.1*settings.strength));
 const count=Math.min(72,Math.round((profit?43:sl?35:20)*multi*(.55+.18*settings.strength)));
 const palette=profit?["#ffbb3e","#ffe8a0","#63ffd1","#ba91ff"]:sl?["#ff3344","#ff6b6b","#ff1744","#ffa726"]:["#3ce9ff","#ffbd7b","#b397ff"];
 const chart=byId("tv-chart")?.closest(".glass-card");
 const targets=[chart,document.querySelector(".stone-asset-panel--volume"),
  document.querySelector(".stone-asset-panel--diagnostic"),document.querySelector(".stone-asset-panel--matrix"),
  document.querySelector(".stone-asset-panel--positions"),document.querySelector(".stone-asset-panel--journal"),
  document.querySelector("header.glass-card"),...Array.from(document.querySelectorAll(".stone-target-row")).slice(0,8)].filter(Boolean);
 if(!targets.length)return false;
 try{window.StoneChartFX?.trigger(kind,settings.strength);}catch(_){}
 if(sl&&chart){
  chart.classList.remove("stone-chaos-shake");
  void chart.offsetWidth;
  chart.classList.add("stone-chaos-shake");
  setTimeout(()=>chart.classList.remove("stone-chaos-shake"),600);
 }
 for(let i=0;i<count;i++){
  const host=targets[Math.floor(Math.random()*targets.length)];
  const color=palette[Math.floor(Math.random()*palette.length)],delay=Math.random()*duration*.78;
  const durationOne=profit?600+Math.random()*950:sl?400+Math.random()*800:300+Math.random()*720;
  if(host.animate)host.animate([
   {filter:"brightness(1)",boxShadow:"0 0 0 transparent"},
   {filter:profit?"brightness(1.65)":sl?"brightness(1.5)":"brightness(1.35)",boxShadow:"0 0 "+(profit?38:sl?32:22)+"px "+color},
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
 toast.className="stone-event-toast"+(profit?" stone-event-toast--profit":sl?" stone-event-toast--sl":"");
 toast.setAttribute("role","status");
 const lossAmount=sl&&Number.isFinite(Number(options.profit))?" -$"+Math.abs(Number(options.profit)).toFixed(2):"";
 const winAmount=profit&&Number.isFinite(Number(options.profit))?" +$"+Number(options.profit).toFixed(2):"";
 toast.textContent=(demo?"DEMO · ":"")+(profit?"✦ GEWINN REALISIERT ✦"+winAmount:sl?"💥 STOP-LOSS / CHAOS 💥"+lossAmount:"⚡ TRADE BESTÄTIGT");
 host.append(toast);setTimeout(()=>toast.remove(),duration);
 info((demo?"Demo: ":"")+(profit?"Gewinn-Eskalation":sl?"Stop-Loss Chaos-Impuls":"Trade-Impuls")+" gestartet.");
 return true;
}
function observeTrades(accountId,journal=[],positions=[]){
 if(!accountId)return;
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
  if(kind==="CLOSED"&&net<0&&settings.sl!==false)candidates.push({kind:"sl",profit:net,ts});
  if(kind==="OPEN"&&settings.trade)candidates.push({kind:"trade",ts});
 }
 acc.initialized=true;
 if(acc.keys.size>3000)acc.keys=new Set([...acc.keys].slice(-1500));
 const rank=k=>k==="profit"?3:k==="sl"?2:1;
 const winner=candidates.sort((a,b)=>rank(b.kind)-rank(a.kind)||b.ts-a.ts)[0];
 if(winner)flash(winner.kind,{profit:winner.profit});
}
function boot(){
 const chart=byId("tv-chart"),shell=chart?.parentElement,card=chart?.closest(".glass-card");
 if(!shell||!card||byId("stone-fx-panel"))return;
 toggle=document.createElement("button");toggle.type="button";toggle.id="stone-fx-toggle";
 toggle.className="stone-fx-toggle";toggle.setAttribute("aria-controls","stone-fx-panel");

 soundToggle=document.createElement("button");soundToggle.type="button";soundToggle.id="stone-sound-toggle";
 soundToggle.className="stone-fx-toggle";
 soundToggle.addEventListener("click",()=>{
  settings.sound=!settings.sound;
  save();sync();
  if(settings.sound)ArcadeAudio.playTradeSound();
  info("Arcade-Sounds "+(settings.sound?"AKTIVIERT (Spielautomat)":"DEAKTIVIERT"));
 });

 const expand=byId("stone-chart-expand-btn");
 if(expand){
  expand.insertAdjacentElement("afterend",soundToggle);
  soundToggle.insertAdjacentElement("afterend",toggle);
 } else {
  card.prepend(toggle);
  card.prepend(soundToggle);
 }

 toggle.addEventListener("click",()=>{settings.expanded=!settings.expanded;save();sync();});
 panel=document.createElement("section");panel.id="stone-fx-panel";panel.className="stone-fx-panel";
 panel.setAttribute("aria-label","Mythische Chart-Effekte");
 panel.innerHTML=[
 '<div class="stone-fx-head"><strong>✧ MYTHIC FX & ARCADE SOUNDS</strong><span>Visuell & Audio · Keine Orders</span></div>',
 '<div class="stone-fx-modes" role="group" aria-label="Effektmodus">',
 '<button type="button" data-fx-mode="off">Aus</button>',
 '<button type="button" data-fx-mode="mystic">Mystisch</button>',
 '<button type="button" data-fx-mode="chaos">Chaos</button>',
 '<button type="button" data-fx-mode="ritual">Eskalation</button></div>',
 '<div class="stone-fx-controls">',
 '<label>Stärke <input id="fx-strength" type="range" min="1" max="5" step="1"/><b id="fx-power">3/5</b></label>',
 '<label><input id="fx-onsound" type="checkbox"/> 🔊 Arcade-Sounds</label>',
 '<label><input id="fx-ontrade" type="checkbox"/> Bestätigter Trade</label>',
 '<label><input id="fx-onprofit" type="checkbox"/> Realisierter Gewinn</label>',
 '<label><input id="fx-onsl" type="checkbox"/> 💥 Stop-Loss Chaos</label>',
 '<label><input id="fx-onema" type="checkbox"/> EMA-Werte anzeigen</label></div>',
 '<div class="stone-fx-tests">',
 '<button type="button" data-fx-test="trade">⚡ Trade testen</button>',
 '<button type="button" data-fx-test="profit">✦ Gewinn testen</button>',
 '<button type="button" data-fx-test="chaos">✧ Chaos / SL testen</button></div>',
 '<p id="stone-fx-info" role="status" aria-live="polite">Tests lösen niemals Orders aus.</p>'
 ].join("");
 shell.insertAdjacentElement("beforebegin",panel);
 status=byId("stone-fx-info");
 emaStrip=document.createElement("div");emaStrip.className="stone-ema-live";emaStrip.id="stone-ema-live";
 shell.insertAdjacentElement("beforebegin",emaStrip);
 panel.addEventListener("click",ev=>{
  const mode=ev.target.closest("[data-fx-mode]")?.dataset.fxMode;
  if(mode){settings.mode=mode;save();sync();info("Modus "+mode.toUpperCase());return;}
  const test=ev.target.closest("[data-fx-test]")?.dataset.fxTest;
  if(test){
   if(test==="chaos"){
    flash("sl",{demo:true,profit:-50,previewMode:"chaos"});
    info("Demo: Chaos / Stop-Loss Test mit Sound & Effekten.");
   } else {
    flash(test==="profit"?"profit":"trade",{demo:true,profit:test==="profit"?125:undefined});
   }
  }
 });
 panel.addEventListener("input",ev=>{
  if(ev.target.id==="fx-strength"){settings.strength=Number(ev.target.value);save();sync();}
 });
 panel.addEventListener("change",ev=>{
  const t=ev.target;
  if(t.id==="fx-ontrade")settings.trade=t.checked;
  if(t.id==="fx-onprofit")settings.profit=t.checked;
  if(t.id==="fx-onsl")settings.sl=t.checked;
  if(t.id==="fx-onsound")settings.sound=t.checked;
  if(t.id==="fx-onema")settings.showEma=t.checked;
  save();sync();
 });
 updateEMAs(emaState);sync();
}
if(document.readyState==="complete")boot();
else window.addEventListener("load",boot,{once:true});
window.StoneCelebration=Object.freeze({
 observeTrades,updateEMAs,clearEMAs,refresh:()=>updateEMAs(emaState),applyChartSettings:configureFX,
 test:(kind)=>flash(kind==="chaos"||kind==="sl"?"sl":kind,{demo:true,profit:kind==="profit"?125:kind==="sl"||kind==="chaos"?-50:undefined,previewMode:kind==="chaos"?"chaos":undefined}),
 configure:(patch)=>{settings={...settings,...patch};if(!modes.includes(settings.mode))settings.mode="off";save();sync();},
 settings:()=>({...settings}),
 audio:ArcadeAudio
});
})();

(function(){
 "use strict";
 const kinds=Object.freeze({supertrend:["period","multiplier"],sar:["step","maxStep"],donchian:["period"],keltner:["period","atrPeriod","multiplier"],atrBands:["period","atrPeriod","multiplier"],linearRegression:["period","multiplier"],ichimoku:["tenkanPeriod","kijunPeriod","senkouBPeriod","displacement"],vwap:["timeZone","sessionStart"]});
 const exactScope=value=>!!value&&typeof value==="object"&&typeof value.account==="string"&&/^[a-zA-Z0-9_-]{1,50}$/.test(value.account)&&typeof value.symbol==="string"&&/^[A-Za-z0-9][A-Za-z0-9_.#/+:-]{0,31}$/.test(value.symbol)&&typeof value.timeframe==="string"&&/^(M1|M5|M15|M30|H1|H4|D1|W1|MN1)$/.test(value.timeframe);
 const sameScope=(left,right)=>exactScope(left)&&exactScope(right)&&left.account===right.account&&left.symbol===right.symbol&&left.timeframe===right.timeframe;
 function normalize(settings){
  if(!settings||typeof settings!=="object"||Array.isArray(settings))throw Error("INVALID_SETTINGS");
  const configs=[];
  for(const kind of Object.keys(kinds)){
   const source=settings[kind];if(!source||typeof source!=="object"||Array.isArray(source)||typeof source.enabled!=="boolean")throw Error("INVALID_SETTINGS");
   if(!source.enabled)continue;
   const mapped={};for(const key of kinds[kind])mapped[key]=source[key];
   for(const [key,value] of Object.entries(mapped))if(typeof value==="number"&&!Number.isFinite(value))throw Error("INVALID_SETTINGS");
   const periods=kind==="ichimoku"?["tenkanPeriod","kijunPeriod","senkouBPeriod"]:kind==="sar"?[]:["period",...(kind==="keltner"||kind==="atrBands"?["atrPeriod"]:[])];
   if(periods.some(key=>!Number.isInteger(mapped[key])||mapped[key]<2||mapped[key]>200))throw Error("INVALID_SETTINGS");
   if(kind==="ichimoku"&&(!Number.isInteger(mapped.displacement)||mapped.displacement<0||mapped.displacement>200))throw Error("INVALID_SETTINGS");
   if(kind==="sar"&&(!Number.isFinite(mapped.step)||!Number.isFinite(mapped.maxStep)||mapped.step<.01||mapped.step>.1||mapped.maxStep<mapped.step||mapped.maxStep>.5||Math.abs(mapped.step*100-Math.round(mapped.step*100))>1e-8||Math.abs(mapped.maxStep*100-Math.round(mapped.maxStep*100))>1e-8))throw Error("INVALID_SETTINGS");
   if(["supertrend","keltner","atrBands","linearRegression"].includes(kind)&&(!Number.isFinite(mapped.multiplier)||mapped.multiplier<.1||mapped.multiplier>10||Math.abs(mapped.multiplier*10-Math.round(mapped.multiplier*10))>1e-8))throw Error("INVALID_SETTINGS");
   if(kind==="vwap"){
    if(typeof mapped.timeZone!=="string"||typeof mapped.sessionStart!=="string"||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(mapped.sessionStart))throw Error("INVALID_SETTINGS");
    try{new Intl.DateTimeFormat("en-US",{timeZone:mapped.timeZone})}catch(_){throw Error("INVALID_SETTINGS")}
   }
   configs.push({kind,settings:mapped});
  }
  return configs;
 }
 function create(engine,scope){
  if(!engine||typeof engine.setTransientOverlays!=="function"||typeof engine.clearTransientOverlays!=="function"||!exactScope(scope))throw Error("INVALID_OVERLAY_FEED");
  let current={...scope},generation=1,sequence=0,latest=0;
  const clear=()=>{engine.clearTransientOverlays();return true};
  return Object.freeze({
   beginRead(){latest=++sequence;return Object.freeze({generation,sequence:latest})},
   update(envelope,token){
    if(!token||token.generation!==generation||token.sequence!==latest)return {applied:false,reason:"STALE_REQUEST"};
    if(!envelope||!sameScope(envelope.scope,current)){clear();return {applied:false,reason:"SCOPE_MISMATCH"}}
    if(envelope.source!=="CHART_STUDIO_LOCAL"||envelope.canExecute!==false){clear();return {applied:false,reason:"UNVERIFIED_SOURCE"}}
    try{const configs=normalize(envelope.settings),result=engine.setTransientOverlays(configs);if(!result?.applied){clear();return {applied:false,reason:result?.reason||"ENGINE_REJECTED"}}return {applied:true,count:result.count,kinds:configs.map(item=>item.kind)}}
    catch(_){clear();return {applied:false,reason:"INVALID_SETTINGS"}}
   },
   setScope(next){if(!exactScope(next))return false;if(sameScope(next,current))return true;clear();current={...next};generation++;sequence=0;latest=0;return true},
   clear,
   inspect(){return {scope:{...current},generation,latestSequence:latest}}
  });
 }
 window.ChartStudioV5OverlayFeed=Object.freeze({create,validScope:exactScope});
})();

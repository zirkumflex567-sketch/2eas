/* Local, read-only synchronization of the active Chart Studio oscillator
   editors into the opt-in v5 preview. No network, storage or trading surface. */
(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.ChartStudioV5OscillatorFeed=api;
})(typeof globalThis==="object"?globalThis:this,function(){
  "use strict";
  const TIMEFRAMES=new Set(["M1","M5","M15","M30","H1","H4","D1","W1"]);
  const ACCOUNT=/^[a-z0-9_-]{1,32}$/;
  const SYMBOL=/^[A-Za-z0-9][A-Za-z0-9_.#/+:-]{0,31}$/;
  const ID=/^[A-Za-z0-9_-]{1,32}$/;
  const COLOR=/^#[0-9a-fA-F]{6}$/;
  const CATALOG=Object.freeze({
    rsi:{keys:["period"],color:"#e9bb72",title:"RSI"},
    atr:{keys:["period"],color:"#a68eff",title:"ATR"},
    macd:{keys:["fast","slow","signal"],color:"#55d7ee",title:"MACD"},
    adx:{keys:["period"],color:"#e9bc72",title:"ADX"},
    stochastic:{keys:["period","smoothK","smoothD"],color:"#55d7ee",title:"Stochastic %K/%D"},
    stochrsi:{keys:["period","stochPeriod","smoothK","smoothD"],color:"#55d7ee",title:"StochRSI %K/%D"},
    cci:{keys:["period"],color:"#a995ff",title:"CCI"},
    momentum:{keys:["period"],color:"#55d7ee",title:"Momentum"},
    roc:{keys:["period"],color:"#f3c56a",title:"ROC (%)"},
    obv:{keys:[],color:"#55deaa",title:"OBV · Broker-Volumen"},
    mfi:{keys:["period"],color:"#e9bc72",title:"MFI · Volumenproxy"}
  });
  const COLORS=Object.freeze({rsi:"#e9bb72",atr:"#a68eff",macd:"#55d7ee",adx:"#e9bc72",
    stochastic:"#55d7ee",stochrsi:"#55d7ee",cci:"#a995ff",momentum:"#55d7ee",roc:"#f3c56a",obv:"#55deaa",mfi:"#e9bc72"});
  const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
  const exactKeys=(value,keys)=>Object.keys(value).sort().join(",")===[...keys].sort().join(",");
  function validScope(value){return !!value&&typeof value==="object"&&!Array.isArray(value)&&
    ACCOUNT.test(value.account||"")&&SYMBOL.test(value.symbol||"")&&TIMEFRAMES.has(value.timeframe)}
  function sameScope(a,b){return a.account===b.account&&a.symbol===b.symbol&&a.timeframe===b.timeframe}
  function validSettings(kind,raw){
    const spec=CATALOG[kind];if(!spec||!raw||typeof raw!=="object"||Array.isArray(raw)||raw.enabled!==true||!exactKeys(raw,["enabled",...spec.keys]))return null;
    const settings={};
    for(const key of spec.keys){
      const value=raw[key],minimum=key==="smoothK"||key==="smoothD"?1:2,maximum=key==="slow"?300:key==="smoothK"||key==="smoothD"?100:200;
      if(!Number.isInteger(value)||value<minimum||value>maximum)return null;
      settings[key]=value;
    }
    if(kind==="macd"&&settings.fast>=settings.slow)return null;
    return settings;
  }
  function hashId(value){let hash=2166136261;for(let i=0;i<value.length;i++){hash^=value.charCodeAt(i);hash=Math.imul(hash,16777619)}return (hash>>>0).toString(36)}
  function normalizeSnapshot(snapshot){
    if(!snapshot||typeof snapshot!=="object"||Array.isArray(snapshot)||snapshot.source!=="CHART_STUDIO_LOCAL"||snapshot.canExecute!==false||
      !validScope(snapshot.scope)||snapshot.oscillatorAccount!==snapshot.scope.account||
      !snapshot.settings||typeof snapshot.settings!=="object"||Array.isArray(snapshot.settings)||!Array.isArray(snapshot.instances)||snapshot.instances.length>8)return null;
    const rows=[],ids=new Set();
    for(const kind of Object.keys(CATALOG)){
      const raw=snapshot.settings[kind];if(!raw||raw.enabled!==true)continue;
      const settings=validSettings(kind,raw);if(!settings)return null;
      rows.push({sourceId:"catalog-"+kind,nativeId:"preview-osc-c-"+kind,kind,settings,color:COLORS[kind],lineWidth:2,visible:true,title:CATALOG[kind].title});
    }
    for(const raw of snapshot.instances){
      if(!raw||typeof raw!=="object"||Array.isArray(raw)||typeof raw.kind!=="string"||!CATALOG[raw.kind])return null;
      const spec=CATALOG[raw.kind],keys=["id","kind","visible","color","lineWidth","label",...spec.keys];
      if(!exactKeys(raw,keys)||!ID.test(raw.id||"")||ids.has(raw.id)||typeof raw.visible!=="boolean"||!COLOR.test(raw.color||"")||
        !Number.isInteger(raw.lineWidth)||raw.lineWidth<1||raw.lineWidth>4||typeof raw.label!=="string"||raw.label.length>40||/[\u0000-\u001f\u007f]/.test(raw.label))return null;
      ids.add(raw.id);
      const rawSettings=Object.fromEntries(spec.keys.map(key=>[key,raw[key]]));
      const settings=validSettings(raw.kind,{enabled:true,...rawSettings});if(!settings)return null;
      rows.push({sourceId:"instance-"+raw.id,nativeId:"preview-osc-i-"+hashId(raw.id),kind:raw.kind,settings,
        color:raw.color.toLowerCase(),lineWidth:raw.lineWidth,visible:raw.visible,title:raw.label||raw.kind.toUpperCase()});
    }
    if(rows.length>8)return null;
    const nativeIds=new Set();for(const row of rows){if(row.nativeId.length>32||nativeIds.has(row.nativeId))return null;nativeIds.add(row.nativeId)}
    if(new Set(rows.map(row=>row.sourceId)).size!==rows.length)return null;
    return rows;
  }
  function create(engine,initialScope){
    if(!engine||typeof engine.addTransientOscillator!=="function"||typeof engine.removeTransientOscillator!=="function"||
      typeof engine.oscillatorOptions!=="function")throw new TypeError("transient v5 oscillator engine required");
    if(!validScope(initialScope))throw new TypeError("valid account/symbol/timeframe scope required");
    let scope={...initialScope},generation=1,sequence=0,latestSequence=0,status="EMPTY";
    const managed=new Map();
    function remove(sourceId){const current=managed.get(sourceId);if(!current)return;try{engine.removeTransientOscillator(current.nativeId)}catch(_){}managed.delete(sourceId)}
    function clear(){latestSequence=++sequence;for(const id of [...managed.keys()])remove(id);status="EMPTY"}
    function setScope(next){if(!validScope(next))throw new TypeError("valid account/symbol/timeframe scope required");if(sameScope(scope,next))return generation;
      clear();scope={...next};generation++;sequence=0;latestSequence=0;return generation}
    function beginRead(){latestSequence=++sequence;return Object.freeze({generation,sequence:latestSequence})}
    function update(snapshot,token){
      if(!token||token.generation!==generation)return {applied:false,reason:"STALE_SCOPE"};
      if(token.sequence!==latestSequence)return {applied:false,reason:"STALE_REQUEST"};
      if(!snapshot||snapshot.source!=="CHART_STUDIO_LOCAL"||snapshot.canExecute!==false){clear();return {applied:false,reason:"UNVERIFIED_SOURCE"};}
      if(!validScope(snapshot.scope)||!sameScope(snapshot.scope,scope)){clear();return {applied:false,reason:"SCOPE_MISMATCH"};}
      const rows=normalizeSnapshot(snapshot);if(!rows){clear();status="ERROR";return {applied:false,reason:"INVALID_CONFIGS"};}
      const desired=new Map(rows.map(row=>[row.sourceId,{row,signature:JSON.stringify(row)}]));
      try{
        for(const [id,current] of [...managed]){const next=desired.get(id);if(!next||next.signature!==current.signature)remove(id)}
        for(const [id,next] of desired){if(managed.has(id))continue;
          const {row}=next;engine.addTransientOscillator({id:row.nativeId,kind:row.kind,settings:{...row.settings},color:row.color,
            lineWidth:row.lineWidth,visible:row.visible,title:row.title});
          managed.set(id,{nativeId:row.nativeId,signature:next.signature});
        }
      }catch(_){clear();status="ERROR";return {applied:false,reason:"ENGINE_ERROR"};}
      status="READY";return {applied:true,count:managed.size};
    }
    function read(sourceId){const current=managed.get(sourceId);if(!current)return null;const value=engine.oscillatorOptions(current.nativeId);return value?{...value,settings:{...value.settings}}:null}
    function inspect(){return {scope:{...scope},generation,status,count:managed.size}}
    return Object.freeze({beginRead,setScope,update,clear,read,inspect});
  }
  return Object.freeze({create,validScope,normalizeSnapshot});
});

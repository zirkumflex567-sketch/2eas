/* Local, read-only synchronization of the production custom-MA editor into
   the opt-in native v5 preview. It has no network or persistence surface. */
(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.ChartStudioV5IndicatorFeed=api;
})(typeof globalThis==="object"?globalThis:this,function(){
  "use strict";
  const TIMEFRAMES=new Set(["M1","M5","M15","M30","H1","H4","D1","W1"]);
  const TYPES=new Set(["EMA","SMA","WMA","RMA","SMMA"]);
  const SOURCES=new Set(["close","open","high","low","hl2","hlc3","ohlc4"]);
  const COLOR=/^#[0-9a-fA-F]{6}$/;
  const ID=/^[A-Za-z0-9_-]{1,32}$/;
  const ACCOUNT=/^[a-z0-9_-]{1,32}$/;
  const SYMBOL=/^[A-Za-z0-9][A-Za-z0-9_.#/+:-]{0,31}$/;
  const KEYS="color,displayShift,id,label,lineWidth,period,source,type,visible";

  function validScope(value){
    return !!value&&typeof value==="object"&&!Array.isArray(value)&&
      ACCOUNT.test(value.account||"")&&SYMBOL.test(value.symbol||"")&&TIMEFRAMES.has(value.timeframe);
  }
  function sameScope(left,right){return left.account===right.account&&left.symbol===right.symbol&&left.timeframe===right.timeframe;}
  function normalizeConfigs(value){
    if(!Array.isArray(value)||value.length>16)return null;
    const ids=new Set(),result=[];
    for(const row of value){
      if(!row||typeof row!=="object"||Array.isArray(row)||Object.keys(row).sort().join(",")!==KEYS||
        !ID.test(row.id||"")||ids.has(row.id)||!TYPES.has(row.type)||!Number.isInteger(row.period)||row.period<1||row.period>1000||
        !SOURCES.has(row.source)||!COLOR.test(row.color||"")||!Number.isInteger(row.lineWidth)||row.lineWidth<1||row.lineWidth>4||
        typeof row.visible!=="boolean"||typeof row.label!=="string"||row.label.length>40||/[\u0000-\u001f\u007f]/.test(row.label)||
        !Number.isInteger(row.displayShift)||row.displayShift < -500||row.displayShift>500)return null;
      ids.add(row.id);
      result.push({id:row.id,type:row.type,period:row.period,source:row.source,color:row.color.toLowerCase(),
        lineWidth:row.lineWidth,visible:row.visible,label:row.label,displayShift:row.displayShift});
    }
    return result;
  }
  function nativeOptions(row){
    return {id:"preview-ma-"+row.id,type:row.type,period:row.period,source:row.source,color:row.color,
      lineWidth:row.lineWidth,visible:row.visible,title:row.label||`${row.type} ${row.period} · ${row.source}`,
      displayShift:row.displayShift};
  }
  function create(engine,initialScope){
    if(!engine||typeof engine.addTransientMovingAverage!=="function"||typeof engine.removeAverage!=="function"||
      typeof engine.movingAverageOptions!=="function")throw new TypeError("managed v5 moving-average engine required");
    if(!validScope(initialScope))throw new TypeError("valid account/symbol/timeframe scope required");
    let scope={account:initialScope.account,symbol:initialScope.symbol,timeframe:initialScope.timeframe};
    let generation=1,sequence=0,latestSequence=0,status="EMPTY";
    const managed=new Map();
    function remove(id){try{engine.removeAverage(id)}catch(_){}managed.delete(id)}
    function clear(){
      latestSequence=++sequence;
      for(const id of [...managed.keys()])remove(id);
      status="EMPTY";
    }
    function setScope(next){
      if(!validScope(next))throw new TypeError("valid account/symbol/timeframe scope required");
      if(sameScope(scope,next))return generation;
      clear();scope={account:next.account,symbol:next.symbol,timeframe:next.timeframe};
      generation++;sequence=0;latestSequence=0;
      return generation;
    }
    function beginRead(){latestSequence=++sequence;return Object.freeze({generation,sequence:latestSequence});}
    function update(snapshot,token){
      if(!token||token.generation!==generation)return {applied:false,reason:"STALE_SCOPE"};
      if(token.sequence!==latestSequence)return {applied:false,reason:"STALE_REQUEST"};
      if(!snapshot||snapshot.source!=="CHART_STUDIO_LOCAL"||snapshot.canExecute!==false){clear();return {applied:false,reason:"UNVERIFIED_SOURCE"};}
      if(snapshot.account!==scope.account||snapshot.symbol!==scope.symbol||snapshot.timeframe!==scope.timeframe)
        return {applied:false,reason:"SCOPE_MISMATCH"};
      const configs=normalizeConfigs(snapshot.configs);
      if(!configs){clear();status="ERROR";return {applied:false,reason:"INVALID_CONFIGS"};}
      const desired=new Map(configs.map(row=>["preview-ma-"+row.id,{row,signature:JSON.stringify(row)}]));
      try{
        for(const [id,current] of [...managed]){
          const next=desired.get(id);
          if(!next||next.signature!==current.signature)remove(id);
        }
        for(const [id,next] of desired){
          if(managed.has(id))continue;
          const options=nativeOptions(next.row);
          engine.addTransientMovingAverage(options);
          managed.set(id,{signature:next.signature});
        }
      }catch(_){clear();status="ERROR";return {applied:false,reason:"ENGINE_ERROR"};}
      status="READY";
      return {applied:true,count:managed.size};
    }
    function inspect(){return {scope:{...scope},generation,status,count:managed.size};}
    return Object.freeze({beginRead,setScope,update,clear,inspect});
  }
  return Object.freeze({create,validScope,normalizeConfigs});
});

/* Strict read-only contract between the dashboard candle response and an
   independently mounted native v5 renderer. This module never fetches or
   persists data and has no order/position mutation surface. */
(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.ChartStudioV5Feed=api;
})(typeof globalThis==="object"?globalThis:this,function(){
  "use strict";
  const MAX_CANDLES=5000;
  const TIMEFRAMES=new Set(["M1","M5","M15","M30","H1","H4","D1","W1","MN1"]);
  const ACCOUNT=/^[a-z0-9_-]{1,32}$/;
  const SYMBOL=/^[A-Za-z0-9][A-Za-z0-9_.#/+:-]{0,31}$/;

  function validScope(value){
    return !!value&&typeof value==="object"&&!Array.isArray(value)&&
      ACCOUNT.test(value.account||"")&&SYMBOL.test(value.symbol||"")&&TIMEFRAMES.has(value.timeframe);
  }
  function sameScope(a,b){return a.account===b.account&&a.symbol===b.symbol&&a.timeframe===b.timeframe;}
  function validCandles(value){
    if(!Array.isArray(value)||value.length<1||value.length>MAX_CANDLES)return false;
    let prior=0;
    for(const row of value){
      if(!row||typeof row!=="object"||Array.isArray(row)||!Number.isSafeInteger(row.time)||row.time<=prior)return false;
      const prices=[row.open,row.high,row.low,row.close];
      if(!prices.every(price=>typeof price==="number"&&Number.isFinite(price)&&price>0))return false;
      if(row.high<Math.max(row.open,row.close,row.low)||row.low>Math.min(row.open,row.close,row.high))return false;
      for(const key of ["tick_volume","real_volume"]){
        if(row[key]!==undefined&&(typeof row[key]!=="number"||!Number.isFinite(row[key])||row[key]<0))return false;
      }
      prior=row.time;
    }
    return true;
  }
  function create(engine,initialScope){
    if(!engine||typeof engine.setCandles!=="function")throw new TypeError("read-only candle engine required");
    if(!validScope(initialScope))throw new TypeError("valid account/symbol/timeframe scope required");
    let scope={account:initialScope.account,symbol:initialScope.symbol,timeframe:initialScope.timeframe};
    let generation=1,sequence=0,latestSequence=0,status="EMPTY",candleCount=0;
    function beginRead(){
      latestSequence=++sequence;
      return Object.freeze({generation,sequence:latestSequence});
    }
    function setScope(next){
      if(!validScope(next))throw new TypeError("valid account/symbol/timeframe scope required");
      if(sameScope(scope,next))return generation;
      scope={account:next.account,symbol:next.symbol,timeframe:next.timeframe};
      generation++;sequence=0;latestSequence=0;candleCount=0;status="EMPTY";
      engine.setCandles([]);
      return generation;
    }
    function clear(){
      latestSequence=++sequence;candleCount=0;status="EMPTY";
      engine.setCandles([]);
    }
    function update(envelope,request){
      if(!request||request.generation!==generation)return {applied:false,reason:"STALE_SCOPE"};
      if(request.sequence!==latestSequence)return {applied:false,reason:"STALE_REQUEST"};
      if(!envelope||envelope.source!=="MT5_VERIFIED"||envelope.canExecute!==false)
        return {applied:false,reason:"UNVERIFIED_SOURCE"};
      if(envelope.accountId!==scope.account||envelope.symbol!==scope.symbol||envelope.timeframe!==scope.timeframe)
        return {applied:false,reason:"SCOPE_MISMATCH"};
      if(!validCandles(envelope.candles))return {applied:false,reason:"INVALID_CANDLES"};
      const copy=envelope.candles.map(row=>({...row}));
      try{engine.setCandles(copy)}
      catch(_){status="ERROR";return {applied:false,reason:"ENGINE_ERROR"};}
      status="READY";candleCount=copy.length;
      return {applied:true,candleCount};
    }
    function inspect(){return {scope:{...scope},generation,status,candleCount};}
    return Object.freeze({beginRead,setScope,update,clear,inspect});
  }
  return Object.freeze({create,validScope,validCandles,MAX_CANDLES});
});

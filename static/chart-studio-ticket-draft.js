"use strict";
(function(root){
 const TYPES=new Set(["BUY_LIMIT","SELL_LIMIT","BUY_STOP","SELL_STOP"]);
 const FIELDS=new Set(["orderType","volumeLots","entryPrice","slPrice","tpPrice"]);
 const validScope=value=>value&&typeof value.account==="string"&&value.account.length>0&&
  typeof value.symbol==="string"&&/^[A-Za-z0-9_.# /+:-]{1,64}$/.test(value.symbol)&&
  typeof value.timeframe==="string"&&/^(M1|M5|M15|M30|H1|H4|D1)$/.test(value.timeframe);
 const blank=()=>({orderType:"BUY_LIMIT",volumeLots:"0.01",entryPrice:"",slPrice:"",tpPrice:"",preview:null});
 const finitePositive=value=>typeof value==="number"&&Number.isFinite(value)&&value>0;
 function create(scope){
  if(!validScope(scope))throw new TypeError("Invalid ticket scope");
  let active={...scope},state=blank();
  const read=()=>({...active,...state});
  return {
   read,
   set(name,value){
    if(!FIELDS.has(name))throw new TypeError("Ticket field is not allowed");
    if(name==="orderType"&&!TYPES.has(value))throw new TypeError("Pending order type required");
    if(name!=="orderType"&&(typeof value!=="string"||value.length>32||value!==""&&
       (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,10})?$/.test(value)||!Number.isFinite(Number(value))||Number(value)<=0)))
     throw new TypeError("Finite positive ticket price or lots required");
    state={...state,[name]:value,preview:null};
   },
   setChartEntry(price,digits){
    if(!finitePositive(price)||!Number.isInteger(digits)||digits<0||digits>10)return false;
    const value=price.toFixed(digits);
    try{this.set("entryPrice",value);return true}catch(_){return false}
   },
   setScope(next){
    if(!validScope(next))throw new TypeError("Invalid ticket scope");
    if(next.account!==active.account||next.symbol!==active.symbol||next.timeframe!==active.timeframe){
     active={...next};state=blank();
    }
   },
   clear(){state=blank()},
   payload(){
    const values={volumeLots:state.volumeLots,entryPrice:state.entryPrice,
                  slPrice:state.slPrice,tpPrice:state.tpPrice};
    for(const [key,text] of Object.entries(values))
     if(typeof text!=="string"||!text||!Number.isFinite(Number(text))||Number(text)<=0)
      throw new TypeError("Ticket needs valid "+key);
    if(!TYPES.has(state.orderType))throw new TypeError("Pending order type required");
    return {schemaVersion:1,account:active.account,symbol:active.symbol,
     orderType:state.orderType,volumeLots:Number(state.volumeLots),
     entryPrice:Number(state.entryPrice),slPrice:Number(state.slPrice),tpPrice:Number(state.tpPrice)};
   },
   setPreview(value){
    if(!value||value.account!==active.account||value.symbol!==active.symbol||value.canExecute!==false)
     throw new TypeError("Preview scope or capability mismatch");
    state={...state,preview:JSON.parse(JSON.stringify(value))};
   },
   confirmationText(){
    const preview=state.preview,order=preview?.order;
    if(preview?.canCommit!==true||typeof preview.previewId!=="string"||
       !/^[A-Za-z0-9_-]{32,128}$/.test(preview.previewId)||!TYPES.has(order?.orderType)||
       !finitePositive(order?.volumeLots))return "";
    const lots=String(Number(order.volumeLots));
    return active.account+" "+active.symbol+" "+order.orderType+" "+lots;
   },
   canCommit(checked,text){const expected=this.confirmationText();
    return checked===true&&expected!==""&&text===expected&&state.preview?.canCommit===true&&state.preview.canExecute===false;
   }
  };
 }
 const api={create};
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
 root.ChartStudioTicketDraft=api;
})(typeof globalThis!=="undefined"?globalThis:this);

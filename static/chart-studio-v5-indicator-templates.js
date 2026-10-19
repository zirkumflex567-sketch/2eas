/* Bounded, scope-bound browser store for native-v5 indicator templates. */
(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.ChartStudioV5IndicatorTemplates=api;
})(typeof globalThis==="object"?globalThis:this,function(){
  "use strict";
  const PREFIX="2eas.chartstudio.v5.indicator-templates:v1:";
  const MAX_TEMPLATES=20,MAX_STORE_BYTES=2*1024*1024,MAX_SNAPSHOT_BYTES=512*1024;
  const ACCOUNT=/^[a-z0-9_-]{1,32}$/,SYMBOL=/^[A-Za-z0-9][A-Za-z0-9_.#/+:-]{0,31}$/;
  const TIMEFRAMES=new Set(["M1","M5","M15","M30","H1","H4","D1","W1"]);
  const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
  const object=value=>!!value&&typeof value==="object"&&!Array.isArray(value)&&
    (Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
  const exactKeys=(value,keys)=>Object.keys(value).sort().join(",")===[...keys].sort().join(",");
  const clone=value=>JSON.parse(JSON.stringify(value));
  const byteLength=value=>new TextEncoder().encode(value).length;
  function validScope(scope){return object(scope)&&exactKeys(scope,["account","symbol","timeframe"])&&
    ACCOUNT.test(scope.account||"")&&SYMBOL.test(scope.symbol||"")&&TIMEFRAMES.has(scope.timeframe)}
  function cleanName(value){
    if(typeof value!=="string")throw new Error("INVALID_NAME");
    const name=value.trim();
    if(name.length<1||name.length>40||/[\x00-\x1f\x7f]/.test(name))throw new Error("INVALID_NAME");
    return name;
  }
  function normalizeSnapshot(value){
    if(!object(value)||!exactKeys(value,["indicators","movingAverages","oscillatorInstances"])||
      !object(value.indicators)||Object.keys(value.indicators).length>64||
      !Array.isArray(value.movingAverages)||value.movingAverages.length>16||
      !Array.isArray(value.oscillatorInstances)||value.oscillatorInstances.length>8)throw new Error("INVALID_SNAPSHOT");
    let serialized;
    try{serialized=JSON.stringify(value)}catch(_){throw new Error("INVALID_SNAPSHOT")}
    if(typeof serialized!=="string"||byteLength(serialized)>MAX_SNAPSHOT_BYTES)throw new Error("SNAPSHOT_LIMIT");
    let parsed;try{parsed=JSON.parse(serialized)}catch(_){throw new Error("INVALID_SNAPSHOT")}
    if(!object(parsed)||!exactKeys(parsed,["indicators","movingAverages","oscillatorInstances"]))throw new Error("INVALID_SNAPSHOT");
    return parsed;
  }
  function createStore({storage,scope,idFactory}={}){
    if(!storage||typeof storage.getItem!=="function"||typeof storage.setItem!=="function"||typeof storage.removeItem!=="function")throw new Error("INVALID_STORAGE");
    if(!validScope(scope))throw new Error("INVALID_SCOPE");
    const scoped={account:scope.account,symbol:scope.symbol,timeframe:scope.timeframe};
    const key=PREFIX+[scoped.account,scoped.symbol,scoped.timeframe].map(encodeURIComponent).join(":");
    function initial(){return {schemaVersion:1,...scoped,templates:[]}}
    function read(){
      const raw=storage.getItem(key);if(raw===null)return initial();
      if(typeof raw!=="string"||byteLength(raw)>MAX_STORE_BYTES)throw new Error("STORE_LIMIT");
      let store;try{store=JSON.parse(raw)}catch(_){throw new Error("INVALID_STORE")}
      if(!object(store)||!exactKeys(store,["schemaVersion","account","symbol","timeframe","templates"])||
        store.schemaVersion!==1||store.account!==scoped.account||store.symbol!==scoped.symbol||
        store.timeframe!==scoped.timeframe||!Array.isArray(store.templates)||store.templates.length>MAX_TEMPLATES)throw new Error("INVALID_STORE");
      const ids=new Set(),names=new Set();
      for(const entry of store.templates){
        if(!object(entry)||!exactKeys(entry,["id","name","snapshot"])||
          typeof entry.id!=="string"||!/^[-_a-zA-Z0-9]{12,64}$/.test(entry.id)||ids.has(entry.id))throw new Error("INVALID_STORE");
        const name=cleanName(entry.name),folded=name.toLocaleLowerCase();
        if(names.has(folded))throw new Error("INVALID_STORE");
        normalizeSnapshot(entry.snapshot);ids.add(entry.id);names.add(folded);
      }
      return store;
    }
    function write(store){
      const serialized=JSON.stringify(store),previous=storage.getItem(key);
      if(byteLength(serialized)>MAX_STORE_BYTES)throw new Error("STORE_LIMIT");
      try{storage.setItem(key,serialized);if(storage.getItem(key)!==serialized)throw new Error("STORAGE_UNCONFIRMED")}
      catch(error){try{if(previous===null)storage.removeItem(key);else storage.setItem(key,previous)}catch(_){}throw error}
    }
    function id(){
      const value=typeof idFactory==="function"?idFactory():globalThis.crypto?.randomUUID?.();
      if(typeof value!=="string"||!/^[-_a-zA-Z0-9]{12,64}$/.test(value))throw new Error("ID_UNAVAILABLE");
      return value;
    }
    function unique(store,name,except=""){
      const folded=name.toLocaleLowerCase();
      if(store.templates.some(item=>item.id!==except&&item.name.toLocaleLowerCase()===folded))throw new Error("NAME_EXISTS");
    }
    function publicEntry(entry){return {id:entry.id,name:entry.name,snapshot:clone(entry.snapshot)}}
    function find(store,templateId){const result=store.templates.find(entry=>entry.id===templateId);if(!result)throw new Error("TEMPLATE_NOT_FOUND");return result}
    function add(name,snapshot){
      const store=read(),normalizedName=cleanName(name),normalizedSnapshot=normalizeSnapshot(snapshot);
      unique(store,normalizedName);if(store.templates.length>=MAX_TEMPLATES)throw new Error("TEMPLATE_LIMIT");
      const entry={id:id(),name:normalizedName,snapshot:normalizedSnapshot};store.templates.push(entry);write(store);return publicEntry(entry);
    }
    return Object.freeze({
      scope:Object.freeze({...scoped}),
      storageKey:()=>key,
      list:()=>read().templates.map(({id:templateId,name})=>({id:templateId,name})),
      get:templateId=>publicEntry(find(read(),templateId)),
      save:add,
      rename(templateId,name){const store=read(),entry=find(store,templateId),normalizedName=cleanName(name);unique(store,normalizedName,templateId);entry.name=normalizedName;write(store);return publicEntry(entry)},
      copy(templateId,name){const source=find(read(),templateId);return add(name,source.snapshot)},
      remove(templateId){const store=read(),index=store.templates.findIndex(entry=>entry.id===templateId);if(index<0)throw new Error("TEMPLATE_NOT_FOUND");store.templates.splice(index,1);write(store);return true},
      apply(templateId,{current,apply}={}){
        if(typeof apply!=="function")throw new Error("INVALID_APPLIER");
        const next=publicEntry(find(read(),templateId)).snapshot,previous=normalizeSnapshot(current);
        try{if(apply(clone(next))===false)throw new Error("APPLY_FAILED");return {applied:true}}
        catch(error){try{apply(clone(previous))}catch(_){}throw new Error("APPLY_FAILED: "+String(error?.message||error).slice(0,80),{cause:error})}
      }
    });
  }
  return Object.freeze({createStore,validScope,cleanName,normalizeSnapshot,MAX_TEMPLATES,MAX_STORE_BYTES,MAX_SNAPSHOT_BYTES});
});

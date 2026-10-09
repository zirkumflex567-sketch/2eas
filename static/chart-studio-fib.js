/* Chart Studio Fibonacci level safety: data-only, no broker writes. */
(()=>{"use strict";
const DEFAULT=Object.freeze([0,.236,.382,.5,.618,.786,1]);
function normalizeLevels(input){
 if(!Array.isArray(input)||!input.length||input.length>16)return null;
 const values=[];
 for(const x of input){
  if(typeof x!=="number"||!Number.isFinite(x)||x<0||x>2)return null;
  if(values.length&&x<=values[values.length-1]+1e-9)return null;
  values.push(x);
 }
 return values;
}
function parsePercent(text){
 if(typeof text!=="string"||text.length>240)return null;
 const parts=text.split(";").map(s=>s.trim());
 if(!parts.length||parts.length>16||parts.some(s=>!/^\d{1,3}(?:[,.]\d{1,3})?$/.test(s)))return null;
 const ratios=parts.map(s=>Number(s.replace(",","."))/100);
 return normalizeLevels(ratios);
}
function display(levels){
 const safe=normalizeLevels(levels);if(!safe)return "";
 return safe.map(x=>(x*100).toLocaleString("de-DE",{maximumFractionDigits:3})).join("; ");
}
window.ChartStudioFib=Object.freeze({DEFAULT,normalizeLevels,parsePercent,display});
})();

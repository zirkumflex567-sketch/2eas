/* Chart Studio local screenshot export.
 * No network, no broker request, no background export and no MT5 writes.
 */
(()=>{"use strict";
const MAX_PIXELS=24000000;
function compose({chart,host,overlay,credit="Chart powered by TradingView · Lightweight Charts"}){
 if(!chart||typeof chart.takeScreenshot!=="function"||!host||!overlay)
  throw Error("Chart-Screenshot nicht verfügbar.");
 const base=chart.takeScreenshot(),width=base.width,height=base.height;
 if(!width||!height||width*height>MAX_PIXELS)throw Error("Screenshotgröße unzulässig.");
 const creditSize=27,output=document.createElement("canvas");
 output.width=width;output.height=height+creditSize;
 const ctx=output.getContext("2d");
 if(!ctx)throw Error("Canvas-Kontext nicht verfügbar.");
 ctx.fillStyle="#071923";ctx.fillRect(0,0,output.width,output.height);
 ctx.drawImage(base,0,0);
 const root=host.getBoundingClientRect(),rect=overlay.getBoundingClientRect();
 // LWC takeScreenshot() includes the chart axes; custom drawings cover only
 // the plot pane. Preserve their CSS positioning and source DPR exactly.
 if(overlay.width>0&&overlay.height>0&&rect.width>0&&rect.height>0){
  const x=(rect.left-root.left)*width/root.width;
  const y=(rect.top-root.top)*height/root.height;
  const w=rect.width*width/root.width,h=rect.height*height/root.height;
  if([x,y,w,h].every(Number.isFinite)&&w>0&&h>0)
   ctx.drawImage(overlay,x,y,w,h);
 }
 ctx.fillStyle="#112a36";ctx.fillRect(0,height,width,creditSize);
 ctx.fillStyle="#cae4ed";ctx.font="11px system-ui";ctx.textBaseline="middle";
 ctx.fillText(String(credit).slice(0,95),10,height+creditSize/2,Math.max(10,width-20));
 return output;
}
function download({chart,host,overlay,account="account",timeframe="chart"}){
 const canvas=compose({chart,host,overlay});
 const safe=v=>String(v).replace(/[^A-Za-z0-9_-]/g,"_").slice(0,40);
 const name="2eas_"+safe(account)+"_"+safe(timeframe)+"_"+Date.now()+".png";
 return new Promise((resolve,reject)=>{
  try{canvas.toBlob(blob=>{
   if(!blob){reject(Error("PNG-Export fehlgeschlagen."));return}
   const url=URL.createObjectURL(blob),a=document.createElement("a");
   a.href=url;a.download=name;a.style.display="none";
   document.body.append(a);
   try{a.click();resolve(name)}
   catch(e){reject(e)}
   finally{a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000)}
  },"image/png")}catch(err){reject(err)}
 });
}
window.ChartStudioExport=Object.freeze({compose,download});
})();
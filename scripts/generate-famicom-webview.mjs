import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "..");
const jsnesSource = readFileSync(resolve(projectRoot, "node_modules/jsnes/dist/jsnes.min.js"), "utf8");

const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>html,body,#player{width:100%;height:100%;margin:0;background:#05080e;overflow:hidden}#player{display:flex;align-items:center;justify-content:center}#player canvas{width:auto!important;height:auto!important;max-width:100%;max-height:100%;image-rendering:pixelated;image-rendering:crisp-edges;display:block}</style>
</head><body><div id="player"></div><script>${jsnesSource}</script><script>
(function(){
  var player=document.getElementById('player'); var browser=null;
  function send(payload){ if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(JSON.stringify(payload));} }
  function bytesFromBase64(value){ var raw=atob(value), bytes=new Uint8Array(raw.length); for(var i=0;i<raw.length;i++){bytes[i]=raw.charCodeAt(i);} return bytes.buffer; }
  var supportedMappers={0:true,1:true,2:true,3:true,4:true,5:true,7:true,9:true,11:true,34:true,38:true,66:true,71:true,79:true,94:true,118:true,119:true,140:true,180:true,240:true,241:true};
  function inspectRom(buffer){var bytes=new Uint8Array(buffer);if(bytes.length<16||bytes[0]!==78||bytes[1]!==69||bytes[2]!==83||bytes[3]!==26){return {error:'هذا الملف لا يحمل ترويسة iNES صالحة.'};}var mapper=(bytes[6]>>4)|(bytes[7]&240);if((bytes[7]&12)===8){return {error:'ملفات NES 2.0 لا يدعمها المشغّل المضمن حالياً.'};}if(!supportedMappers[mapper]){return {error:'Mapper '+mapper+' غير مدعوم في مشغّل Famicom المضمن حالياً.'};}return {mapper:mapper};}
  function fitCanvas(){var canvas=player.querySelector('canvas');if(!canvas){return;}var scale=Math.max(1,Math.floor(Math.min(player.clientWidth/256,player.clientHeight/240)));canvas.style.width=(256*scale)+'px';canvas.style.height=(240*scale)+'px';canvas.style.imageRendering='pixelated';}
  function loadRom(value){ try { var romData=bytesFromBase64(value), inspection=inspectRom(romData);if(inspection.error){send({type:'error',message:inspection.error});return;}if(browser&&browser.destroy){browser.destroy();} player.innerHTML=''; browser=new window.jsnes.Browser({container:player,romData:romData});requestAnimationFrame(fitCanvas);send({type:'ready'}); } catch(error){send({type:'error',message:error&&error.message?error.message:'تعذر تحميل ملف NES.'});} }
  function input(message){ if(!browser||!browser.nes){return;} var code=window.jsnes.Controller['BUTTON_'+message.button]; if(typeof code!=='number'){return;} if(message.isDown){browser.nes.buttonDown(message.player||1,code);}else{browser.nes.buttonUp(message.player||1,code);} }
  function exportState(requestId){ if(browser&&browser.nes){send({type:'state',snapshot:JSON.stringify(browser.nes.toJSON()),requestId:requestId||'local'});} }
  function importState(snapshot){ if(browser&&browser.nes&&typeof snapshot==='string'){browser.nes.fromJSON(JSON.parse(snapshot));send({type:'state-applied'});} }
  function receive(event){ try { var message=JSON.parse(event.data); if(message.type==='load'){loadRom(message.romBase64);} else if(message.type==='input'){input(message);} else if(message.type==='reset'&&browser&&browser.nes){browser.nes.reset();} else if(message.type==='request-state'){exportState(message.requestId);} else if(message.type==='apply-state'){importState(message.snapshot);} } catch(error){send({type:'error',message:'تعذر تنفيذ أمر المشغّل.'});} }
  window.addEventListener('message',receive); document.addEventListener('message',receive); window.addEventListener('resize',fitCanvas); send({type:'bridge-ready'});
})();
</script></body></html>`;

const destination = resolve(projectRoot, "lib/famicom-webview-html.ts");
mkdirSync(dirname(destination), { recursive: true });
writeFileSync(destination, `// Generated from JSNES for the Android-local Famicom player.\nexport const FAMICOM_WEBVIEW_HTML = ${JSON.stringify(html)} as const;\n`);

const LEGACY_FIT_CANVAS = "function fitCanvas(){var canvas=player.querySelector('canvas');if(!canvas){return;}var scale=Math.max(1,Math.floor(Math.min(player.clientWidth/256,player.clientHeight/240)));canvas.style.width=(256*scale)+'px';canvas.style.height=(240*scale)+'px';canvas.style.imageRendering='pixelated';}";

const STABLE_RENDERER = `function installStableRenderer(instance){
    var hiddenCanvas=player.querySelector('canvas');if(!hiddenCanvas||!instance||!instance.nes){return;}
    hiddenCanvas.style.display='none';
    var canvas=document.createElement('canvas');canvas.id='moudie-pixel-canvas';canvas.width=256;canvas.height=240;
    canvas.style.display='block';canvas.style.imageRendering='auto';canvas.style.setProperty('image-rendering','auto','important');
    player.appendChild(canvas);player.__moudiePixelCanvas=canvas;
    var context=canvas.getContext('2d',{alpha:false});context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
    var imageData=context.getImageData(0,0,256,240);var pixels32=new Uint32Array(imageData.data.buffer);
    if(instance._screen){instance._screen.writeBuffer=function(){};}
    instance.nes.ui.writeFrame=function(frame){for(var index=0;index<61440;index++){pixels32[index]=4278190080|frame[index];}context.putImageData(imageData,0,0);};
  }
  function fitCanvas(){var canvas=player.__moudiePixelCanvas;if(!canvas){return;}var ratio=Math.max(window.devicePixelRatio||1,1);var scale=Math.max(1,Math.floor(Math.min((player.clientWidth*ratio)/320,(player.clientHeight*ratio)/240)));canvas.style.setProperty('width',((320*scale)/ratio)+'px','important');canvas.style.setProperty('height',((240*scale)/ratio)+'px','important');canvas.style.setProperty('image-rendering','auto','important');}
  var audioWasReported=false;
  function resumeFamicomAudio(){var speakers=browser&&browser._speakers;if(!speakers){return;}var report=function(){if(!audioWasReported){audioWasReported=true;send({type:'audio-active'});}};if(!speakers.audioCtx){Promise.resolve(speakers.start()).then(function(){if(speakers.audioCtx){return speakers.audioCtx.resume();}}).then(report).catch(function(){});return;}Promise.resolve(speakers.audioCtx.resume()).then(report).catch(function(){});}`;

const LEGACY_LOAD = "player.innerHTML=''; browser=new window.jsnes.Browser({container:player,romData:romData});requestAnimationFrame(fitCanvas);send({type:'ready'});";
const STABLE_LOAD = "player.innerHTML=''; browser=new window.jsnes.Browser({container:player,romData:romData});installStableRenderer(browser);requestAnimationFrame(fitCanvas);send({type:'ready'});";
const RECEIVE_PREFIX = "function receive(event){ try { var message=JSON.parse(event.data);";
const RECEIVE_WITH_AUDIO = "function receive(event){ try { var message=JSON.parse(event.data);";
const INPUT_BRANCH = "else if(message.type==='input'){input(message);}";
const INPUT_BRANCH_WITH_AUDIO = "else if(message.type==='resume-audio'){resumeFamicomAudio();} else if(message.type==='input'){input(message);}";

/**
 * JSNES normally owns a canvas that is resized by the browser. Replacing its
 * frame sink at creation time gives Android WebView an exact 256×240 canvas.
 * It is displayed as the 4:3 TV output expected by Famicom titles, using a
 * smooth horizontal resample instead of irregular 1.25× nearest-neighbour columns.
 */
export function withFamicomStableRenderer(html: string): string {
  const withRenderer = html.replace(LEGACY_FIT_CANVAS, STABLE_RENDERER);
  if (withRenderer === html) throw new Error("Could not find the original Famicom rendering path.");
  const withLoadHook = withRenderer.replace(LEGACY_LOAD, STABLE_LOAD);
  if (withLoadHook === withRenderer) throw new Error("Could not attach the Famicom graphics output.");
  const withAudioBridge = withLoadHook.replace(RECEIVE_PREFIX, RECEIVE_WITH_AUDIO).replace(INPUT_BRANCH, INPUT_BRANCH_WITH_AUDIO);
  if (withAudioBridge === withLoadHook) throw new Error("Could not attach Famicom audio to focus mode.");
  return withAudioBridge;
}

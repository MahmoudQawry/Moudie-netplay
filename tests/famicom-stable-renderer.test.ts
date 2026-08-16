import { describe, expect, it } from "vitest";

import { withFamicomStableRenderer } from "../lib/famicom-stable-renderer";

describe("Famicom stable renderer", () => {
  it("replaces the JSNES browser scaling and connects the exact-pixel frame sink", () => {
    const fixture = "function fitCanvas(){var canvas=player.querySelector('canvas');if(!canvas){return;}var scale=Math.max(1,Math.floor(Math.min(player.clientWidth/256,player.clientHeight/240)));canvas.style.width=(256*scale)+'px';canvas.style.height=(240*scale)+'px';canvas.style.imageRendering='pixelated';}player.innerHTML=''; browser=new window.jsnes.Browser({container:player,romData:romData});requestAnimationFrame(fitCanvas);send({type:'ready'});function receive(event){ try { var message=JSON.parse(event.data);if(message.type==='load'){} else if(message.type==='input'){input(message);} } catch(error){} }";
    const result = withFamicomStableRenderer(fixture);
    expect(result).toContain("moudie-pixel-canvas");
    expect(result).toContain("installStableRenderer(browser)");
    expect(result).toContain("pixels32[index]=4278190080|frame[index]");
    expect(result).toContain("(player.clientWidth*ratio)/320");
    expect(result).toContain("resumeFamicomAudio");
    expect(result).toContain("message.type==='resume-audio'");
  });

  it("fails clearly if an upstream JSNES bridge removes the expected hooks", () => {
    expect(() => withFamicomStableRenderer("<html></html>")).toThrow("تعذر العثور");
  });
});

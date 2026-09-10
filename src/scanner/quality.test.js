import { beforeAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { CaptureQualityGate, measureCaptureQuality } from './quality.js';

const width=1280,height=960,quad=[{x:60,y:280},{x:1220,y:280},{x:1220,y:680},{x:60,y:680}];
let ticket;
beforeAll(async()=>{
  const rows=Array.from({length:10},(_,r)=>`<text x="30" y="${35+r*36}" font-family="sans-serif" font-size="21">TICKET 3556031  MATERIALS  VEHICLE 1205  GROSS 79300  NET 48960</text>`).join('');
  ticket=await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1160" height="400"><rect width="100%" height="100%" fill="white"/>${rows}</svg>`)).png().toBuffer();
});
async function measure(source=ticket,corners=quad){
  const {data}=await sharp(source).extend({left:60,right:60,top:280,bottom:280,background:'#334455'}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  return measureCaptureQuality(data,width,height,corners);
}
describe('full-resolution capture quality',()=>{
  it('accepts close, sharp printing and rejects defocus despite a visible page boundary',async()=>{
    expect(await measure()).toMatchObject({ready:true,close:true,focused:true});
    const blurred=await sharp(ticket).blur(2.5).png().toBuffer();
    expect(await measure(blurred)).toMatchObject({ready:false,close:true,focused:false});
  });
  it('rejects motion blur and a locally blurred ticket-number area',async()=>{
    const motion=await sharp(ticket).convolve({width:11,height:3,kernel:Array.from({length:33},(_,i)=>i>=11&&i<22?1/11:0)}).png().toBuffer();
    expect((await measure(motion)).focused).toBe(false);
    const patch=await sharp(ticket).extract({left:0,top:0,width:380,height:170}).blur(3).png().toBuffer();
    const local=await sharp(ticket).composite([{input:patch,left:0,top:0}]).png().toBuffer();
    expect((await measure(local)).focused).toBe(false);
  });
  it('rejects blank paper, distant framing, and clipped page edges',async()=>{
    const blank=await sharp({create:{width:1160,height:400,channels:3,background:'white'}}).png().toBuffer();
    expect((await measure(blank)).focused).toBe(false);
    expect((await measure(ticket,[{x:180,y:300},{x:1100,y:300},{x:1100,y:660},{x:180,y:660}])).close).toBe(false);
    expect((await measure(ticket,[{x:1,y:280},{x:1278,y:280},{x:1278,y:680},{x:1,y:680}])).close).toBe(false);
  });
  it('requires steady observations and expires green on lost or stale focus',()=>{
    const gate=new CaptureQualityGate(),normalized=quad.map(p=>({x:p.x/width,y:p.y/height}));
    expect(gate.update({ready:true},normalized,0)).toBe(false);
    expect(gate.update({ready:true},normalized,150)).toBe(false);
    expect(gate.update({ready:true},normalized,300)).toBe(true);
    expect(gate.isReady(1500)).toBe(false);
    expect(gate.update({ready:false},normalized,400)).toBe(false);
    expect(gate.update({ready:true},normalized,500)).toBe(false);
  });
});

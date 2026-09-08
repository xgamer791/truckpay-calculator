import { describe, expect, it } from 'vitest';
import { detectTicket, area, cornerMotion, validQuad, orderCorners, OutlineFilter, CaptureGate, processTicket } from './core.js';

function inside(x,y,q){return q.every((p,i)=>{const b=q[(i+1)%4];return (b.x-p.x)*(y-p.y)-(b.y-p.y)*(x-p.x)>=0;});}
function scene({width=320,height=280,quad=[{x:56,y:27},{x:264,y:40},{x:249,y:249},{x:66,y:238}],shadow=false,blank=false,noise=0}={}){
  const data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const p=(y*width+x)*4,paper=inside(x,y,quad);let value=paper?235:48;
    if(paper&&shadow)value-=75*x/width;
    if(paper&&!blank&&y>70&&y<205&&x>90&&x<218&&(y%19<3)&&(x%23<18))value=28;
    value+=noise*Math.sin(x*63.7+y*91.3);
    data[p]=paper?value:value*.8;data[p+1]=value;data[p+2]=paper?value:value*1.2;data[p+3]=255;
  }
  return {data,width,height,quad};
}

describe('original ticket vision',()=>{
  it('finds a perspective ticket on a colored background with shadows and sensor noise',()=>{
    const image=scene({shadow:true,noise:5}),found=detectTicket(image.data,image.width,image.height);
    expect(found).not.toBeNull();
    expect(cornerMotion(found.corners,image.quad)).toBeLessThan(5);
    expect(found.confidence).toBeGreaterThan(.68);
    expect(found.sharpness).toBeGreaterThan(65);
  });
  it('does not find a document in a uniform frame',()=>{
    const pixels=new Uint8ClampedArray(320*240*4).fill(180);
    expect(detectTicket(pixels,320,240)).toBeNull();
  });
  it('tracks a moving ticket and reacquires after a large camera movement',()=>{
    let previous=null;
    for(let frame=0;frame<10;frame++){
      const dx=frame<7?frame*3:35,dy=frame*1.1;
      const quad=[{x:45+dx,y:20+dy},{x:240+dx,y:28+dy},{x:231+dx,y:228+dy},{x:51+dx,y:222+dy}];
      const image=scene({quad}),found=detectTicket(image.data,320,280,previous,frame);
      expect(found,`frame ${frame}`).not.toBeNull();
      expect(cornerMotion(found.corners,quad)).toBeLessThan(6);
      previous=found.corners;
    }
  });
  it('supports rotated and wide tickets without forcing portrait geometry',()=>{
    const rotated=orderCorners([{x:160,y:15},{x:284,y:133},{x:160,y:260},{x:31,y:134}]);
    expect(validQuad(rotated,320,280)).toBe(true);
    const image=scene({quad:rotated}),found=detectTicket(image.data,320,280);
    expect(found).not.toBeNull();expect(Math.abs(area(found.corners)/area(rotated)-1)).toBeLessThan(.08);
    const wide=scene({quad:[{x:30,y:75},{x:288,y:75},{x:288,y:199},{x:30,y:199}]});
    const result=processTicket(wide.data,320,280,wide.quad);
    expect(result.width/result.height).toBeCloseTo(258/124,1);
  });
  it('removes colored background and retains dark printing on white paper',()=>{
    const image=scene({shadow:true,noise:7}),found=detectTicket(image.data,320,280),result=processTicket(image.data,320,280,found.corners);
    let black=0,white=0,borderBlack=0,border=0;
    for(let y=0;y<result.height;y++)for(let x=0;x<result.width;x++){
      const i=(y*result.width+x)*4,value=result.pixels[i];
      expect(result.pixels[i+1]).toBe(value);expect(result.pixels[i+2]).toBe(value);expect([0,255]).toContain(value);
      if(value===0)black++;else white++;
      if(x<3||y<3||x>=result.width-3||y>=result.height-3){border++;if(value===0)borderBlack++;}
    }
    expect(black/(black+white)).toBeGreaterThan(.02);expect(white/(black+white)).toBeGreaterThan(.8);expect(borderBlack/border).toBeLessThan(.05);
  });
});

const stable={corners:[{x:.2,y:.12},{x:.8,y:.12},{x:.8,y:.88},{x:.2,y:.88}],confidence:.93,areaRatio:.45,brightness:210,sharpness:220,inkRatio:.08,clipped:false};
describe('capture and smoothing',()=>{
  it('accepts small hand tremor and detector jitter without restarting the countdown',()=>{
    const gate=new CaptureGate();let captured=false;
    for(let time=0;time<=1600;time+=100){
      const offset=time%200===0?.005:-.005;
      const result={...stable,corners:stable.corners.map(p=>({x:p.x+offset,y:p.y}))};
      captured=gate.update(result,time).capture||captured;
    }
    expect(captured).toBe(true);
  });
  it('requires several observations even when processing is slow',()=>{
    const gate=new CaptureGate();
    expect(gate.update(stable,0).capture).toBe(false);
    expect(gate.update(stable,1200).capture).toBe(false);
    expect(gate.update(stable,2400).capture).toBe(true);
  });
  it('captures once after a stable interval, resets for movement, blur, loss and stale observations',()=>{
    for(const interruption of [null,{...stable,sharpness:12},{...stable,corners:stable.corners.map(p=>({x:p.x+.04,y:p.y}))}]){
      const gate=new CaptureGate();for(let t=0;t<=700;t+=100)expect(gate.update(stable,t).capture).toBe(false);
      expect(gate.update(interruption,800).capture).toBe(false);
      expect(gate.update(stable,900).capture).toBe(false);
      for(let t=1000;t<=1900;t+=100)expect(gate.update(stable,t).capture).toBe(false);
      expect(gate.update(stable,2000).capture).toBe(true);expect(gate.update(stable,2100).capture).toBe(false);
    }
    const gate=new CaptureGate();gate.update(stable,0);expect(gate.update(stable,2000).capture).toBe(false);
  });
  it('will not capture a clipped, blank or undersized ticket',()=>{
    for(const bad of [{...stable,clipped:true},{...stable,inkRatio:0},{...stable,areaRatio:.08}]){
      const gate=new CaptureGate();for(let t=0;t<3000;t+=100)expect(gate.update(bad,t).capture).toBe(false);
    }
  });
  it('reduces stationary jitter while following intentional movement',()=>{
    const filter=new OutlineFilter();let rawError=0,filteredError=0;
    for(let f=0;f<70;f++){
      const noisy=stable.corners.map((p,i)=>({x:p.x+Math.sin(f*2+i)*.002,y:p.y+Math.cos(f*2+i)*.002}));
      const smoothed=filter.update(noisy,f*90);if(f>5){rawError+=cornerMotion(noisy,stable.corners);filteredError+=cornerMotion(smoothed,stable.corners);}
    }
    expect(filteredError/rawError).toBeLessThan(.6);
    const moved=stable.corners.map(p=>({x:p.x+.08,y:p.y}));
    for(let t=6300;t<=6500;t+=100)filter.update(moved,t);
    expect(cornerMotion(filter.points,moved)).toBeLessThan(.009);
  });
});

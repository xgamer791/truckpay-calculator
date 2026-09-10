import { describe, it, expect } from 'vitest';
import { LiveOutline } from './outline.js';
import { cornerMotion } from './core.js';
const quad=[{x:.2,y:.15},{x:.8,y:.15},{x:.8,y:.85},{x:.2,y:.85}];
describe('live document outline',()=>{
  it('always shows a guide before detection, during tracking loss, and after recovery',()=>{
    const outline=new LiveOutline();
    expect(outline.sample(0)).toMatchObject({opacity:1,tracked:false});
    outline.update(quad,0);
    expect(outline.sample(0).opacity).toBe(1);
    expect(outline.sample(800).opacity).toBe(1);
    expect(outline.sample(1075).opacity).toBe(1);
    expect(outline.sample(1200)).toMatchObject({opacity:1,tracked:false,corners:quad});
    expect(outline.sample(60000)).toMatchObject({opacity:1,tracked:false,corners:quad});
    outline.update(quad.map(p=>({x:p.x-.1,y:p.y})),1300);
    expect(outline.sample(1300).corners[0].x).toBeCloseTo(.1);
  });
  it('smooths jitter and advances on display frames instead of jumping on detection frames',()=>{
    const outline=new LiveOutline();let rawError=0,drawnError=0;
    for(let t=0;t<2400;t+=16){
      if(t%96===0){const jitter=.003*Math.sin(t);const q=quad.map(p=>({x:p.x+jitter,y:p.y-jitter}));outline.update(q,t);rawError+=cornerMotion(q,quad);drawnError+=cornerMotion(outline.sample(t).corners,quad);}
      outline.sample(t);
    }
    expect(drawnError).toBeLessThan(rawError*.6);
    const before=outline.sample(2400).corners;
    const moved=quad.map(p=>({x:p.x+.06,y:p.y}));outline.update(moved,2400);
    expect(outline.sample(2400).corners).toEqual(before);
    expect(outline.sample(2416).corners[0].x).toBeGreaterThan(before[0].x);
    for(let t=2496;t<=2880;t+=96){outline.update(moved,t);outline.sample(t);}
    expect(cornerMotion(outline.sample(2896).corners,moved)).toBeLessThan(.006);
  });
});

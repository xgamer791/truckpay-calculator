import { describe, it, expect } from 'vitest';
import { loupePosition, moveCropHandle } from './crop-controls.js';
const q=[{x:.2,y:.1},{x:.8,y:.1},{x:.8,y:.9},{x:.2,y:.9}];
describe('crop adjustments',()=>{
  it('moves a complete side perpendicularly while preserving the opposite side',()=>{
    const next=moveCropHandle(q,'side',0,.3,.1,400,800);
    expect(next).toEqual([{x:.2,y:.2},{x:.8,y:.2},q[2],q[3]]);
    const left=moveCropHandle(q,'side',3,.1,.2,400,800);
    expect(left[0].x).toBeCloseTo(.3);expect(left[3].x).toBeCloseTo(.3);
    expect(left[1]).toEqual(q[1]);expect(left[2]).toEqual(q[2]);
  });
  it('keeps handles in the image and prevents crossed crop lines',()=>{
    const next=moveCropHandle(q,'side',0,0,-10,400,800);
    expect(next[0].y).toBe(0);expect(next[1].y).toBe(0);
    expect(moveCropHandle(q,'corner',0,.9,.9,400,800)).toEqual(q);
  });
  it('positions the magnifier inside the canvas and away from a finger at any edge',()=>{
    for(const [w,h] of [[390,600],[660,260]])for(const finger of [{x:0,y:0},{x:w,y:0},{x:w,y:h},{x:0,y:h},{x:w/2,y:h/2}]){
      const p=loupePosition(finger,w,h),half=p.size/2;
      expect(p.x-half).toBeGreaterThanOrEqual(8);expect(p.x+half).toBeLessThanOrEqual(w-8);
      expect(p.y-half).toBeGreaterThanOrEqual(8);expect(p.y+half).toBeLessThanOrEqual(h-8);
      expect(Math.hypot(p.x-finger.x,p.y-finger.y)).toBeGreaterThan(half+25);
    }
  });
});

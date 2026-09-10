import { OutlineFilter } from './core.js';

// Detection arrives at camera-processing speed; drawing runs at display speed.
// The guide stays visible before detection and after tracking loss.
const GUIDE=[{x:.12,y:.1},{x:.88,y:.1},{x:.88,y:.9},{x:.12,y:.9}];
export class LiveOutline {
  constructor(){this.filter=new OutlineFilter();this.reset();}
  reset(){this.filter.reset();this.target=null;this.points=null;this.velocity=null;this.seen=null;this.painted=null;}
  update(corners,time){
    if(this.seen!==null&&time-this.seen>1200)this.reset();
    const next=this.filter.update(corners,time),dt=(time-this.seen)/1000;
    if(this.target&&dt>0){
      this.velocity=next.map((p,i)=>{
        const x=(p.x-this.target[i].x)/dt,y=(p.y-this.target[i].y)/dt,speed=Math.hypot(x,y);
        // Predict only deliberate movement, not stationary detector noise.
        const scale=speed<.045?0:Math.min(1,.5/speed);
        return {x:x*scale,y:y*scale};
      });
    }
    this.target=next;this.seen=time;
  }
  sample(time){
    if(!this.target)return {corners:GUIDE.map(p=>({...p})),opacity:1,tracked:false};
    const age=time-this.seen;
    if(age>=1200)return {corners:this.points||this.target,opacity:1,tracked:false};
    if(!this.points)this.points=this.target.map(p=>({...p}));
    const dt=Math.max(0,Math.min(50,time-(this.painted??time))),alpha=1-Math.exp(-dt/32);
    this.painted=time;
    // A short, bounded prediction compensates for detection/filter latency.
    // It stops advancing after 140 ms if no further measurement arrives.
    const horizon=Math.min(age+40,140)/1000,clamp=n=>Math.max(0,Math.min(1,n));
    this.points=this.points.map((p,i)=>({
      x:p.x+(clamp(this.target[i].x+(this.velocity?.[i].x||0)*horizon)-p.x)*alpha,
      y:p.y+(clamp(this.target[i].y+(this.velocity?.[i].y||0)*horizon)-p.y)*alpha
    }));
    return {corners:this.points,opacity:1,tracked:true};
  }
}

export function drawTicketOutline(ctx,points,{live=false,opacity=1,tracked=true,ready=false}={}){
  const path=()=>{ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();};
  ctx.globalAlpha=opacity;
  if(live){path();ctx.fillStyle=ready?'rgba(0,199,159,.12)':'rgba(239,68,68,.06)';ctx.fill();}
  ctx.setLineDash(live&&!tracked?[8,6]:[]);
  path();ctx.strokeStyle=live?(ready?'#00c79f':'#ef4444'):'#60a5fa';ctx.lineWidth=live?3:2.5;ctx.lineJoin='round';ctx.stroke();
  if(!live)for(const p of points){ctx.beginPath();ctx.fillStyle='#fff';ctx.arc(p.x,p.y,4,0,Math.PI*2);ctx.fill();}
  ctx.setLineDash([]);ctx.globalAlpha=1;
}

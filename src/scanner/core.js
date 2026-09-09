// DriverPay's original, dependency-free ticket vision pipeline.
// All coordinates are sensor pixels until explicitly normalized by the controller.
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const cross = (a, b, c) => (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
export function area(q) { return Math.abs(q.reduce((s,p,i) => { const n=q[(i+1)%q.length]; return s+p.x*n.y-p.y*n.x; },0))/2; }

export function orderCorners(points) {
  const center = points.reduce((s,p) => ({x:s.x+p.x/points.length,y:s.y+p.y/points.length}),{x:0,y:0});
  const q=points.map(p=>({...p})).sort((a,b)=>Math.atan2(a.y-center.y,a.x-center.x)-Math.atan2(b.y-center.y,b.x-center.x));
  let start=0;
  for(let i=1;i<q.length;i++) if(q[i].x+q[i].y<q[start].x+q[start].y) start=i;
  return q.slice(start).concat(q.slice(0,start));
}

export function validQuad(q,w,h,minArea=.06) {
  if(!q || q.length!==4 || q.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.y<0||p.x>w-1||p.y>h-1)) return false;
  const a=area(q)/(w*h);
  if(a<minArea || a>.96) return false;
  let sign=0;
  const sides=q.map((p,i)=>distance(p,q[(i+1)%4]));
  if(Math.min(...sides)<Math.min(w,h)*.07) return false;
  for(let i=0;i<4;i++) {
    const c=cross(q[i],q[(i+1)%4],q[(i+2)%4]);
    if(Math.abs(c)<1 || (sign && Math.sign(c)!==sign)) return false;
    sign=Math.sign(c);
    const p=q[i],a=q[(i+3)%4],b=q[(i+1)%4];
    const cosine=((a.x-p.x)*(b.x-p.x)+(a.y-p.y)*(b.y-p.y))/(distance(a,p)*distance(b,p));
    if(Math.abs(cosine)>.86) return false;
  }
  const ratio=(sides[0]+sides[2])/(sides[1]+sides[3]);
  return ratio>.18 && ratio<5.5;
}

function luminance(rgba,w,h) {
  const out=new Uint8Array(w*h);
  for(let p=0;p<out.length;p++) out[p]=(rgba[p*4]*77+rgba[p*4+1]*150+rgba[p*4+2]*29)>>8;
  return out;
}

export function localMean(src,w,h,radius) {
  const stride=w+1, sums=new Float64Array(stride*(h+1));
  for(let y=0;y<h;y++) { let row=0; for(let x=0;x<w;x++) { row+=src[y*w+x]; sums[(y+1)*stride+x+1]=sums[y*stride+x+1]+row; } }
  const out=new Float32Array(w*h);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
    const l=Math.max(0,x-radius),r=Math.min(w,x+radius+1),t=Math.max(0,y-radius),b=Math.min(h,y+radius+1);
    out[y*w+x]=(sums[b*stride+r]-sums[t*stride+r]-sums[b*stride+l]+sums[t*stride+l])/((r-l)*(b-t));
  }
  return out;
}

// Close thin printed rules before finding the paper component. Otherwise a
// ticket's boxes split the white page into disconnected islands, and the
// detector mistakes an interior printed box for the paper boundary.
function closePaper(gray,w,h,radius=3) {
  function pass(src,horizontal,maximum) {
    const out=new Float32Array(src.length);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      let value=maximum?0:255;
      for(let d=-radius;d<=radius;d++){
        const sample=src[(horizontal?y:clamp(y+d,0,h-1))*w+(horizontal?clamp(x+d,0,w-1):x)];
        value=maximum?Math.max(value,sample):Math.min(value,sample);
      }
      out[y*w+x]=value;
    }
    return out;
  }
  return pass(pass(pass(pass(gray,true,true),false,true),true,false),false,false);
}

function otsu(gray) {
  const bins=new Uint32Array(256); let sum=0;
  for(const v of gray) { bins[Math.round(v)]++; sum+=Math.round(v); }
  let count=0,partial=0,best=0,threshold=128;
  for(let i=0;i<255;i++) {
    count+=bins[i]; partial+=i*bins[i];
    if(!count || count===gray.length) continue;
    const diff=partial/count-(sum-partial)/(gray.length-count),score=count*(gray.length-count)*diff*diff;
    if(score>best) { best=score; threshold=i; }
  }
  return threshold;
}

function hull(points) {
  const p=points.sort((a,b)=>a.x-b.x||a.y-b.y),lo=[],hi=[];
  for(const v of p) { while(lo.length>1&&cross(lo[lo.length-2],lo[lo.length-1],v)<=0)lo.pop(); lo.push(v); }
  for(let i=p.length-1;i>=0;i--) { const v=p[i];while(hi.length>1&&cross(hi[hi.length-2],hi[hi.length-1],v)<=0)hi.pop();hi.push(v); }
  lo.pop();hi.pop();return lo.concat(hi);
}

function fourVertices(poly) {
  const q=poly.slice();
  while(q.length>4) {
    let smallest=Infinity,at=0;
    for(let i=0;i<q.length;i++) {
      const loss=Math.abs(cross(q[(i+q.length-1)%q.length],q[i],q[(i+1)%q.length]));
      if(loss<smallest){smallest=loss;at=i;}
    }
    q.splice(at,1);
  }
  return q.length===4?orderCorners(q):null;
}

function paperComponents(gray,w,h,threshold) {
  const seen=new Uint8Array(w*h),queue=new Int32Array(w*h),candidates=[];
  for(let seed=0;seed<gray.length;seed++) {
    if(seen[seed]||gray[seed]<=threshold)continue;
    let head=0,tail=1,border=0;queue[0]=seed;seen[seed]=1;
    const outline=[];
    while(head<tail) {
      const p=queue[head++],x=p%w,y=(p/w)|0;
      let edge=x===0||y===0||x===w-1||y===h-1;
      if(edge)border++;
      for(const n of [x>0?p-1:-1,x<w-1?p+1:-1,y>0?p-w:-1,y<h-1?p+w:-1]) {
        if(n<0)continue;
        if(gray[n]<=threshold){edge=true;continue;}
        if(!seen[n]){seen[n]=1;queue[tail++]=n;}
      }
      if(edge && (x+y)%2===0)outline.push({x,y});
    }
    if(tail<w*h*.055 || tail>w*h*.94 || border>(w+h)*.12 || outline.length<12)continue;
    const poly=hull(outline),quad=fourVertices(poly);
    if(quad && validQuad(quad,w,h) && area(quad)/Math.max(1,area(poly))>.8) candidates.push(quad);
  }
  return candidates;
}

function at(image,w,h,x,y) {return image[clamp(Math.round(y),0,h-1)*w+clamp(Math.round(x),0,w-1)];}
function intersect(a,b) {
  const det=a.nx*b.ny-a.ny*b.nx;
  return Math.abs(det)<.03?null:{x:(a.d*b.ny-a.ny*b.d)/det,y:(a.nx*b.d-a.d*b.nx)/det};
}

// Locate each edge along its normal, then fit a line to many observations.
// This follows translation, rotation and perspective without snapping to single pixels.
function refine(q,gray,w,h,range=7) {
  const center=q.reduce((s,p)=>({x:s.x+p.x/4,y:s.y+p.y/4}),{x:0,y:0}),lines=[];
  for(let i=0;i<4;i++) {
    const a=q[i],b=q[(i+1)%4],len=distance(a,b),tx=(b.x-a.x)/len,ty=(b.y-a.y)/len;
    let nx=-ty,ny=tx;
    if(nx*(center.x-a.x)+ny*(center.y-a.y)<0){nx=-nx;ny=-ny;}
    const samples=[];
    for(let j=2;j<=30;j++) {
      const t=j/32,px=a.x+(b.x-a.x)*t,py=a.y+(b.y-a.y)*t;
      let best=-Infinity,offset=0,contrast=0;
      for(let d=-range;d<=range;d++) {
        const x=px+nx*d,y=py+ny*d;
        const c=(at(gray,w,h,x+nx*3,y+ny*3)+at(gray,w,h,x+nx*5,y+ny*5)-at(gray,w,h,x-nx*3,y-ny*3)-at(gray,w,h,x-nx*5,y-ny*5))/2;
        const score=c-Math.abs(d)*.5;
        if(score>best){best=score;offset=d;contrast=c;}
      }
      if(contrast>9)samples.push({t:(t-.5)*len,d:offset,weight:Math.min(80,contrast)});
    }
    if(samples.length<12)return null;
    const offsets=samples.map(s=>s.d).sort((a,b)=>a-b),median=offsets[offsets.length>>1];
    const good=samples.filter(s=>Math.abs(s.d-median)<=Math.max(3,range*.45));
    if(good.length<10)return null;
    let sw=0,st=0,sd=0,stt=0,std=0;
    for(const s of good){sw+=s.weight;st+=s.weight*s.t;sd+=s.weight*s.d;stt+=s.weight*s.t*s.t;std+=s.weight*s.t*s.d;}
    const slope=(sw*std-st*sd)/Math.max(1,sw*stt-st*st),offset=(sd-slope*st)/sw;
    const lx=nx-slope*tx,ly=ny-slope*ty,norm=Math.hypot(lx,ly),mx=(a.x+b.x)/2+nx*offset,my=(a.y+b.y)/2+ny*offset;
    lines.push({nx:lx/norm,ny:ly/norm,d:(lx*mx+ly*my)/norm});
  }
  const next=lines.map((l,i)=>intersect(lines[(i+3)%4],l));
  return next.every(Boolean)&&validQuad(next,w,h)?next:null;
}

function edgeCandidates(gray,w,h) {
  // Gradient-directed Hough voting: only cast votes close to the edge normal.
  const radius=Math.ceil(Math.hypot(w,h)),stride=radius*2+1,acc=new Uint16Array(90*stride),cos=[],sin=[];
  for(let t=0;t<90;t++){cos[t]=Math.cos(t*Math.PI/90);sin[t]=Math.sin(t*Math.PI/90);}
  for(let y=2;y<h-2;y+=2)for(let x=2;x<w-2;x+=2){
    const i=y*w+x,gx=gray[i+1]-gray[i-1],gy=gray[i+w]-gray[i-w];
    if(Math.hypot(gx,gy)<25)continue;
    let angle=Math.atan2(gy,gx);if(angle<0)angle+=Math.PI;
    const bin=Math.round(angle*90/Math.PI)%90;
    for(let delta=-2;delta<=2;delta++){const t=(bin+delta+90)%90,r=Math.round(x*cos[t]+y*sin[t])+radius;acc[t*stride+r]++;}
  }
  const peaks=[];
  for(let t=0;t<90;t++)for(let r=0;r<stride;r++)if(acc[t*stride+r]>Math.min(w,h)*.07)peaks.push({t,r,v:acc[t*stride+r]});
  peaks.sort((a,b)=>b.v-a.v);
  const lines=[];
  for(const p of peaks){
    const line={nx:cos[p.t],ny:sin[p.t],d:p.r-radius,v:p.v};
    if(lines.some(l=>Math.abs(l.nx*line.nx+l.ny*line.ny)>.99&&Math.abs(l.d-(l.nx*line.nx+l.ny*line.ny<0?-line.d:line.d))<10))continue;
    lines.push(line);if(lines.length===18)break;
  }
  const pairs=[];
  for(let a=0;a<lines.length;a++)for(let b=a+1;b<lines.length;b++){
    const dot=lines[a].nx*lines[b].nx+lines[a].ny*lines[b].ny;
    if(Math.abs(dot)>.82&&Math.abs(lines[a].d-(dot<0?-lines[b].d:lines[b].d))>Math.min(w,h)*.12)pairs.push([a,b]);
  }
  const candidates=[];
  for(let i=0;i<pairs.length;i++)for(let j=i+1;j<pairs.length;j++){
    const [a,b]=pairs[i],[c,d]=pairs[j];
    if(new Set([a,b,c,d]).size!==4 || Math.abs(lines[a].nx*lines[c].nx+lines[a].ny*lines[c].ny)>.6)continue;
    const pts=[intersect(lines[a],lines[c]),intersect(lines[a],lines[d]),intersect(lines[b],lines[d]),intersect(lines[b],lines[c])];
    if(pts.some(p=>!p))continue;
    const q=orderCorners(pts);if(validQuad(q,w,h))candidates.push(q);
    if(candidates.length>=60)return candidates;
  }
  return candidates;
}

function evaluate(q,gray,w,h) {
  if(!validQuad(q,w,h))return null;
  const edgeScores=[];
  for(let i=0;i<4;i++){
    const a=q[i],b=q[(i+1)%4],len=distance(a,b),nx=-(b.y-a.y)/len,ny=(b.x-a.x)/len;
    let strong=0,contrast=0;
    for(let j=2;j<22;j++){
      const t=j/24,x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;
      const d=at(gray,w,h,x+nx*4,y+ny*4)-at(gray,w,h,x-nx*4,y-ny*4);
      if(d>10)strong++;contrast+=clamp(d/65,0,1);
    }
    edgeScores.push(strong/20*.55+contrast/20*.45);
  }
  const weakest=Math.min(...edgeScores),boundary=edgeScores.reduce((s,v)=>s+v/4,0);
  if(weakest<.28||boundary<.47)return null;
  let sum=0,ink=0,n=0,sharp=0;
  const values=[];
  for(let v=.08;v<.94;v+=.035)for(let u=.08;u<.94;u+=.035){
    const x=(1-v)*((1-u)*q[0].x+u*q[1].x)+v*((1-u)*q[3].x+u*q[2].x);
    const y=(1-v)*((1-u)*q[0].y+u*q[1].y)+v*((1-u)*q[3].y+u*q[2].y);
    const value=at(gray,w,h,x,y);values.push(value);sum+=value;n++;
    const lap=4*value-at(gray,w,h,x-1,y)-at(gray,w,h,x+1,y)-at(gray,w,h,x,y-1)-at(gray,w,h,x,y+1);
    sharp+=lap*lap;
  }
  values.sort((a,b)=>a-b);const paper=values[Math.floor(values.length*.8)];
  for(const value of values)if(value<paper-35)ink++;
  const inkRatio=ink/n,brightness=sum/n,sharpness=sharp/n;
  if(brightness<65 || paper<100)return null;
  const confidence=clamp(boundary*.62+weakest*.2+Math.min(1,area(q)/(w*h*.35))*.08+(inkRatio>.006&&inkRatio<.55?.1:0),0,1);
  return {corners:q,confidence,brightness,sharpness,inkRatio,areaRatio:area(q)/(w*h),clipped:q.some(p=>p.x<4||p.y<4||p.x>w-5||p.y>h-5)};
}

export function detectTicket(rgba,w,h,previous=null,frame=0) {
  const gray=luminance(rgba,w,h),smooth=localMean(gray,w,h,1);
  let best=null,bestRank=0;
  const consider=initial=>{
    const q=refine(initial,smooth,w,h,6)||initial,result=evaluate(q,gray,w,h);
    if(!result)return;
    const continuity=previous?Math.max(0,1-cornerMotion(previous,q)/Math.hypot(w,h)*8):0;
    const rank=result.confidence+continuity*.05+Math.min(result.areaRatio,.65)*.1;
    if(rank>bestRank){best=result;bestRank=rank;}
  };
  if(previous&&validQuad(previous,w,h)){
    const tracked=refine(previous,smooth,w,h,22);
    if(tracked)consider(tracked);
  }
  // Reacquire globally regularly, while local line fitting follows every frame.
  // A refined polygon is not necessarily valid paper: reacquire immediately
  // if its contrast/printing check failed, rather than waiting several frames.
  if(!best || frame%3===0){
    const t=otsu(smooth);
    const closed=closePaper(smooth,w,h);
    for(const threshold of new Set([clamp(t,50,210),clamp(t+30,75,235),clamp(t-25,40,190)])){
      for(const q of paperComponents(closed,w,h,threshold))consider(q);
    }
    if(!best)for(const q of edgeCandidates(smooth,w,h))consider(q);
  }
  return best;
}

export function cornerMotion(a,b) {return Math.sqrt(a.reduce((s,p,i)=>s+(p.x-b[i].x)**2+(p.y-b[i].y)**2,0)/4);}
export function alignCorners(q,reference) {
  if(!reference)return q;
  let best=q,bestError=Infinity;
  for(let shift=0;shift<4;shift++){
    const candidate=q.slice(shift).concat(q.slice(0,shift)),error=cornerMotion(candidate,reference);
    if(error<bestError){bestError=error;best=candidate;}
  }
  return best;
}

export class OutlineFilter {
  reset(){this.points=null;this.raw=null;this.time=null;this.speed=0;}
  constructor(){this.reset();}
  update(q,time){
    if(!this.points||time-this.time>400){this.points=q.map(p=>({...p}));this.raw=q;this.time=time;return this.points;}
    q=alignCorners(q,this.raw);
    const dt=clamp((time-this.time)/1000,.008,.25),speed=cornerMotion(this.raw,q)/dt;
    this.speed+=(speed-this.speed)*(1-Math.exp(-dt*12));
    const alpha=1-Math.exp(-2*Math.PI*(1.15+this.speed*18)*dt);
    this.points=this.points.map((p,i)=>({x:p.x+(q[i].x-p.x)*alpha,y:p.y+(q[i].y-p.y)*alpha}));
    this.raw=q;this.time=time;return this.points;
  }
}

export class CaptureGate {
  constructor(){this.reset();}
  reset(){this.anchor=null;this.last=null;this.start=0;this.time=0;this.samples=0;this.missingSince=null;this.latched=false;}
  update(result,time){
    if(this.latched)return {capture:false,progress:1,message:'Captured'};
    // A brief missed detection pauses readiness; it must never take a photo
    // without a current valid ticket, or count the missing time as steady.
    if(!result&&this.anchor&&time-this.time<=400){
      this.missingSince??=time;
      return {capture:false,progress:Math.min(.9,clamp((this.missingSince-this.start)/1100,0,1)),message:'Hold steady · finding ticket edges'};
    }
    const good=result&&result.confidence>=.68&&!result.clipped&&result.areaRatio>=.13&&result.brightness>=85&&result.sharpness>=65&&result.inkRatio>.008&&result.inkRatio<.5;
    if(!good){this.reset();this.time=time;return {capture:false,progress:0,message:!result?'Show all four ticket edges':result.clipped?'Keep the entire ticket in view':result.areaRatio<.13?'Move closer to the ticket':result.brightness<85?'Add more light':result.sharpness<65?'Waiting for a clear image':'Center the ticket in view'};}
    if(this.missingSince!==null){
      if(time-this.time>400){this.anchor=null;this.samples=0;}
      else this.start+=time-this.missingSince;
      this.missingSince=null;
    }
    const q=alignCorners(result.corners,this.last);
    // Detection runs serially. Mobile processing can take hundreds of ms;
    // require repeated observations rather than desktop-speed frame intervals.
    // Use raw corners with a small tremor allowance, preserving the anchor to
    // reject cumulative drift even when individual steps are small.
    if(!this.anchor||time-this.time>1500||time<=this.time||cornerMotion(this.anchor,q)>.025||(this.last&&cornerMotion(this.last,q)>.018)){
      this.anchor=q;this.start=time;this.samples=0;
    }
    this.last=q;this.time=time;this.samples++;
    const progress=Math.min(clamp((time-this.start)/1100,0,1),this.samples>=3?1:.9);
    if(progress===1)this.latched=true;
    return {capture:this.latched,progress,message:progress>.1?'Hold steady · capturing automatically':'Ticket found · hold steady'};
  }
}

// Analytic unit-square to quadrilateral mapping. Bilinear pixel sampling preserves
// the photograph; no image generation, OCR replacement or invented strokes.
export function rectify(rgba,w,h,corners,maxEdge=1800) {
  if(!validQuad(corners,w,h,.015))throw new Error('Keep four corners around the ticket.');
  const src=luminance(rgba,w,h);
  // Refine against the captured sensor frame to remove low-resolution edge error.
  const measured=refine(corners,src,w,h,Math.max(3,Math.round(Math.max(w,h)/200)))||corners;
  const lines=measured.map((p,i)=>{const b=measured[(i+1)%4],len=distance(p,b),nx=-(b.y-p.y)/len,ny=(b.x-p.x)/len;return {nx,ny,d:nx*p.x+ny*p.y+1.5};});
  const q=lines.map((line,i)=>intersect(lines[(i+3)%4],line));
  if(q.some(p=>!p)||!validQuad(q,w,h,.01))throw new Error('Adjust the corners to include the whole ticket.');
  const width=Math.max(distance(q[0],q[1]),distance(q[3],q[2])),height=Math.max(distance(q[0],q[3]),distance(q[1],q[2]));
  const scale=Math.min(1,maxEdge/Math.max(width,height)),ow=Math.max(16,Math.round(width*scale)),oh=Math.max(16,Math.round(height*scale));
  const [a,b,c,d]=q,dx1=b.x-c.x,dx2=d.x-c.x,dx3=a.x-b.x+c.x-d.x,dy1=b.y-c.y,dy2=d.y-c.y,dy3=a.y-b.y+c.y-d.y;
  const det=dx1*dy2-dx2*dy1;
  if(Math.abs(det)<1e-6)throw new Error('Ticket corners overlap. Adjust the crop.');
  const g=(dx3*dy2-dx2*dy3)/det,k=(dx1*dy3-dx3*dy1)/det;
  const ax=b.x-a.x+g*b.x,bx=d.x-a.x+k*d.x,ay=b.y-a.y+g*b.y,by=d.y-a.y+k*d.y;
  const gray=new Uint8Array(ow*oh);
  for(let y=0;y<oh;y++)for(let x=0;x<ow;x++){
    const u=x/(ow-1),v=y/(oh-1),den=1+g*u+k*v,sx=clamp((a.x+ax*u+bx*v)/den,0,w-1.001),sy=clamp((a.y+ay*u+by*v)/den,0,h-1.001);
    const ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy,i=iy*w+ix;
    gray[y*ow+x]=src[i]*(1-fx)*(1-fy)+src[i+1]*fx*(1-fy)+src[i+w]*(1-fx)*fy+src[i+w+1]*fx*fy;
  }
  return {gray,width:ow,height:oh};
}

export function cleanMonochrome(gray,w,h) {
  // Edge-preserving smoothing: average only neighbours with a similar tone.
  const smooth=new Float32Array(gray.length);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const p=y*w+x,value=gray[p];let sum=value*4,weight=4;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      const near=gray[clamp(y+dy,0,h-1)*w+clamp(x+dx,0,w-1)],wt=Math.max(0,1-Math.abs(near-value)/24);
      sum+=near*wt;weight+=wt;
    }
    smooth[p]=sum/weight;
  }
  const local=localMean(smooth,w,h,Math.max(10,Math.round(Math.min(w,h)*.025))),blur=localMean(smooth,w,h,1),out=new Uint8ClampedArray(w*h*4);
  for(let p=0;p<gray.length;p++){
    const sharpen=clamp(smooth[p]+.55*(smooth[p]-blur[p]),0,255);
    // Adaptive local threshold lifts paper shadows; a two-level image gives
    // actual black ink on white paper with identical RGB channels.
    const value=sharpen<local[p]-Math.max(6,local[p]*.055)?0:255;
    out[p*4]=out[p*4+1]=out[p*4+2]=value;out[p*4+3]=255;
  }
  return out;
}

export function processTicket(rgba,w,h,corners){const warped=rectify(rgba,w,h,corners);return {width:warped.width,height:warped.height,pixels:cleanMonochrome(warped.gray,warped.width,warped.height)};}

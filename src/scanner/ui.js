import { OutlineFilter, CaptureGate, alignCorners, validQuad } from './core.js';
import { moveCropHandle, loupePosition } from './crop-controls.js';

const icons={
  close:'<path d="m7 7 14 14M21 7 7 21"/>',
  flash:'<path d="m16 3-10 13h8l-2 9 10-14h-8z"/>',
  photo:'<rect x="4" y="5" width="20" height="18" rx="3"/><circle cx="10" cy="11" r="2"/><path d="m5 21 7-7 4 4 4-6 4 6"/>',
  crop:'<path d="M8 3v17h17M3 8h17v17"/>',
  check:'<path d="m6 14 5 5 11-12"/>',
  rotate:'<path d="M23 10a10 10 0 1 0 1 8M23 3v7h-7"/>'
};
const icon=name=>`<svg viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
const makeCanvas=()=>document.createElement('canvas');
const bounded=(v,a,b)=>Math.max(a,Math.min(b,v));

class TicketScanner {
  constructor(){
    this.session=0;this.requests=new Map();this.requestId=0;this.filter=new OutlineFilter();this.gate=new CaptureGate();
    this.onVisibility=()=>{if(document.hidden&&this.root){this.stopCamera();this.gate.reset();if(this.mode==='live'||this.mode==='loading')this.showError('Camera paused','Tap Resume Camera when you are ready.');}};
    document.addEventListener('visibilitychange',this.onVisibility);
    window.addEventListener('pagehide',()=>this.close());
  }

  async open(options={}){
    if(this.root)return;
    this.options=options;this.session++;this.auto=true;this.mode='loading';this.priorFocus=document.activeElement;
    this.root=document.createElement('section');this.root.className='ticket-camera';this.root.setAttribute('role','dialog');this.root.setAttribute('aria-modal','true');this.root.setAttribute('aria-label','Scan load ticket');
    this.root.innerHTML=`
      <header class="ticket-camera-header"><button type="button" class="ticket-camera-icon" data-action="close" aria-label="Close scanner">${icon('close')}</button><div><span class="ticket-camera-eyebrow">DRIVERPAY PRO</span><h1>Scan ticket</h1></div><button type="button" class="ticket-camera-icon" data-action="flash" aria-label="Turn on flashlight" aria-pressed="false" hidden>${icon('flash')}</button></header>
      <div class="ticket-camera-stage"><video playsinline muted autoplay></video><canvas class="ticket-camera-preview" hidden></canvas><canvas class="ticket-camera-outline" aria-hidden="true"></canvas><div class="ticket-camera-corners" hidden>${['Top left','Top right','Bottom right','Bottom left'].map((label,i)=>`<button type="button" data-corner="${i}" aria-label="${label} crop corner. Use arrow keys to adjust."></button>`).join('')}</div><div class="ticket-camera-error" hidden><strong></strong><p></p><button type="button" data-action="retry">Resume Camera</button><button type="button" data-action="photos">Choose Photo</button></div></div>
      <footer class="ticket-camera-footer"><div class="ticket-camera-status" role="status" aria-live="polite">Opening camera…</div><div class="ticket-camera-progress" role="progressbar" aria-label="Automatic capture readiness" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span></span></div><div class="ticket-camera-live-actions"><button type="button" data-action="photos" class="ticket-camera-secondary">${icon('photo')}<span>Photos</span></button><button type="button" data-action="capture" class="ticket-camera-shutter" aria-label="Capture ticket now" disabled><span></span></button><button type="button" data-action="auto" class="ticket-camera-secondary" aria-pressed="true">${icon('check')}<span>Auto on</span></button></div><div class="ticket-camera-review-actions" hidden><button type="button" data-action="retake">Retake</button><button type="button" data-action="crop">${icon('crop')} Adjust edges</button><button type="button" data-action="save" class="ticket-camera-primary">Save ticket</button></div><div class="ticket-camera-crop-actions" hidden><button type="button" data-action="retake">Retake</button><button type="button" data-action="apply" class="ticket-camera-primary">Apply crop</button></div><p class="ticket-camera-hint">Show the whole ticket. Capture starts when the outline is steady.</p></footer>
      <input class="ticket-camera-file" type="file" accept="image/*,.heic,.heif" aria-label="Select a ticket photo" tabindex="-1">`;
    document.body.append(this.root);
    this.video=this.root.querySelector('video');this.overlay=this.root.querySelector('.ticket-camera-outline');this.preview=this.root.querySelector('.ticket-camera-preview');this.stage=this.root.querySelector('.ticket-camera-stage');
    this.root.addEventListener('click',event=>{
      const action=event.target.closest('[data-action]')?.dataset.action;
      if(!action||this.mode==='saving')return;
      if(action==='close')this.close();
      if(action==='retry'||action==='retake')this.startCamera();
      if(action==='photos')this.root.querySelector('input').click();
      if(action==='auto'){this.auto=!this.auto;this.gate.reset();const button=this.button('auto');button.setAttribute('aria-pressed',String(this.auto));button.querySelector('span').textContent=this.auto?'Auto on':'Auto off';}
      if(action==='capture')this.manualCapture();
      if(action==='crop')this.editCrop();
      if(action==='rotate'&&this.mode==='review'){this.quarterTurns=(this.quarterTurns+1)%4;this.renderReview();}
      if(action==='apply')this.process();
      if(action==='save')this.save();
    });
    this.root.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();if(this.mode!=='saving')this.close();}
      if(event.key==='Tab'){
        const buttons=[...this.root.querySelectorAll('button:not(:disabled)')].filter(b=>b.getClientRects().length);
        const first=buttons[0],last=buttons.at(-1);
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    });
    this.root.querySelector('input').addEventListener('change',event=>{const file=event.target.files[0];event.target.value='';if(file)this.importPhoto(file);});
    const handles=this.root.querySelector('.ticket-camera-corners');
    handles.insertAdjacentHTML('beforeend',['Top','Right','Bottom','Left'].map((label,i)=>`<button type="button" data-side="${i}" aria-label="${label} crop side. Drag to move the whole side."></button>`).join(''));
    this.loupe=makeCanvas();this.loupe.className='ticket-camera-loupe';this.loupe.hidden=true;this.loupe.setAttribute('aria-hidden','true');this.stage.append(this.loupe);
    const rotate=document.createElement('button');rotate.type='button';rotate.dataset.action='rotate';rotate.setAttribute('aria-label','Rotate ticket 90 degrees clockwise');rotate.innerHTML=`${icon('rotate')} Rotate`;
    this.button('crop').before(rotate);
    this.button('crop').innerHTML=`${icon('crop')} Adjust crop`;
    this.bindCorners();this.button('close').focus();
    this.resize=new ResizeObserver(()=>this.paint());this.resize.observe(this.stage);
    await this.startCamera();
  }

  button(action){return this.root?.querySelector(`[data-action="${action}"]`);}
  status(message,progress=0){
    if(!this.root)return;
    const label=this.root.querySelector('.ticket-camera-status');if(label.textContent!==message)label.textContent=message;
    this.progress=progress;this.root.querySelector('.ticket-camera-progress span').style.width=`${progress*100}%`;
    this.root.querySelector('.ticket-camera-progress').setAttribute('aria-valuenow',String(Math.round(progress*100)));
  }
  setMode(mode){
    this.mode=mode;if(!this.root)return;
    if(mode!=='crop'){this.adjustment=null;if(this.loupe)this.loupe.hidden=true;}
    this.root.dataset.mode=mode;
    this.root.querySelector('.ticket-camera-live-actions').hidden=!['live','loading','error'].includes(mode);
    this.root.querySelector('.ticket-camera-review-actions').hidden=!['review','saving'].includes(mode);
    this.root.querySelector('.ticket-camera-crop-actions').hidden=mode!=='crop';
    this.root.querySelector('.ticket-camera-corners').hidden=mode!=='crop';
    this.video.hidden=!['live','loading','error'].includes(mode);this.preview.hidden=['live','loading','error'].includes(mode);
    this.root.querySelector('.ticket-camera-hint').textContent=mode==='crop'?'Drag a corner or side. The zoom preview shows the exact adjustment point.':mode==='review'?'Rotate or adjust the crop, then save your ticket.':'Show the whole ticket. Capture starts when the outline is steady.';
  }
  workerReady(){
    if(this.worker)return;
    this.worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});
    this.worker.onmessage=({data})=>{const request=this.requests.get(data.id);if(!request)return;clearTimeout(request.timer);this.requests.delete(data.id);data.error?request.reject(new Error(data.error)):request.resolve(data.result);};
    this.worker.onerror=()=>this.disposeWorker(new Error('Image processing could not start. Close the scanner and try again.'));
  }
  disposeWorker(error=new Error('Scan cancelled')){
    this.worker?.terminate();this.worker=null;
    for(const request of this.requests.values()){clearTimeout(request.timer);request.reject(error);}this.requests.clear();
  }
  request(type,image,corners){
    this.workerReady();const id=++this.requestId;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>this.disposeWorker(new Error('Image processing timed out. Please try again.')),type==='process'?25000:8000);
      this.requests.set(id,{resolve,reject,timer});
      this.worker.postMessage({id,type,width:image.width,height:image.height,buffer:image.data.buffer,corners},[image.data.buffer]);
    });
  }
  stopCamera(){
    this.cameraAttempt=(this.cameraAttempt||0)+1;
    cancelAnimationFrame(this.raf);this.raf=0;
    if(this.frameCallback!=null&&this.video?.cancelVideoFrameCallback)this.video.cancelVideoFrameCallback(this.frameCallback);
    else if(this.frameCallback!=null)cancelAnimationFrame(this.frameCallback);
    this.frameCallback=null;this.stream?.getTracks().forEach(track=>track.stop());this.stream=null;
    if(this.video){this.video.pause();this.video.srcObject=null;}
    this.target=null;this.display=null;this.filter.reset();this.gate.reset();this.lastDetection=null;
    this.button('flash')?.setAttribute('hidden','');
  }
  async startCamera(){
    if(!this.root)return;
    this.stopCamera();this.session++;const session=this.session,attempt=this.cameraAttempt;
    this.source=null;this.processed=null;this.quarterTurns=0;this.dataUrl=null;this.corners=null;this.busy=false;this.lastVideoTime=-1;this.lastAnalysis=0;
    this.root.querySelector('.ticket-camera-error').hidden=true;this.setMode('loading');this.status('Opening camera…');this.button('capture').disabled=true;
    this.preview.getContext('2d').clearRect(0,0,this.preview.width,this.preview.height);this.paint();
    try {
      this.workerReady();this.worker.postMessage({type:'reset'});
      if(!navigator.mediaDevices?.getUserMedia)throw new Error('This browser cannot open the camera. Open the app in Safari or choose a photo.');
      const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1440},frameRate:{ideal:30,max:30}}});
      if(!this.root||session!==this.session||attempt!==this.cameraAttempt){stream.getTracks().forEach(t=>t.stop());return;}
      this.stream=stream;this.video.srcObject=stream;await this.video.play();
      if(!this.root||session!==this.session||attempt!==this.cameraAttempt)return;
      const track=stream.getVideoTracks()[0],caps=track.getCapabilities?.()||{},settings={};
      if(caps.focusMode?.includes('continuous'))settings.focusMode='continuous';
      if(caps.exposureMode?.includes('continuous'))settings.exposureMode='continuous';
      if(Object.keys(settings).length)track.applyConstraints({advanced:[settings]}).catch(()=>{});
      this.torch=false;this.button('flash').hidden=!caps.torch;this.button('flash').setAttribute('aria-pressed','false');
      this.button('flash').onclick=async()=>{try{this.torch=!this.torch;await track.applyConstraints({advanced:[{torch:this.torch}]});this.button('flash')?.setAttribute('aria-pressed',String(this.torch));this.gate.reset();}catch{this.torch=false;this.status('Flashlight is unavailable on this camera.');}};
      this.setMode('live');this.status('Show all four ticket edges');this.button('capture').disabled=false;
      this.startFrames(session);this.animate(session);
    }catch(error){if(this.root&&session===this.session)this.showError('Camera access needed',error.name==='NotAllowedError'?'Allow camera access in your browser, then tap Resume Camera.':error.message||'Could not open the camera. Try again or choose a photo.');}
  }
  showError(title,message){
    this.setMode('error');this.button('capture').disabled=true;
    const panel=this.root.querySelector('.ticket-camera-error');panel.hidden=false;panel.querySelector('strong').textContent=title;panel.querySelector('p').textContent=message;this.status('Camera paused');
  }
  startFrames(session){
    const tick=(now,metadata)=>{
      if(!this.root||this.mode!=='live'||session!==this.session)return;
      this.queueFrame(tick);
      const mediaTime=metadata?.mediaTime??this.video.currentTime;
      if(document.hidden||this.busy||now-this.lastAnalysis<85||mediaTime===this.lastVideoTime||this.video.readyState<2)return;
      this.lastAnalysis=now;this.lastVideoTime=mediaTime;this.analyze(session,now);
    };
    this.queueFrame(tick);
  }
  queueFrame(callback){this.frameCallback=this.video.requestVideoFrameCallback?this.video.requestVideoFrameCallback(callback):requestAnimationFrame(callback);}
  snapshot(source,maxEdge=2000){
    const w=source.videoWidth||source.naturalWidth||source.width,h=source.videoHeight||source.naturalHeight||source.height;
    if(!w||!h)throw new Error('The camera is not ready yet.');
    const scale=Math.min(1,maxEdge/Math.max(w,h)),canvas=makeCanvas();canvas.width=Math.round(w*scale);canvas.height=Math.round(h*scale);canvas.getContext('2d').drawImage(source,0,0,canvas.width,canvas.height);return canvas;
  }
  async analyze(session,now){
    this.busy=true;
    try {
      // Retain the exact full-resolution frame whose edges are being measured.
      const source=this.snapshot(this.video),small=this.snapshot(source,480),image=small.getContext('2d',{willReadFrequently:true}).getImageData(0,0,small.width,small.height);
      const result=await this.request('detect',image);
      if(!this.root||session!==this.session||this.mode!=='live'||document.hidden)return;
      // Keep the matching sensor frame for capture. A 300 ms deadline discarded
      // every result on slower phones, so the countdown could never start.
      const fresh=performance.now()-now<1200;
      if(!fresh)this.gate.reset();
      if(result){
        const normalized=alignCorners(result.corners.map(p=>({x:p.x/small.width,y:p.y/small.height})),this.filter.raw);
        this.target=this.filter.update(normalized,now);this.lastSeen=performance.now();
        this.lastDetection={source,corners:normalized,time:now};
        const gate=this.gate.update(fresh?{...result,corners:normalized}:null,now);
        this.status(this.auto?gate.message:'Ticket found · tap capture',this.auto?gate.progress:0);
        if(this.auto&&gate.capture){this.source=source;this.corners=normalized;this.stopCamera();await this.process();}
      }else{
        const gate=this.gate.update(null,now);this.lastDetection=null;this.status(this.auto?gate.message:'Show all four ticket edges',this.auto?gate.progress:0);
        if(performance.now()-this.lastSeen>250){this.target=null;this.display=null;this.filter.reset();}
      }
    }catch(error){if(this.root&&session===this.session&&this.mode==='live'){this.stopCamera();this.showError('Scanner paused',error.message);}}
    finally{if(session===this.session)this.busy=false;}
  }
  animate(session){
    if(!this.root||session!==this.session||this.mode!=='live')return;
    this.paint();this.raf=requestAnimationFrame(()=>this.animate(session));
  }
  fit(w,h){const rect=this.stage.getBoundingClientRect(),scale=Math.min(rect.width/w,rect.height/h);return {x:(rect.width-w*scale)/2,y:(rect.height-h*scale)/2,w:w*scale,h:h*scale};}
  paint(){
    if(!this.root)return;
    const rect=this.stage.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1),width=Math.round(rect.width*dpr),height=Math.round(rect.height*dpr);
    if(this.overlay.width!==width||this.overlay.height!==height){this.overlay.width=width;this.overlay.height=height;}
    const ctx=this.overlay.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,rect.width,rect.height);
    let corners=null;
    if(this.mode==='crop')corners=this.corners;
    else if(this.mode==='live'&&this.target&&performance.now()-this.lastSeen<350){
      if(!this.display)this.display=this.target.map(p=>({...p}));
      const now=performance.now(),dt=Math.min(50,now-(this.lastPaint||now));this.lastPaint=now;const alpha=1-Math.exp(-dt/28);
      this.display=this.display.map((p,i)=>({x:p.x+(this.target[i].x-p.x)*alpha,y:p.y+(this.target[i].y-p.y)*alpha}));corners=this.display;
    }
    if(!corners)return;
    const fit=this.mode==='crop'?this.fit(this.source.width,this.source.height):this.fit(this.video.videoWidth||1,this.video.videoHeight||1),pts=corners.map(p=>({x:fit.x+p.x*fit.w,y:fit.y+p.y*fit.h}));
    ctx.fillStyle='rgba(6,18,30,.38)';ctx.beginPath();ctx.rect(0,0,rect.width,rect.height);ctx.moveTo(pts[0].x,pts[0].y);for(let i=3;i>=0;i--)ctx.lineTo(pts[i].x,pts[i].y);ctx.fill('evenodd');
    ctx.strokeStyle=this.progress>.15?'#34d399':'#60a5fa';ctx.lineWidth=2.5;ctx.lineJoin='round';ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.stroke();
    for(let i=0;i<4;i++){
      ctx.beginPath();ctx.fillStyle='#fff';ctx.arc(pts[i].x,pts[i].y,4,0,Math.PI*2);ctx.fill();
      if(this.mode==='crop'){
        const button=this.root.querySelector(`[data-corner="${i}"]`);button.style.left=`${pts[i].x}px`;button.style.top=`${pts[i].y}px`;
        const next=pts[(i+1)%4],side=this.root.querySelector(`[data-side="${i}"]`);
        side.style.left=`${(pts[i].x+next.x)/2}px`;side.style.top=`${(pts[i].y+next.y)/2}px`;
        side.style.setProperty('--edge-angle',`${Math.atan2(next.y-pts[i].y,next.x-pts[i].x)}rad`);
      }
    }
    this.paintLoupe(fit,rect);
  }
  adjustmentPoint(kind,index){
    const a=this.corners[index],b=this.corners[(index+1)%4];
    return kind==='side'?{x:(a.x+b.x)/2,y:(a.y+b.y)/2}:a;
  }
  paintLoupe(fit,rect){
    if(!this.loupe||!this.adjustment||this.mode!=='crop')return;
    const {kind,index,finger}=this.adjustment,point=this.adjustmentPoint(kind,index);
    const position=loupePosition(finger||{x:fit.x+point.x*fit.w,y:fit.y+point.y*fit.h},rect.width,rect.height);
    this.loupe.hidden=false;this.loupe.style.left=`${position.x-position.size/2}px`;this.loupe.style.top=`${position.y-position.size/2}px`;
    this.loupe.style.width=`${position.size}px`;this.loupe.style.height=`${position.size}px`;
    const dpr=Math.min(2,window.devicePixelRatio||1);this.loupe.width=this.loupe.height=Math.round(position.size*dpr);
    const ctx=this.loupe.getContext('2d'),mid=position.size/2,scale=fit.w/this.source.width*2.5;
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#111827';ctx.fillRect(0,0,position.size,position.size);
    ctx.drawImage(this.source,mid-point.x*this.source.width*scale,mid-point.y*this.source.height*scale,this.source.width*scale,this.source.height*scale);
    ctx.strokeStyle='#60a5fa';ctx.lineWidth=1.5;ctx.beginPath();
    this.corners.forEach((p,i)=>{const x=mid+(p.x-point.x)*this.source.width*scale,y=mid+(p.y-point.y)*this.source.height*scale;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.closePath();ctx.stroke();
    for(const [color,width] of [['#fff',4],['#1d4ed8',1.5]]){
      ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(mid-12,mid);ctx.lineTo(mid+12,mid);ctx.moveTo(mid,mid-12);ctx.lineTo(mid,mid+12);ctx.stroke();
    }
  }
  async manualCapture(){
    if(this.mode!=='live')return;
    const detection=this.lastDetection;
    if(detection&&performance.now()-detection.time<350){this.source=detection.source;this.corners=detection.corners;}
    else {this.source=this.snapshot(this.video);this.corners=null;}
    this.stopCamera();if(this.corners)await this.process();else this.editCrop();
  }
  async importPhoto(file){
    const session=++this.session;this.stopCamera();this.setMode('processing');this.status('Opening photo…');this.root.querySelector('.ticket-camera-error').hidden=true;
    this.quarterTurns=0;this.processed=null;
    const url=URL.createObjectURL(file);
    try{
      const image=new Image();image.src=url;await image.decode();if(!this.root||session!==this.session)return;
      this.source=this.snapshot(image,2200);const small=this.snapshot(this.source,640),found=await this.request('detect',small.getContext('2d').getImageData(0,0,small.width,small.height));
      if(!this.root||session!==this.session)return;
      this.corners=found?found.corners.map(p=>({x:p.x/small.width,y:p.y/small.height})):null;
      if(this.corners)await this.process();else this.editCrop();
    }catch(error){if(this.root&&session===this.session)this.showError('Could not open photo',error.message||'Choose a JPEG or PNG ticket photo.');}
    finally{URL.revokeObjectURL(url);}
  }
  editCrop(){
    if(!this.source)return;
    this.setMode('crop');this.status('Adjust the ticket corners or sides');
    this.corners ||= [{x:.12,y:.1},{x:.88,y:.1},{x:.88,y:.9},{x:.12,y:.9}];
    this.preview.width=this.source.width;this.preview.height=this.source.height;this.preview.getContext('2d').drawImage(this.source,0,0);this.paint();
  }
  bindCorners(){
    for(const button of this.root.querySelectorAll('[data-corner],[data-side]')){
      const kind=button.hasAttribute('data-side')?'side':'corner',i=Number(button.dataset.side??button.dataset.corner);let drag=null;
      const end=()=>{drag=null;this.adjustment=null;this.loupe.hidden=true;};
      button.addEventListener('pointerdown',event=>{
        if(this.mode!=='crop'||this.adjustment?.finger)return;event.preventDefault();
        drag={id:event.pointerId,x:event.clientX,y:event.clientY,corners:this.corners.map(p=>({...p}))};button.setPointerCapture(event.pointerId);
        const box=this.stage.getBoundingClientRect();this.adjustment={kind,index:i,finger:{x:event.clientX-box.left,y:event.clientY-box.top}};this.paint();
      });
      button.addEventListener('pointerup',event=>{if(drag?.id===event.pointerId)end();});button.addEventListener('pointercancel',end);button.addEventListener('lostpointercapture',end);button.addEventListener('blur',end);
      button.addEventListener('pointermove',event=>{
        if(!drag||drag.id!==event.pointerId||this.mode!=='crop')return;
        const box=this.stage.getBoundingClientRect(),fit=this.fit(this.source.width,this.source.height);
        this.corners=moveCropHandle(drag.corners,kind,i,(event.clientX-drag.x)/fit.w,(event.clientY-drag.y)/fit.h,this.source.width,this.source.height);
        this.adjustment={kind,index:i,finger:{x:event.clientX-box.left,y:event.clientY-box.top}};this.paint();
      });
      button.addEventListener('keydown',event=>{
        const delta={ArrowLeft:[-.002,0],ArrowRight:[.002,0],ArrowUp:[0,-.002],ArrowDown:[0,.002]}[event.key];
        if(!delta||this.mode!=='crop')return;event.preventDefault();this.corners=moveCropHandle(this.corners,kind,i,delta[0],delta[1],this.source.width,this.source.height);this.adjustment={kind,index:i};this.paint();
      });
    }
  }
  async process(){
    if(!this.source||!this.corners)return;
    const session=this.session,corners=this.corners.map(p=>({x:p.x*this.source.width,y:p.y*this.source.height}));
    if(!validQuad(corners,this.source.width,this.source.height,.015)){this.status('Keep the crop corners in order around the ticket.');return;}
    this.setMode('processing');this.status('Straightening · cleaning · sharpening');this.paint();
    try{
      const data=this.source.getContext('2d',{willReadFrequently:true}).getImageData(0,0,this.source.width,this.source.height),result=await this.request('process',data,corners);
      if(!this.root||session!==this.session)return;
      this.processed=makeCanvas();this.processed.width=result.width;this.processed.height=result.height;this.processed.getContext('2d').putImageData(new ImageData(result.pixels,result.width,result.height),0,0);
      this.renderReview();navigator.vibrate?.(30);this.button('save').focus();
    }catch(error){if(this.root&&session===this.session){this.editCrop();this.status(error.message);}}
  }
  renderReview(){
    if(!this.processed)return;
    const turns=this.quarterTurns||0,w=this.processed.width,h=this.processed.height;
    this.preview.width=turns%2?h:w;this.preview.height=turns%2?w:h;
    const ctx=this.preview.getContext('2d');ctx.translate(this.preview.width/2,this.preview.height/2);ctx.rotate(turns*Math.PI/2);ctx.drawImage(this.processed,-w/2,-h/2);
    this.dataUrl=this.preview.toDataURL('image/jpeg',.94);this.setMode('review');this.status('Ticket captured',1);this.paint();
  }
  async save(){
    if(this.mode!=='review'||!this.dataUrl)return;
    this.setMode('saving');this.status('Saving ticket…');for(const button of this.root.querySelectorAll('button'))button.disabled=true;
    try{await this.options.onSave(this.dataUrl,'black-white');this.close();}
    catch(error){if(this.root){this.setMode('review');this.status(error.message||'Could not save. Please try again.');for(const button of this.root.querySelectorAll('button'))button.disabled=false;}}
  }
  close(){
    if(!this.root)return;
    this.session++;this.stopCamera();this.disposeWorker();this.resize?.disconnect();this.root.remove();this.root=null;this.source=null;this.processed=null;this.adjustment=null;this.dataUrl=null;this.options?.onClose?.();this.priorFocus?.focus?.();
  }
}

window.DriverTicketScanner=new TicketScanner();
window.dispatchEvent(new Event('driverpay:scanner-ready'));

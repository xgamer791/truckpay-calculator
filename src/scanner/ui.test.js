// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

let scanner,stop,requests,frames,clock;
const good={corners:[{x:64,y:34},{x:256,y:34},{x:256,y:246},{x:64,y:246}],confidence:.94,areaRatio:.45,brightness:210,sharpness:200,inkRatio:.08,clipped:false};
let detection, detectionDelay;
class TestWorker {
  postMessage(message){
    requests.push(message);
    if(message.type==='reset')return;
    const result=message.type==='detect'?detection:{width:190,height:210,pixels:new Uint8ClampedArray(190*210*4).fill(255)};
    setTimeout(()=>this.onmessage?.({data:{id:message.id,result}}),message.type==='detect'?detectionDelay:1);
  }
  terminate(){this.onmessage=null;}
}

beforeEach(async()=>{
  vi.resetModules();vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']});
  document.body.innerHTML='<button id="launch">Open camera</button>';
  requests=[];frames=0;clock=0;detection=good;detectionDelay=1;
  stop=vi.fn();
  vi.stubGlobal('Worker',TestWorker);vi.stubGlobal('ResizeObserver',class{observe(){} disconnect(){}});
  vi.stubGlobal('requestAnimationFrame',cb=>setTimeout(()=>cb(performance.now()),16));vi.stubGlobal('cancelAnimationFrame',id=>clearTimeout(id));
  vi.stubGlobal('ImageData',class{constructor(data,width,height){this.data=data;this.width=width;this.height=height;}});
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:vi.fn(async()=>({getTracks:()=>[{stop}],getVideoTracks:()=>[{stop,getCapabilities:()=>({}),applyConstraints:vi.fn()}]}))}});
  Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});
  vi.spyOn(HTMLMediaElement.prototype,'play').mockResolvedValue();vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{});
  Object.defineProperties(HTMLVideoElement.prototype,{videoWidth:{configurable:true,get:()=>320},videoHeight:{configurable:true,get:()=>280},readyState:{configurable:true,get:()=>4}});
  HTMLVideoElement.prototype.requestVideoFrameCallback=function(callback){return setTimeout(()=>{frames++;clock+=.1;callback(performance.now(),{mediaTime:clock});},100);};
  HTMLVideoElement.prototype.cancelVideoFrameCallback=id=>clearTimeout(id);
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockImplementation(function(){const canvas=this;return {drawImage:vi.fn(),clearRect:vi.fn(),fillRect:vi.fn(),translate:vi.fn(),rotate:vi.fn(),setTransform:vi.fn(),beginPath:vi.fn(),rect:vi.fn(),moveTo:vi.fn(),lineTo:vi.fn(),fill:vi.fn(),stroke:vi.fn(),closePath:vi.fn(),arc:vi.fn(),putImageData:vi.fn(),getImageData:()=>({width:canvas.width,height:canvas.height,data:new Uint8ClampedArray(canvas.width*canvas.height*4)})};});
  vi.spyOn(HTMLCanvasElement.prototype,'toDataURL').mockReturnValue('data:image/jpeg;base64,TEST');
  vi.spyOn(Element.prototype,'getBoundingClientRect').mockReturnValue({width:390,height:600,left:0,top:0,right:390,bottom:600});
  await import('./ui.js');scanner=window.DriverTicketScanner;
});
afterEach(()=>{scanner?.close();document.removeEventListener('visibilitychange',scanner?.onVisibility);vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});

describe('scanner camera lifecycle',()=>{
  it('moves a whole side from a touch drag and shows a bounded magnified point until release',async()=>{
    detection=null;await scanner.open({onSave:vi.fn()});await vi.advanceTimersByTimeAsync(300);
    document.querySelector('[data-action=capture]').click();
    const side=document.querySelector('[data-side="1"]'),before=scanner.corners.map(p=>({...p}));
    side.setPointerCapture=vi.fn();
    const pointer=(type,x,y)=>{const event=new MouseEvent(type,{bubbles:true,clientX:x,clientY:y});Object.defineProperty(event,'pointerId',{value:1});side.dispatchEvent(event);};
    pointer('pointerdown',343,300);pointer('pointermove',304,300);
    expect(scanner.corners[1].x).toBeCloseTo(before[1].x-.1);
    expect(scanner.corners[2].x).toBeCloseTo(before[2].x-.1);
    expect(scanner.corners[0]).toEqual(before[0]);expect(scanner.corners[3]).toEqual(before[3]);
    expect(scanner.loupe.hidden).toBe(false);
    expect(parseFloat(scanner.loupe.style.left)).toBeGreaterThanOrEqual(0);
    expect(parseFloat(scanner.loupe.style.left)+parseFloat(scanner.loupe.style.width)).toBeLessThanOrEqual(390);
    pointer('pointerup',304,300);expect(scanner.loupe.hidden).toBe(true);
    side.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));
    expect(scanner.corners[1].x).toBeCloseTo(before[1].x-.102);
    side.dispatchEvent(new Event('blur'));expect(scanner.loupe.hidden).toBe(true);
  });
  it('auto captures through brief lost edges in the live camera loop',async()=>{
    await scanner.open({onSave:vi.fn()});
    for(let i=0;i<26&&scanner.mode==='live';i++){
      detection=i%4===3?null:good;await vi.advanceTimersByTimeAsync(100);
    }
    await vi.advanceTimersByTimeAsync(20);
    expect(scanner.mode).toBe('review');expect(requests.filter(r=>r.type==='process')).toHaveLength(1);
  });
  it('rotates the saved image and preserves orientation after adjusting the crop',async()=>{
    await scanner.open({onSave:vi.fn()});await vi.advanceTimersByTimeAsync(1800);
    const rotate=document.querySelector('[data-action=rotate]');
    expect(rotate.textContent).toContain('Rotate');
    rotate.click();expect(scanner.preview.width).toBe(210);expect(scanner.preview.height).toBe(190);
    document.querySelector('[data-action=crop]').click();
    expect(document.querySelectorAll('[data-side]')).toHaveLength(4);
    document.querySelector('[data-action=apply]').click();await vi.advanceTimersByTimeAsync(20);
    expect(scanner.preview.width).toBe(210);expect(scanner.preview.height).toBe(190);
    for(let i=0;i<3;i++)rotate.click();
    expect(scanner.preview.width).toBe(190);expect(scanner.preview.height).toBe(210);
  });
  it.each([450,800])('auto captures with %i ms of camera processing latency',async(delay)=>{
    detectionDelay=delay;
    await scanner.open({onSave:vi.fn()});
    await vi.advanceTimersByTimeAsync(5000);
    expect(scanner.mode).toBe('review');
    expect(requests.filter(r=>r.type==='process')).toHaveLength(1);
    expect(stop).toHaveBeenCalled();
  });
  it('does not auto capture a stalled worker result',async()=>{
    detectionDelay=2000;
    await scanner.open({onSave:vi.fn()});
    await vi.advanceTimersByTimeAsync(6500);
    expect(scanner.mode).toBe('live');
    expect(requests.filter(r=>r.type==='process')).toHaveLength(0);
  });
  it('automatically captures once, stops the stream and saves only after review',async()=>{
    const onSave=vi.fn().mockResolvedValue();await scanner.open({onSave});
    await vi.advanceTimersByTimeAsync(1800);
    expect(document.querySelector('.ticket-camera').dataset.mode).toBe('review');
    expect(requests.filter(r=>r.type==='process')).toHaveLength(1);expect(stop).toHaveBeenCalled();expect(onSave).not.toHaveBeenCalled();
    const processed=requests.find(r=>r.type==='process');expect(processed.width).toBe(320);expect(processed.height).toBe(280);expect(processed.corners[0].x).toBeCloseTo(64);
    document.querySelector('[data-action=save]').click();await vi.advanceTimersByTimeAsync(10);
    expect(onSave).toHaveBeenCalledWith('data:image/jpeg;base64,TEST','black-white');expect(document.querySelector('.ticket-camera')).toBeNull();
  });
  it('allows manual cropping when no edges are detected and rejects crossed corners',async()=>{
    detection=null;await scanner.open({onSave:vi.fn()});await vi.advanceTimersByTimeAsync(300);
    document.querySelector('[data-action=capture]').click();
    expect(scanner.mode).toBe('crop');expect(stop).toHaveBeenCalled();expect(requests.filter(r=>r.type==='process')).toHaveLength(0);
    const p=scanner.corners[1];scanner.corners[1]=scanner.corners[2];scanner.corners[2]=p;
    document.querySelector('[data-action=apply]').click();await vi.advanceTimersByTimeAsync(10);
    expect(scanner.mode).toBe('crop');expect(requests.filter(r=>r.type==='process')).toHaveLength(0);
    scanner.corners=good.corners.map(p=>({x:p.x/320,y:p.y/280}));document.querySelector('[data-action=apply]').click();await vi.advanceTimersByTimeAsync(20);
    expect(scanner.mode).toBe('review');
  });
  it('keeps the captured ticket available when saving fails',async()=>{
    await scanner.open({onSave:vi.fn().mockRejectedValue(new Error('Storage is full'))});await vi.advanceTimersByTimeAsync(1800);
    document.querySelector('[data-action=save]').click();await vi.advanceTimersByTimeAsync(10);
    expect(scanner.mode).toBe('review');expect(scanner.dataUrl).toBeTruthy();expect(document.querySelector('.ticket-camera-status').textContent).toBe('Storage is full');expect(document.querySelector('[data-action=save]').disabled).toBe(false);
  });
  it('stops a stream granted after the scanner has already closed',async()=>{
    let grant;navigator.mediaDevices.getUserMedia=vi.fn(()=>new Promise(resolve=>{grant=resolve;}));
    const opening=scanner.open({onSave:vi.fn()});scanner.close();grant({getTracks:()=>[{stop}]});await opening;
    expect(stop).toHaveBeenCalledTimes(1);expect(document.querySelector('.ticket-camera')).toBeNull();
  });
  it('stops the camera in the background and clears capture readiness before resuming',async()=>{
    await scanner.open({onSave:vi.fn()});await vi.advanceTimersByTimeAsync(800);
    Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));
    expect(stop).toHaveBeenCalled();expect(scanner.mode).toBe('error');expect(scanner.gate.anchor).toBeNull();
    await vi.advanceTimersByTimeAsync(1800);expect(requests.filter(r=>r.type==='process')).toHaveLength(0);
    Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.querySelector('[data-action=retry]').click();await vi.advanceTimersByTimeAsync(800);
    expect(scanner.mode).toBe('live');expect(requests.filter(r=>r.type==='process')).toHaveLength(0);
  });
});

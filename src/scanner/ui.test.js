// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const readerMock=vi.hoisted(()=>vi.fn());
vi.mock('../ticket-reader/browser.js',()=>({readTicket:readerMock}));
const matched={version:2,status:'matched',plant:'colorado-materials',ticketNumber:'3556031',confidence:.99,quarterTurns:0};
let scanner,stop,requests,frames,clock;
const good={corners:[{x:64,y:34},{x:256,y:34},{x:256,y:246},{x:64,y:246}],confidence:.94,areaRatio:.45,brightness:210,sharpness:200,inkRatio:.08,clipped:false};
let detection, detectionDelay, quality;
class TestWorker {
  postMessage(message){
    requests.push(message);
    if(message.type==='reset')return;
    const result=message.type==='detect'?(detection?{...detection,corners:detection.corners.map(p=>({x:p.x*message.width/320,y:p.y*message.height/280}))}:null):message.type==='quality'?quality:{width:190,height:210,pixels:new Uint8ClampedArray(190*210*4).fill(255)};
    setTimeout(()=>this.onmessage?.({data:{id:message.id,result}}),message.type==='detect'?detectionDelay:1);
  }
  terminate(){this.onmessage=null;}
}

beforeEach(async()=>{
  vi.resetModules();vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']});
  document.body.innerHTML='<button id="launch">Open camera</button>';
  requests=[];frames=0;clock=0;detection=good;detectionDelay=1;quality={ready:true,close:true,focused:true};
  stop=vi.fn();readerMock.mockReset().mockResolvedValue(matched);
  vi.stubGlobal('Worker',TestWorker);vi.stubGlobal('ResizeObserver',class{observe(){} disconnect(){}});
  vi.stubGlobal('requestAnimationFrame',cb=>setTimeout(()=>cb(performance.now()),16));vi.stubGlobal('cancelAnimationFrame',id=>clearTimeout(id));
  vi.stubGlobal('ImageData',class{constructor(data,width,height){this.data=data;this.width=width;this.height=height;}});
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:vi.fn(async()=>({getTracks:()=>[{stop}],getVideoTracks:()=>[{stop,getCapabilities:()=>({}),applyConstraints:vi.fn()}]}))}});
  Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});
  vi.spyOn(HTMLMediaElement.prototype,'play').mockResolvedValue();vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{});
  Object.defineProperties(HTMLVideoElement.prototype,{videoWidth:{configurable:true,get:()=>320},videoHeight:{configurable:true,get:()=>280},readyState:{configurable:true,get:()=>4},currentTime:{configurable:true,get:()=>0}});
  HTMLVideoElement.prototype.requestVideoFrameCallback=function(callback){return setTimeout(()=>{frames++;clock+=.1;callback(performance.now(),{mediaTime:clock});},100);};
  HTMLVideoElement.prototype.cancelVideoFrameCallback=id=>clearTimeout(id);
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockImplementation(function(){const canvas=this;return {drawImage:vi.fn(),clearRect:vi.fn(),fillRect:vi.fn(),translate:vi.fn(),rotate:vi.fn(),setTransform:vi.fn(),setLineDash:vi.fn(),beginPath:vi.fn(),rect:vi.fn(),moveTo:vi.fn(),lineTo:vi.fn(),fill:vi.fn(),stroke:vi.fn(),closePath:vi.fn(),arc:vi.fn(),putImageData:vi.fn(),getImageData:()=>({width:canvas.width,height:canvas.height,data:new Uint8ClampedArray(canvas.width*canvas.height*4)})};});
  vi.spyOn(HTMLCanvasElement.prototype,'toDataURL').mockReturnValue('data:image/png;base64,TEST');
  vi.spyOn(Element.prototype,'getBoundingClientRect').mockReturnValue({width:390,height:600,left:0,top:0,right:390,bottom:600});
  await import('./ui.js');scanner=window.DriverTicketScanner;
});
afterEach(()=>{scanner?.close();document.removeEventListener('visibilitychange',scanner?.onVisibility);vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});

async function capture(){await vi.advanceTimersByTimeAsync(650);scanner.button('capture').click();await vi.advanceTimersByTimeAsync(30);}
describe('quality-gated manual capture and automatic verified saving',()=>{
  it('never takes a photo automatically and has no auto capture control or countdown',async()=>{
    await scanner.open({onSave:vi.fn()});await vi.advanceTimersByTimeAsync(8000);
    expect(scanner.mode).toBe('live');expect(scanner.outline.sample(performance.now()).tracked).toBe(true);
    expect(requests.filter(r=>r.type==='process')).toHaveLength(0);
    expect(document.querySelector('[data-action=auto]')).toBeNull();expect(document.querySelector('[role=progressbar]')).toBeNull();
  });
  it('shows red and Move closer until steady focus, then green with no guidance text',async()=>{
    await scanner.open({onSave:vi.fn()});
    expect(scanner.root.dataset.ready).toBe('false');expect(scanner.button('capture').disabled).toBe(true);
    expect(document.querySelector('.ticket-camera-status').textContent).toBe('Move closer');
    await vi.advanceTimersByTimeAsync(650);
    expect(scanner.root.dataset.ready).toBe('true');expect(scanner.button('capture').disabled).toBe(false);
    expect(document.querySelector('.ticket-camera-status').textContent).toBe('');
    expect(document.querySelector('.ticket-camera-hint').hidden).toBe(true);
    quality={ready:false,close:true,focused:false};await vi.advanceTimersByTimeAsync(200);
    expect(scanner.root.dataset.ready).toBe('false');expect(scanner.button('capture').disabled).toBe(true);
    expect(document.querySelector('.ticket-camera-status').textContent).toBe('Focusing…');
    scanner.button('capture').click();expect(requests.filter(r=>r.type==='process')).toHaveLength(0);
  });
  it('shows a loading screen during OCR and saves automatically after a confirmed read',async()=>{
    let resolve;readerMock.mockReturnValue(new Promise(r=>resolve=r));
    const onSave=vi.fn();await scanner.open({onSave});await capture();
    expect(scanner.mode).toBe('reading');expect(stop).toHaveBeenCalled();expect(onSave).not.toHaveBeenCalled();
    expect(document.querySelector('.ticket-camera-loading').hidden).toBe(false);
    expect(document.querySelector('[data-action=save]')).toBeNull();
    resolve(matched);await vi.advanceTimersByTimeAsync(10);
    expect(onSave).toHaveBeenCalledWith('data:image/png;base64,TEST','black-white',{orientationVersion:1,ticketRead:matched,documentId:expect.stringMatching(/^doc_/)});
    expect(scanner.root).toBeNull();
  });
  it('stores the two-tone capture losslessly instead of as a large JPEG',async()=>{
    await scanner.open({onSave:vi.fn()});await capture();
    expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenCalledWith('image/png');
    expect(HTMLCanvasElement.prototype.toDataURL).not.toHaveBeenCalledWith('image/jpeg',expect.anything());
  });
  it('uses the fresh reader to orient the saved photo',async()=>{
    readerMock.mockResolvedValue({...matched,quarterTurns:1});
    let dimensions;await scanner.open({onSave:()=>{dimensions=[scanner.preview.width,scanner.preview.height];}});await capture();
    expect(dimensions).toEqual([210,190]);expect(readerMock).toHaveBeenCalledTimes(1);
  });
  it.each(['unreadable','ignored','low-confidence','reader-error'])('requires recapture without saving on %s',async status=>{
    if(status==='reader-error')readerMock.mockRejectedValue(new Error('Ticket reader could not finish'));
    else readerMock.mockResolvedValue(status==='low-confidence'?{...matched,confidence:.7}:{version:2,status});
    const onSave=vi.fn();await scanner.open({onSave});await capture();
    expect(scanner.mode).toBe('recapture');expect(onSave).not.toHaveBeenCalled();expect(scanner.dataUrl).toBeNull();
    expect(scanner.button('retry-save').hidden).toBe(true);expect(scanner.button('recapture').hidden).toBe(false);
    await scanner.save();expect(onSave).not.toHaveBeenCalled();
    readerMock.mockResolvedValue(matched);scanner.button('recapture').click();await vi.advanceTimersByTimeAsync(10);
    await capture();expect(onSave).toHaveBeenCalledTimes(1);expect(scanner.root).toBeNull();
  });
  it('discards an OCR result when the scanner is closed while reading',async()=>{
    let resolve;readerMock.mockReturnValue(new Promise(r=>resolve=r));
    const onSave=vi.fn();await scanner.open({onSave});await capture();scanner.close();
    resolve(matched);await vi.advanceTimersByTimeAsync(10);expect(onSave).not.toHaveBeenCalled();
  });
  it('keeps the guide visible through detection loss and recovers tracking',async()=>{
    await scanner.open({onSave:vi.fn()});await vi.advanceTimersByTimeAsync(600);
    detection=null;await vi.advanceTimersByTimeAsync(3000);
    expect(scanner.outline.sample(performance.now())).toMatchObject({opacity:1,tracked:false});
    detection=good;await vi.advanceTimersByTimeAsync(300);
    expect(scanner.outline.sample(performance.now())).toMatchObject({opacity:1,tracked:true});
  });
  it('keeps tracking when camera callbacks stop, without capturing',async()=>{
    HTMLVideoElement.prototype.requestVideoFrameCallback=()=>999999;
    Object.defineProperty(HTMLVideoElement.prototype,'currentTime',{configurable:true,get:()=>performance.now()/1000});
    await scanner.open({onSave:vi.fn()});await vi.advanceTimersByTimeAsync(3500);
    expect(requests.filter(r=>r.type==='detect').length).toBeGreaterThan(5);
    expect(scanner.mode).toBe('live');expect(scanner.outline.sample(performance.now()).tracked).toBe(true);
  });
  it('keeps side handles and the magnifier working',async()=>{
    detection=null;await scanner.open({onSave:vi.fn()});scanner.stopCamera();scanner.source=scanner.snapshot(scanner.video);scanner.editCrop();
    const side=document.querySelector('[data-side="1"]'),before=scanner.corners.map(p=>({...p}));side.setPointerCapture=vi.fn();
    const pointer=(type,x,y)=>{const e=new MouseEvent(type,{bubbles:true,clientX:x,clientY:y});Object.defineProperty(e,'pointerId',{value:1});side.dispatchEvent(e);};
    pointer('pointerdown',343,300);pointer('pointermove',304,300);
    expect(scanner.corners[1].x).toBeCloseTo(before[1].x-.1);expect(scanner.corners[2].x).toBeCloseTo(before[2].x-.1);
    expect(scanner.corners[0]).toEqual(before[0]);expect(scanner.loupe.hidden).toBe(false);
    pointer('pointerup',304,300);expect(scanner.loupe.hidden).toBe(true);
  });
  it('keeps a captured ticket available if saving fails',async()=>{
    await scanner.open({onSave:vi.fn().mockRejectedValue(new Error('Storage is full'))});await capture();
    expect(scanner.mode).toBe('save-error');expect(scanner.dataUrl).toBeTruthy();expect(scanner.button('retry-save').hidden).toBe(false);
    scanner.options.onSave=vi.fn();scanner.button('retry-save').click();await vi.advanceTimersByTimeAsync(10);
    expect(scanner.root).toBeNull();expect(readerMock).toHaveBeenCalledTimes(1);
  });
  it('stops the camera in the background and resumes edge tracking',async()=>{
    await scanner.open({onSave:vi.fn()});await vi.advanceTimersByTimeAsync(500);
    Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));
    expect(stop).toHaveBeenCalled();expect(scanner.mode).toBe('error');
    Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});scanner.button('retry').click();await vi.advanceTimersByTimeAsync(500);
    expect(scanner.mode).toBe('live');expect(requests.filter(r=>r.type==='process')).toHaveLength(0);
  });
});

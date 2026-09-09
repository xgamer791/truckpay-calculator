import { createWorker } from 'tesseract.js';
import { orientationDecision } from './orientation-decision.js';

let workerPromise,worker,queue=Promise.resolve(),idle;
async function ready(){
  if(!workerPromise)workerPromise=(async()=>{
    worker=await createWorker({
      workerPath:'https://cdn.jsdelivr.net/npm/tesseract.js@4.1.1/dist/worker.min.js',
      corePath:'https://cdn.jsdelivr.net/npm/tesseract.js-core@4.0.4',
      langPath:'https://tessdata.projectnaptha.com/4.0.0',
      errorHandler:()=>{},
    });
    await worker.loadLanguage('osd');await worker.initialize('osd',0);return worker;
  })();
  return workerPromise;
}
function dispose(){clearTimeout(idle);worker?.terminate();worker=null;workerPromise=null;}
export function detectOrientation(image){
  const run=queue.then(async()=>{
    clearTimeout(idle);let deadline;
    try{
      const result=await Promise.race([
        ready().then(w=>w.detect(image)),
        new Promise((_,reject)=>{deadline=setTimeout(()=>reject(new Error('Orientation check timed out')),30000);}),
      ]);
      return orientationDecision(result.data);
    }catch(error){dispose();throw error;}
    finally{clearTimeout(deadline);idle=setTimeout(dispose,30000);}
  });
  queue=run.catch(()=>{});return run;
}

export async function orientDataUrl(source){
  const image=new Image();image.crossOrigin='anonymous';image.src=source;await image.decode();
  const result=await detectOrientation(image);
  if(!result.quarterTurns)return {dataUrl:source,...result};
  const canvas=document.createElement('canvas'),turns=result.quarterTurns;
  canvas.width=turns%2?image.naturalHeight:image.naturalWidth;canvas.height=turns%2?image.naturalWidth:image.naturalHeight;
  const ctx=canvas.getContext('2d');ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate(turns*Math.PI/2);ctx.drawImage(image,-image.naturalWidth/2,-image.naturalHeight/2);
  return {dataUrl:canvas.toDataURL('image/jpeg',.94),...result};
}

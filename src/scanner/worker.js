import { detectTicket, processTicket, enhanceTicket } from './core.js';
import { measureCaptureQuality } from './quality.js';

let previous=null,frame=0,dimensions='';
self.onmessage=({data:message})=>{
  const {id,type,width,height,buffer,corners}=message;
  try {
    if(type==='reset'){previous=null;frame=0;dimensions='';return;}
    if(type==='detect'){
      if(dimensions!==`${width}:${height}`){previous=null;dimensions=`${width}:${height}`;}
      const result=detectTicket(new Uint8ClampedArray(buffer),width,height,previous,frame++);
      previous=result?.corners||null;
      self.postMessage({id,result});
    } else if(type==='quality'){
      self.postMessage({id,result:measureCaptureQuality(new Uint8ClampedArray(buffer),width,height,corners)});
    } else if(type==='process'||type==='enhance'){
      const result=type==='process'?processTicket(new Uint8ClampedArray(buffer),width,height,corners):enhanceTicket(new Uint8ClampedArray(buffer),width,height);
      const transfer=[result.pixels.buffer];
      if(result.readerPixels)transfer.push(result.readerPixels.buffer);
      self.postMessage({id,result},{transfer});
    }
  }catch(error){self.postMessage({id,error:error.message||'Ticket processing failed.'});}
};

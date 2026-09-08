import { detectTicket, processTicket } from './core.js';

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
    } else if(type==='process'){
      const result=processTicket(new Uint8ClampedArray(buffer),width,height,corners);
      self.postMessage({id,result},{transfer:[result.pixels.buffer]});
    }
  }catch(error){self.postMessage({id,error:error.message||'Ticket processing failed.'});}
};

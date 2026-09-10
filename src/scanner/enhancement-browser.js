// Local/offline legacy photos are enhanced once before their first upload.
// Work runs off the main thread; the source is retained as the original.
export async function enhanceDataUrl(source) {
  const image=new Image();image.crossOrigin='anonymous';image.src=source;await image.decode();
  const scale=Math.min(1,2400/Math.max(image.naturalWidth,image.naturalHeight));
  const canvas=document.createElement('canvas');canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale);
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,canvas.width,canvas.height);
  const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
  const worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});
  let timer;
  try {
    const result=await new Promise((resolve,reject)=>{
      timer=setTimeout(()=>reject(new Error('Ticket enhancement timed out')),25000);
      worker.onmessage=({data})=>data.error?reject(new Error(data.error)):resolve(data.result);
      worker.onerror=()=>reject(new Error('Ticket enhancement could not start'));
      worker.postMessage({id:1,type:'enhance',width:pixels.width,height:pixels.height,buffer:pixels.data.buffer},[pixels.data.buffer]);
    });
    ctx.putImageData(new ImageData(result.pixels,result.width,result.height),0,0);
    return canvas.toDataURL('image/jpeg',.94);
  } finally {clearTimeout(timer);worker.terminate();}
}

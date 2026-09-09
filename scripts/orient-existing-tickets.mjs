import { spawnSync } from 'node:child_process';
import { createWorker } from 'tesseract.js';
import sharp from 'sharp';
import { orientationDecision } from '../src/scanner/orientation-decision.js';

if(!process.env.CONVEX_DEPLOY_KEY)throw new Error('Missing deployment credentials');
function convex(name,args={}){
  const result=spawnSync('npx',['convex','run',`orientation:${name}`,JSON.stringify(args)],{encoding:'utf8',maxBuffer:8*1024*1024,env:process.env});
  // Never log function results: they include private signed image URLs.
  if(result.status!==0)throw new Error(`Orientation migration ${name} failed`);
  return JSON.parse(result.stdout);
}
const worker=await createWorker({langPath:process.env.ORIENTATION_LANG_PATH || 'https://tessdata.projectnaptha.com/4.0.0',errorHandler:()=>{}});
let cursor=null,scanned=0,rotated=0,uncertain=0,conflicts=0;
try{
  await worker.loadLanguage('osd');await worker.initialize('osd',0);
  do{
    const page=convex('list',{cursor});
    for(const ticket of page.tickets){
      if(!ticket.url)throw new Error('A saved ticket image is unavailable');
      const response=await fetch(ticket.url);if(!response.ok)throw new Error('Unable to download a saved ticket');
      const input=Buffer.from(await response.arrayBuffer());
      // EXIF orientation is normalized before text direction is measured.
      const normalized=await sharp(input).rotate().png().toBuffer();
      const preview=await sharp(normalized).resize({width:1800,height:1800,fit:'inside',withoutEnlargement:true}).png().toBuffer();
      const {data}=await worker.detect(preview),decision=orientationDecision(data);
      let replacementId;
      const metadata=await sharp(input).metadata();
      if(decision.quarterTurns || (metadata.orientation && metadata.orientation!==1)){
        const output=await sharp(normalized).rotate(decision.quarterTurns*90).jpeg({quality:94}).toBuffer();
        const upload=await fetch(convex('uploadUrl'),{method:'POST',headers:{'Content-Type':'image/jpeg'},body:output});
        if(!upload.ok)throw new Error('Unable to save an oriented ticket');
        replacementId=(await upload.json()).storageId;
      }
      const applied=convex('apply',{id:ticket.id,storageId:ticket.storageId,updatedAt:ticket.updatedAt,replacementId,confidence:decision.confidence});
      scanned++;if(!applied.applied)conflicts++;else if(replacementId)rotated++;
      if(!decision.confident)uncertain++;
    }
    if(page.done)break;cursor=page.cursor;
  }while(true);
  console.log(`Orientation migration: checked ${scanned}, corrected ${rotated}, uncertain ${uncertain}, concurrent changes skipped ${conflicts}. Originals preserved.`);
}finally{await worker.terminate();}

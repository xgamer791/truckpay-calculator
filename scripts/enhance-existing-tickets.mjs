import {spawnSync} from 'node:child_process';
import sharp from 'sharp';
import {enhanceTicket} from '../src/scanner/core.js';

if(!process.env.CONVEX_DEPLOY_KEY)throw new Error('Missing deployment credentials');
function convex(name,args={}){
  const result=spawnSync('npx',['convex','run',`enhancement:${name}`,JSON.stringify(args)],{encoding:'utf8',maxBuffer:8*1024*1024,env:process.env});
  // Signed image URLs and deployment credentials never appear in logs.
  if(result.status!==0)throw new Error(`Enhancement migration ${name} failed`);
  return JSON.parse(result.stdout);
}
let enhanced=0,conflicts=0,errors=0;
for(let pass=0;pass<3;pass++){
  let cursor=null,retry=false;
  do{
    const page=convex('list',{cursor});
    for(const ticket of page.tickets){
      try{
        if(!ticket.url)throw new Error('Image unavailable');
        const response=await fetch(ticket.url,{signal:AbortSignal.timeout(30000)});
        if(!response.ok)throw new Error('Image download failed');
        const {data,info}=await sharp(Buffer.from(await response.arrayBuffer())).rotate().resize({width:2400,height:2400,fit:'inside',withoutEnlargement:true}).flatten({background:'#fff'}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
        const result=enhanceTicket(data,info.width,info.height);
        const output=await sharp(result.pixels,{raw:{width:result.width,height:result.height,channels:4}}).jpeg({quality:94}).toBuffer();
        const upload=await fetch(convex('uploadUrl'),{method:'POST',headers:{'Content-Type':'image/jpeg'},body:output});
        if(!upload.ok)throw new Error('Enhanced image upload failed');
        const replacementId=(await upload.json()).storageId;
        const applied=convex('apply',{id:ticket.id,storageId:ticket.storageId,updatedAt:ticket.updatedAt,replacementId});
        if(applied.applied)enhanced++;else{conflicts++;retry=true;}
      }catch{errors++;retry=true;}
    }
    if(page.done)break;cursor=page.cursor;
  }while(true);
  if(!retry)break;
}
console.log(`Ticket enhancement: enhanced ${enhanced}; concurrent changes skipped ${conflicts}; processing errors ${errors}. Original images and existing ticket numbers preserved.`);
let cursor=null,remaining=0;
do{const page=convex('list',{cursor});remaining+=page.tickets.length;if(page.done)break;cursor=page.cursor;}while(true);
if(remaining)throw new Error(`${remaining} tickets still need enhancement`);

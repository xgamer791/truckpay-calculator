import { convexTest } from 'convex-test';
import { makeFunctionReference } from 'convex/server';
import { expect, it } from 'vitest';
import schema from '../convex/schema';
const modules=import.meta.glob('../convex/**/*.ts');
const reserve=makeFunctionReference<'mutation'>('ticketNumbers:reserve');
const release=makeFunctionReference<'mutation'>('ticketNumbers:release');
const save=makeFunctionReference<'mutation'>('sync:saveSnapshot');
const read={version:2,status:'matched' as const,plant:'colorado-materials' as const,ticketNumber:'3556031',confidence:.99,quarterTurns:0};
async function fixture(){
  const t=convexTest(schema,modules);
  const values=await t.run(async ctx=>{
    const userId=await ctx.db.insert('users',{email:'duplicates@example.test'});
    const otherId=await ctx.db.insert('users',{email:'other@example.test'});
    await ctx.db.insert('driverProfiles',{userId,email:'duplicates@example.test',fullName:'Test',phone:'555',company:'JLP Trucking',truckNumber:'None',avgTons:25,commissionRate:30,role:'driver',createdAt:1,updatedAt:1});
    const settlementId=await ctx.db.insert('settlements',{userId,clientId:'s',payoutDate:'2026-09-12',createdAt:1,updatedAt:1});
    const loadId=await ctx.db.insert('loads',{userId,settlementId,clientId:'old-load',day:'Monday',miles:20,tons:25,pricingMode:'auto',calculatedPay:10,createdAt:1,updatedAt:1});
    const storageId=await ctx.storage.store(new Blob(['original'],{type:'image/jpeg'}));
    const ticketId=await ctx.db.insert('tickets',{userId,loadId,clientId:'old-ticket',type:'ticket',storageId,ticketRead:read,createdAt:1,updatedAt:1});
    return {userId,otherId,ticketId,storageId};
  });
  const client=t.withIdentity({subject:`${values.userId}|test`,issuer:'https://convex.test'});
  const other=t.withIdentity({subject:`${values.otherId}|test`,issuer:'https://convex.test'});
  return {t,client,other,...values};
}
it('rejects a saved duplicate with its reason, exempting only the exact replaced ticket',async()=>{
  const {client}=await fixture();
  const args={number:read.ticketNumber,documentClientId:'new-ticket',loadClientId:'new-load',replacedIds:['old-ticket']};
  expect(await client.mutation(reserve,args)).toMatchObject({duplicate:true,reason:expect.stringContaining('#3556031')});
  expect(await client.mutation(reserve,{...args,loadClientId:'old-load',replacedIds:[]})).toMatchObject({duplicate:true});
  expect(await client.mutation(reserve,{...args,loadClientId:'old-load'})).toMatchObject({duplicate:false});
});
it('serializes simultaneous captures, permits idempotent retries, and isolates accounts',async()=>{
  const {client,other}=await fixture();
  const args={number:'3556032',documentClientId:'capture-one',loadClientId:'one',replacedIds:[]};
  expect(await client.mutation(reserve,args)).toMatchObject({duplicate:false});
  expect(await client.mutation(reserve,args)).toMatchObject({duplicate:false});
  expect(await client.mutation(reserve,{...args,documentClientId:'capture-two',loadClientId:'two'})).toMatchObject({duplicate:true});
  expect(await other.mutation(reserve,{...args,documentClientId:'other-driver'})).toMatchObject({duplicate:false});
  await other.mutation(release,{number:args.number,documentClientId:args.documentClientId});
  expect(await client.mutation(reserve,{...args,documentClientId:'capture-two'})).toMatchObject({duplicate:true});
  await client.mutation(release,{number:args.number,documentClientId:args.documentClientId});
  expect(await client.mutation(reserve,{...args,documentClientId:'capture-two'})).toMatchObject({duplicate:false});
});
it('rejects a stale snapshot duplicate atomically without deleting the saved image',async()=>{
  const {t,client,ticketId,storageId}=await fixture();
  const upload=await t.run(ctx=>ctx.storage.store(new Blob(['duplicate'])));
  await expect(client.mutation(save,{
    settings:{avgTons:25,truckNumber:'None'},
    settlements:[{clientId:'s',payoutDate:'2026-09-12',loads:[{clientId:'new-load',day:'Tuesday',miles:28,tons:25,pricingMode:'auto'}]}],
    tickets:[{clientId:'duplicate',loadClientId:'new-load',type:'ticket',storageId:upload,ticketRead:read}],
  })).rejects.toThrow('Duplicate ticket #3556031');
  expect(await t.run(ctx=>ctx.db.get(ticketId))).toMatchObject({storageId,ticketRead:read});
  expect(await t.run(async ctx=>(await ctx.storage.get(storageId))?.text())).toBe('original');
});
it('accepts its reserved number, clears its claim after sync, and blocks subsequent duplicates',async()=>{
  const {t,client,storageId}=await fixture();
  const args={number:'3556032',documentClientId:'new-ticket',loadClientId:'new-load',replacedIds:[]};
  await client.mutation(reserve,args);
  const upload=await t.run(ctx=>ctx.storage.store(new Blob(['new'])));
  await client.mutation(save,{
    settings:{avgTons:25,truckNumber:'None'},
    settlements:[{clientId:'s',payoutDate:'2026-09-12',loads:['old-load','new-load'].map(clientId=>({clientId,day:'Tuesday',miles:28,tons:25,pricingMode:'auto'}))}],
    tickets:[{clientId:'old-ticket',loadClientId:'old-load',type:'ticket',storageId,ticketRead:read},{clientId:'new-ticket',loadClientId:'new-load',type:'ticket',storageId:upload,ticketRead:{...read,ticketNumber:args.number}}],
  });
  expect(await t.run(ctx=>ctx.db.query('ticketNumberClaims').collect())).toHaveLength(0);
  expect(await client.mutation(reserve,{...args,documentClientId:'another',loadClientId:'another'})).toMatchObject({duplicate:true});
});

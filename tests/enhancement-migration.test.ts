import {convexTest} from 'convex-test';
import {makeFunctionReference} from 'convex/server';
import {expect,it} from 'vitest';
import schema from '../convex/schema';
const modules=import.meta.glob('../convex/**/*.ts');
const apply=makeFunctionReference<'mutation'>('enhancement:apply');
const list=makeFunctionReference<'query'>('enhancement:list');
const save=makeFunctionReference<'mutation'>('sync:saveSnapshot');
const ticketRead={version:3,status:'matched' as const,plant:'la-grange' as const,ticketNumber:'172744',confidence:.99};
async function fixture(){
  const t=convexTest(schema,modules);
  const values=await t.run(async ctx=>{
    const userId=await ctx.db.insert('users',{email:'enhancement@example.test'});
    await ctx.db.insert('driverProfiles',{userId,email:'enhancement@example.test',fullName:'Test',phone:'555',company:'JLP Trucking',truckNumber:'None',avgTons:25,commissionRate:30,role:'driver',createdAt:1,updatedAt:1});
    const settlementId=await ctx.db.insert('settlements',{userId,clientId:'s',payoutDate:'2026-09-12',createdAt:1,updatedAt:1});
    const loadId=await ctx.db.insert('loads',{userId,settlementId,clientId:'l',day:'Monday',miles:90,tons:25,pricingMode:'auto',calculatedPay:10,createdAt:1,updatedAt:1});
    const storageId=await ctx.storage.store(new Blob(['original'],{type:'image/jpeg'}));
    const replacementId=await ctx.storage.store(new Blob(['enhanced'],{type:'image/jpeg'}));
    const id=await ctx.db.insert('tickets',{userId,loadId,clientId:'t',type:'ticket',storageId,ticketRead,createdAt:1,updatedAt:1});
    return {userId,id,storageId,replacementId};
  });return {t,...values};
}
it('enhances once, preserves original and number, and survives an older open app snapshot',async()=>{
  const {t,userId,id,storageId,replacementId}=await fixture();
  expect((await t.query(list,{cursor:null})).tickets).toHaveLength(1);
  expect(await t.mutation(apply,{id,storageId,replacementId,updatedAt:1})).toEqual({applied:true});
  expect((await t.query(list,{cursor:null})).tickets).toHaveLength(0);
  const client=t.withIdentity({subject:`${userId}|test`,issuer:'https://convex.test'});
  await client.mutation(save,{settings:{avgTons:25,truckNumber:'None'},settlements:[{clientId:'s',payoutDate:'2026-09-12',loads:[{clientId:'l',day:'Monday',miles:90,tons:25,pricingMode:'auto'}]}],tickets:[{clientId:'t',loadClientId:'l',type:'ticket',storageId}]});
  expect(await t.run(ctx=>ctx.db.get(id))).toMatchObject({storageId:replacementId,originalStorageId:storageId,enhancementVersion:2,ticketRead});
  expect(await t.run(async ctx=>(await ctx.storage.get(storageId))?.text())).toBe('original');
});
it('does not overwrite a retaken photo and deletes only the unused enhancement output',async()=>{
  const {t,id,storageId,replacementId}=await fixture();
  await t.run(ctx=>ctx.db.patch(id,{updatedAt:2}));
  expect(await t.mutation(apply,{id,storageId,replacementId,updatedAt:1})).toEqual({applied:false});
  expect(await t.run(ctx=>ctx.storage.get(replacementId))).toBeNull();
  expect(await t.run(async ctx=>(await ctx.storage.get(storageId))?.text())).toBe('original');
});

it('repairs v1 new captures once and skips finished older images and v2 captures',async()=>{
  const {t,id,storageId,replacementId}=await fixture();
  await t.run(ctx=>ctx.db.patch(id,{enhancementVersion:1}));
  expect((await t.query(list,{cursor:null})).tickets).toHaveLength(1);
  expect(await t.mutation(apply,{id,storageId,replacementId,updatedAt:1})).toEqual({applied:true});
  expect((await t.query(list,{cursor:null})).tickets).toHaveLength(0);
  await t.run(ctx=>ctx.db.patch(id,{enhancementVersion:1}));
  expect((await t.query(list,{cursor:null})).tickets).toHaveLength(0);
  await t.run(ctx=>ctx.db.patch(id,{enhancementVersion:2,enhancementSourceId:undefined}));
  expect((await t.query(list,{cursor:null})).tickets).toHaveLength(0);
});

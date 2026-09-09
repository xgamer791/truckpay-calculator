import { convexTest } from 'convex-test';
import { makeFunctionReference } from 'convex/server';
import { expect, it } from 'vitest';
import schema from '../convex/schema';
const modules=import.meta.glob('../convex/**/*.ts');
const apply=makeFunctionReference<'mutation'>('orientation:apply');
const save=makeFunctionReference<'mutation'>('sync:saveSnapshot');
async function fixture(){
  const t=convexTest(schema,modules);
  const values=await t.run(async ctx=>{
    const userId=await ctx.db.insert('users',{email:'orientation@example.test'});
    await ctx.db.insert('driverProfiles',{userId,email:'orientation@example.test',fullName:'Test',phone:'555',company:'JLP Trucking',truckNumber:'None',avgTons:25,commissionRate:30,role:'driver',createdAt:1,updatedAt:1});
    const settlementId=await ctx.db.insert('settlements',{userId,clientId:'s',payoutDate:'2026-09-12',createdAt:1,updatedAt:1});
    const loadId=await ctx.db.insert('loads',{userId,settlementId,clientId:'l',day:'Monday',miles:20,tons:25,pricingMode:'auto',calculatedPay:10,createdAt:1,updatedAt:1});
    const storageId=await ctx.storage.store(new Blob(['original'],{type:'image/jpeg'}));
    const replacementId=await ctx.storage.store(new Blob(['upright'],{type:'image/jpeg'}));
    const id=await ctx.db.insert('tickets',{userId,loadId,clientId:'t',type:'ticket',storageId,createdAt:1,updatedAt:1});
    return {id,userId,storageId,replacementId};
  });return {t,...values};
}
it('preserves originals and does not let an older snapshot undo orientation',async()=>{
  const {t,id,userId,storageId,replacementId}=await fixture();
  expect(await t.mutation(apply,{id,storageId,replacementId,updatedAt:1,confidence:4})).toEqual({applied:true});
  const client=t.withIdentity({subject:`${userId}|test`,issuer:'https://convex.test'});
  await client.mutation(save,{settings:{avgTons:25,truckNumber:'None'},settlements:[{clientId:'s',payoutDate:'2026-09-12',loads:[{clientId:'l',day:'Monday',miles:20,tons:25,pricingMode:'auto'}]}],tickets:[{clientId:'t',loadClientId:'l',type:'ticket',storageId}]});
  const record=await t.run(ctx=>ctx.db.get(id));
  expect(record).toMatchObject({storageId:replacementId,originalStorageId:storageId,orientationVersion:1});
  expect(await t.run(async ctx=>(await ctx.storage.get(storageId))?.text())).toBe('original');
});
it('does not overwrite a ticket changed during migration',async()=>{
  const {t,id,storageId,replacementId}=await fixture();
  await t.run(ctx=>ctx.db.patch(id,{updatedAt:2}));
  expect(await t.mutation(apply,{id,storageId,replacementId,updatedAt:1,confidence:4})).toEqual({applied:false});
  expect((await t.run(ctx=>ctx.db.get(id)))?.storageId).toBe(storageId);
  expect(await t.run(ctx=>ctx.storage.get(replacementId))).toBeNull();
});

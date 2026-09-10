import { internalMutation, internalQuery } from './_generated/server';
import { v } from 'convex/values';

export const list=internalQuery({
  args:{cursor:v.union(v.string(),v.null())},
  handler:async(ctx,{cursor})=>{
    const page=await ctx.db.query('tickets').paginate({cursor,numItems:25});
    const tickets=await Promise.all(page.page.filter(t=>t.enhancementVersion!==1).map(async t=>({
      id:t._id,storageId:t.storageId,updatedAt:t.updatedAt,url:await ctx.storage.getUrl(t.storageId),ticketRead:t.ticketRead,
    })));
    return {tickets,cursor:page.continueCursor,done:page.isDone};
  },
});
export const uploadUrl=internalMutation({args:{},handler:ctx=>ctx.storage.generateUploadUrl()});
export const apply=internalMutation({
  args:{id:v.id('tickets'),storageId:v.id('_storage'),updatedAt:v.number(),replacementId:v.id('_storage')},
  handler:async(ctx,args)=>{
    const ticket=await ctx.db.get(args.id);
    if(!ticket||ticket.storageId!==args.storageId||ticket.updatedAt!==args.updatedAt||ticket.enhancementVersion===1){
      await ctx.storage.delete(args.replacementId);return {applied:false};
    }
    if(!await ctx.db.system.get(args.replacementId))throw new Error('Enhanced image missing');
    await ctx.db.patch(ticket._id,{
      storageId:args.replacementId,originalStorageId:ticket.originalStorageId??ticket.storageId,
      enhancementSourceId:ticket.storageId,enhancementVersion:1,updatedAt:Date.now(),
    });
    return {applied:true};
  },
});

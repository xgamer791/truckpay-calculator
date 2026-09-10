import { internalMutation, internalQuery, mutation } from './_generated/server';
import { v } from 'convex/values';
import { requireUserId } from './lib/security';
import { ocrWithRead, ticketReadValue, validateRead } from './lib/ticketRead';

// The deployment migration can read all saved tickets; app clients cannot.
export const list = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query('tickets').paginate({ cursor, numItems: 25 });
    const tickets = await Promise.all(page.page.filter(t => t.ticketRead?.version !== 1).map(async t => ({
      id: t._id, storageId: t.storageId, updatedAt: t.updatedAt, url: await ctx.storage.getUrl(t.storageId),
    })));
    return { tickets, cursor: page.continueCursor, done: page.isDone };
  },
});

export const apply = internalMutation({
  args: { id: v.id('tickets'), storageId: v.id('_storage'), updatedAt: v.number(), result: ticketReadValue },
  handler: async (ctx, args) => {
    validateRead(args.result);
    const ticket = await ctx.db.get(args.id);
    if (!ticket || ticket.storageId !== args.storageId || ticket.updatedAt !== args.updatedAt || ticket.ticketRead?.version === 1) return { applied: false };
    await ctx.db.patch(ticket._id, { ticketRead: args.result, ocr: ocrWithRead(ticket.ocr, args.result), updatedAt: Date.now() });
    return { applied: true };
  },
});

// Partial, owner-scoped writes cannot overwrite loads, pay, or newer photos.
export const applyMine = mutation({
  args: { clientId: v.string(), storageId: v.id('_storage'), result: ticketReadValue },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    validateRead(args.result);
    const ticket = await ctx.db.query('tickets').withIndex('by_user_client', q => q.eq('userId', userId).eq('clientId', args.clientId)).unique();
    if (!ticket || ticket.storageId !== args.storageId || ticket.ticketRead?.version === 1) return { applied: false };
    await ctx.db.patch(ticket._id, { ticketRead: args.result, ocr: ocrWithRead(ticket.ocr, args.result), updatedAt: Date.now() });
    return { applied: true };
  },
});

import { ConvexError, v } from 'convex/values';
import { mutation } from './_generated/server';
import { requireUserId } from './lib/security';
import { confirmedNumber } from '../src/ticket-reader/duplicates.js';

// Reserve atomically before local persistence, including across open devices.
// A short lease bridges the existing offline-first photo upload/snapshot queue.
export const reserve = mutation({
  args: { number: v.string(), documentClientId: v.string(), loadClientId: v.string(), replacedIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (!/^\d{6,12}$/.test(args.number)) throw new ConvexError('A verified ticket number is required.');
    const tickets = await ctx.db.query('tickets').withIndex('by_user', q => q.eq('userId', userId)).collect();
    for (const ticket of tickets) {
      if (confirmedNumber(ticket) !== args.number) continue;
      const load = await ctx.db.get(ticket.loadId);
      if (load?.clientId === args.loadClientId && args.replacedIds.includes(ticket.clientId)) continue;
      if (ticket.clientId === args.documentClientId && load?.clientId === args.loadClientId) continue;
      return { duplicate: true, reason: `Duplicate ticket #${args.number}. This number is already saved on ${load?.day || 'another'} load${load ? ` (${load.miles} miles)` : ''}. Capture the correct ticket for this load.` };
    }
    const claim = await ctx.db.query('ticketNumberClaims').withIndex('by_user_number', q => q.eq('userId', userId).eq('number', args.number)).unique();
    if (claim && claim.expiresAt > Date.now() && (claim.documentClientId !== args.documentClientId || claim.loadClientId !== args.loadClientId)) {
      return { duplicate: true, reason: `Duplicate ticket #${args.number}. This number is already being saved on another capture. Capture the correct ticket for this load.` };
    }
    const fields = { documentClientId: args.documentClientId, loadClientId: args.loadClientId, expiresAt: Date.now() + 10 * 60_000 };
    if (claim) await ctx.db.patch(claim._id, fields);
    else await ctx.db.insert('ticketNumberClaims', { userId, number: args.number, ...fields });
    return { duplicate: false };
  },
});

export const release = mutation({
  args: { number: v.string(), documentClientId: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const claim = await ctx.db.query('ticketNumberClaims').withIndex('by_user_number', q => q.eq('userId', userId).eq('number', args.number)).unique();
    if (claim?.documentClientId === args.documentClientId) await ctx.db.delete(claim._id);
  },
});

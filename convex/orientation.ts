import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

// Deployment-only migration. These functions cannot be called by app clients.
export const list = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query("tickets").paginate({ cursor, numItems: 25 });
    const tickets = await Promise.all(page.page.filter(t => t.orientationVersion !== 1).map(async t => ({
      id: t._id, storageId: t.storageId, updatedAt: t.updatedAt,
      url: await ctx.storage.getUrl(t.storageId),
    })));
    return { tickets, cursor: page.continueCursor, done: page.isDone };
  },
});
export const uploadUrl = internalMutation({ args: {}, handler: async ctx => ctx.storage.generateUploadUrl() });
export const apply = internalMutation({
  args: {
    id: v.id("tickets"), storageId: v.id("_storage"), updatedAt: v.number(),
    replacementId: v.optional(v.id("_storage")), confidence: v.number(),
  },
  handler: async (ctx, args) => {
    const ticket = await ctx.db.get(args.id);
    if (!ticket || ticket.storageId !== args.storageId || ticket.updatedAt !== args.updatedAt || ticket.orientationVersion === 1) {
      if (args.replacementId) await ctx.storage.delete(args.replacementId);
      return { applied: false };
    }
    if (args.replacementId && !await ctx.db.system.get(args.replacementId)) throw new Error("Missing oriented image");
    await ctx.db.patch(args.id, {
      storageId: args.replacementId ?? ticket.storageId,
      originalStorageId: ticket.originalStorageId ?? (args.replacementId ? ticket.storageId : undefined),
      orientationSourceId: ticket.storageId,
      orientationVersion: 1, orientationConfidence: args.confidence,
      updatedAt: Date.now(),
    });
    return { applied: true };
  },
});

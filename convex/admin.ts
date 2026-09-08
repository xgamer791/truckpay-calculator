import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "./lib/security";
import { loadDriverState } from "./lib/state";

export const listDrivers = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const profiles = await ctx.db.query("driverProfiles").collect();
    const summaries = await Promise.all(
      profiles.map(async (profile) => {
        const [settlements, loads, tickets] = await Promise.all([
          ctx.db
            .query("settlements")
            .withIndex("by_user", (q) => q.eq("userId", profile.userId))
            .collect(),
          ctx.db
            .query("loads")
            .withIndex("by_user", (q) => q.eq("userId", profile.userId))
            .collect(),
          ctx.db
            .query("tickets")
            .withIndex("by_user", (q) => q.eq("userId", profile.userId))
            .collect(),
        ]);
        return {
          userId: profile.userId,
          email: profile.email,
          fullName: profile.fullName,
          phone: profile.phone,
          company: profile.company,
          truckNumber: profile.truckNumber,
          role: profile.role,
          settlementCount: settlements.length,
          loadCount: loads.length,
          ticketCount: tickets.length,
          totalPay: loads.reduce((total, load) => total + load.calculatedPay, 0),
          updatedAt: profile.updatedAt,
        };
      }),
    );
    return summaries.sort((a, b) => a.fullName.localeCompare(b.fullName));
  },
});

export const getDriverState = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await loadDriverState(ctx, args.userId);
  },
});

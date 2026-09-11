import { query } from "./_generated/server";
import { v } from "convex/values";
import { isAdminEmail, requireAdmin } from "./lib/security";
import { loadDriverState } from "./lib/state";
import { TRUCKING_COMPANY } from "./lib/fleet";
import { isConfirmedRead } from '../src/ticket-reader/metadata.js';

export const listDrivers = query({
  args: { payoutDate: v.optional(v.string()) },
  handler: async (ctx, { payoutDate }) => {
    await requireAdmin(ctx);
    const profiles = (await ctx.db.query("driverProfiles").collect())
      .filter((profile) => !isAdminEmail(profile.email));
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
        const selectedSettlements = settlements.filter(s => payoutDate === undefined || s.payoutDate === payoutDate);
        const settlementIds = new Set(selectedSettlements.map(s => String(s._id)));
        const selectedLoads = loads.filter(l => settlementIds.has(String(l.settlementId)));
        const loadIds = new Set(selectedLoads.map(l => String(l._id)));
        const selectedTickets = tickets.filter(t => loadIds.has(String(t.loadId)));
        const documentedLoads = new Set(selectedTickets.map(t => String(t.loadId)));
        const unverifiedLoads = new Set(selectedTickets.filter(t => !isConfirmedRead(t.ticketRead)).map(t => String(t.loadId)));
        return {
          userId: profile.userId,
          email: profile.email,
          fullName: profile.fullName,
          phone: profile.phone,
          company: TRUCKING_COMPANY,
          truckNumber: profile.truckNumber,
          role: profile.role,
          payoutDates: [...new Set(settlements.map(s => s.payoutDate))].sort().reverse(),
          payoutDate: payoutDate ?? null,
          settlementCount: selectedSettlements.length,
          loadCount: selectedLoads.length,
          ticketCount: selectedTickets.length,
          missingTickets: selectedLoads.filter(l => !documentedLoads.has(String(l._id))).length,
          unverifiedLoads: unverifiedLoads.size,
          totalPay: selectedLoads.reduce((total, load) => total + load.calculatedPay, 0),
          totalMiles: selectedLoads.reduce((total, load) => total + load.miles, 0),
          totalTons: selectedLoads.reduce((total, load) => total + load.tons, 0),
          updatedAt: [...selectedLoads, ...selectedTickets].reduce((latest, row) => Math.max(latest, row.updatedAt), profile.updatedAt),
        };
      }),
    );
    return summaries.sort((a, b) => a.fullName.localeCompare(b.fullName));
  },
});

export const getDriverState = query({
  args: { userId: v.id("users"), payoutDate: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await loadDriverState(ctx, args.userId, args.payoutDate);
  },
});

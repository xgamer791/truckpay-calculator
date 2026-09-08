import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { TRUCKING_COMPANY } from "./fleet";

export async function loadDriverState(ctx: QueryCtx, userId: Id<"users">) {
  const [profile, settlements, loads, tickets] = await Promise.all([
    ctx.db
      .query("driverProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique(),
    ctx.db
      .query("settlements")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect(),
    ctx.db
      .query("loads")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect(),
    ctx.db
      .query("tickets")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect(),
  ]);

  const ticketViews = await Promise.all(
    tickets.map(async (ticket) => ({
      ...ticket,
      url: await ctx.storage.getUrl(ticket.storageId),
      originalUrl: ticket.originalStorageId
        ? await ctx.storage.getUrl(ticket.originalStorageId)
        : null,
    })),
  );

  const ticketsByLoad = new Map<string, typeof ticketViews>();
  for (const ticket of ticketViews) {
    const key = String(ticket.loadId);
    const group = ticketsByLoad.get(key) ?? [];
    group.push(ticket);
    ticketsByLoad.set(key, group);
  }

  const loadsBySettlement = new Map<string, typeof loads>();
  for (const load of loads) {
    const key = String(load.settlementId);
    const group = loadsBySettlement.get(key) ?? [];
    group.push(load);
    loadsBySettlement.set(key, group);
  }

  const history = settlements
    .sort((a, b) => b.payoutDate.localeCompare(a.payoutDate))
    .map((settlement) => ({
      id: settlement.clientId,
      payoutDate: settlement.payoutDate,
      loads: (loadsBySettlement.get(String(settlement._id)) ?? []).map((load) => {
        const documents = (ticketsByLoad.get(String(load._id)) ?? [])
          .sort((a, b) => a.createdAt - b.createdAt)
          .map((ticket) => ({
            id: ticket.clientId,
            userId: String(userId),
            loadId: load.clientId,
            type: ticket.type,
            storageId: ticket.storageId,
            originalStorageId: ticket.originalStorageId,
            processed: ticket.url,
            original: ticket.originalUrl,
            filter: ticket.filter,
            ocr: ticket.ocr,
            createdAt:
              ticket.capturedAt ?? new Date(ticket.createdAt).toISOString(),
            modifiedAt:
              ticket.modifiedAt ?? new Date(ticket.updatedAt).toISOString(),
            syncStatus: "synced",
          }));

        return {
          id: load.clientId,
          day: load.day,
          miles: load.miles,
          tons: load.tons,
          pricingMode: load.pricingMode,
          customTotal: load.customTotal,
          customRate: load.customRate,
          note: load.note,
          calculatedPay: load.calculatedPay,
          documents,
          ticket: documents.at(-1)?.processed ?? null,
        };
      }),
    }));

  return {
    profile: profile ? { ...profile, company: TRUCKING_COMPANY } : null,
    history,
  };
}

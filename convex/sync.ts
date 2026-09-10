import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireUserId } from "./lib/security";
import { loadDriverState } from "./lib/state";
import { TRUCKING_COMPANY } from "./lib/fleet";
import { ocrWithRead, ticketReadValue, validateRead } from './lib/ticketRead';
import { preferredTicketRead } from '../src/ticket-reader/metadata.js';

const pricingMode = v.union(
  v.literal("auto"),
  v.literal("fixed"),
  v.literal("perton"),
);

const loadValue = v.object({
  clientId: v.string(),
  day: v.string(),
  miles: v.number(),
  tons: v.number(),
  pricingMode,
  customTotal: v.optional(v.number()),
  customRate: v.optional(v.number()),
  note: v.optional(v.string()),
});

const settlementValue = v.object({
  clientId: v.string(),
  payoutDate: v.string(),
  loads: v.array(loadValue),
});

const ticketValue = v.object({
  clientId: v.string(),
  loadClientId: v.string(),
  type: v.string(),
  storageId: v.id("_storage"),
  originalStorageId: v.optional(v.id("_storage")),
  orientationVersion: v.optional(v.number()),
  ticketRead: v.optional(ticketReadValue),
  filter: v.optional(v.string()),
  ocr: v.optional(v.any()),
  capturedAt: v.optional(v.string()),
  modifiedAt: v.optional(v.string()),
});

function rateForMiles(miles: number) {
  const rates = [
    [2, 3.84], [3, 3.97], [6, 4.38], [8, 4.65], [11, 5.06],
    [13, 5.46], [14, 5.43], [16, 6.03], [17, 6], [21, 6.75],
    [25, 7.32], [27, 7.36], [30, 8.01], [39, 10.26], [45, 11.24],
    [49, 10.15], [61, 14.4], [62, 14.72], [65, 15.42], [92, 16.07],
  ];
  if (miles <= 2) return 3.84;
  if (miles >= 92) {
    return 16.07 + (miles - 92) * ((16.07 - 15.42) / (92 - 65));
  }
  for (let index = 0; index < rates.length - 1; index += 1) {
    const [m1, r1] = rates[index];
    const [m2, r2] = rates[index + 1];
    if (miles >= m1 && miles <= m2) {
      return r1 + (miles - m1) * ((r2 - r1) / (m2 - m1));
    }
  }
  return 0;
}

function calculatedPay(load: {
  miles: number;
  tons: number;
  pricingMode: "auto" | "fixed" | "perton";
  customTotal?: number;
  customRate?: number;
}) {
  if (load.pricingMode === "fixed") return (load.customTotal ?? 0) * 0.3;
  if (load.pricingMode === "perton") {
    return (load.customRate ?? 0) * load.tons * 0.3;
  }
  return rateForMiles(load.miles) * load.tons * 0.3;
}

function assertSnapshot(
  settlements: Array<{ clientId: string; payoutDate: string; loads: Array<{ clientId: string; miles: number; tons: number }> }>,
  tickets: Array<{ clientId: string; loadClientId: string }>,
) {
  if (settlements.length > 520 || tickets.length > 10_000) {
    throw new ConvexError("This account contains too many records for one synchronization.");
  }
  const settlementIds = new Set<string>();
  const loadIds = new Set<string>();
  const ticketIds = new Set<string>();
  for (const settlement of settlements) {
    if (!settlement.clientId || settlementIds.has(settlement.clientId)) {
      throw new ConvexError("Settlement identifiers must be unique.");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(settlement.payoutDate)) {
      throw new ConvexError("A settlement has an invalid payout date.");
    }
    settlementIds.add(settlement.clientId);
    if (settlement.loads.length > 2_000) {
      throw new ConvexError("A settlement contains too many loads.");
    }
    for (const load of settlement.loads) {
      if (!load.clientId || loadIds.has(load.clientId)) {
        throw new ConvexError("Load identifiers must be unique.");
      }
      if (!Number.isFinite(load.miles) || load.miles <= 0 || !Number.isFinite(load.tons) || load.tons <= 0) {
        throw new ConvexError("A load has invalid mileage or tonnage.");
      }
      loadIds.add(load.clientId);
    }
  }
  for (const ticket of tickets) {
    if (!ticket.clientId || ticketIds.has(ticket.clientId)) {
      throw new ConvexError("Ticket identifiers must be unique.");
    }
    if (!loadIds.has(ticket.loadClientId)) {
      throw new ConvexError("A ticket references an unknown load.");
    }
    ticketIds.add(ticket.clientId);
  }
}

export const getMyState = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    return await loadDriverState(ctx, userId);
  },
});

export const generateTicketUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const profile = await ctx.db
      .query("driverProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (!profile) throw new ConvexError("Complete your driver profile first.");
    return await ctx.storage.generateUploadUrl();
  },
});

export const saveSnapshot = mutation({
  args: {
    settings: v.object({
      avgTons: v.number(),
      truckNumber: v.string(),
    }),
    settlements: v.array(settlementValue),
    tickets: v.array(ticketValue),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    assertSnapshot(args.settlements, args.tickets);

    const profile = await ctx.db
      .query("driverProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (!profile) throw new ConvexError("Complete your driver profile first.");

    const now = Date.now();
    const avgTons = Math.min(30, Math.max(17, args.settings.avgTons));
    await ctx.db.patch(profile._id, {
      avgTons,
      company: TRUCKING_COMPANY,
      updatedAt: now,
    });

    const existingSettlements = await ctx.db
      .query("settlements")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const settlementsByClient = new Map(existingSettlements.map((item) => [item.clientId, item]));
    const desiredSettlementIds = new Set<string>();
    const desiredLoadIds = new Set<string>();
    const loadDatabaseIds = new Map<string, Id<"loads">>();

    const existingLoads = await ctx.db
      .query("loads")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const loadsByClient = new Map(existingLoads.map((item) => [item.clientId, item]));

    for (const settlement of args.settlements) {
      desiredSettlementIds.add(settlement.clientId);
      const existingSettlement = settlementsByClient.get(settlement.clientId);
      const settlementId = existingSettlement?._id ?? await ctx.db.insert("settlements", {
        userId,
        clientId: settlement.clientId,
        payoutDate: settlement.payoutDate,
        createdAt: now,
        updatedAt: now,
      });
      if (existingSettlement) {
        await ctx.db.patch(existingSettlement._id, {
          payoutDate: settlement.payoutDate,
          updatedAt: now,
        });
      }

      for (const load of settlement.loads) {
        desiredLoadIds.add(load.clientId);
        const existingLoad = loadsByClient.get(load.clientId);
        const fields = {
          settlementId,
          day: load.day,
          miles: load.miles,
          tons: load.tons,
          pricingMode: load.pricingMode,
          customTotal: load.customTotal,
          customRate: load.customRate,
          note: load.note?.trim() || undefined,
          calculatedPay: calculatedPay(load),
          updatedAt: now,
        };
        if (existingLoad) {
          await ctx.db.patch(existingLoad._id, fields);
          loadDatabaseIds.set(load.clientId, existingLoad._id);
        } else {
          const loadId = await ctx.db.insert("loads", {
            userId,
            clientId: load.clientId,
            ...fields,
            createdAt: now,
          });
          loadDatabaseIds.set(load.clientId, loadId);
        }
      }
    }

    const existingTickets = await ctx.db
      .query("tickets")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const ticketsByClient = new Map(existingTickets.map((item) => [item.clientId, item]));
    const desiredTicketIds = new Set<string>();

    for (const ticket of args.tickets) {
      desiredTicketIds.add(ticket.clientId);
      const loadId = loadDatabaseIds.get(ticket.loadClientId);
      if (!loadId) throw new ConvexError("A ticket references an unknown load.");
      const existing = ticketsByClient.get(ticket.clientId);
      // An already-open app may submit the pre-migration storage ID. Preserve
      // the corrected image and its original instead of undoing the migration.
      const staleOrientation = existing?.orientationVersion === 1 && ticket.storageId === existing.orientationSourceId;
      const sameImage = staleOrientation || existing?.storageId === ticket.storageId;
      if (ticket.ticketRead) validateRead(ticket.ticketRead);
      // A stale open app must not erase a completed server backfill. Replacing
      // the image deliberately resets the read to the replacement's metadata.
      const ticketRead = sameImage ? preferredTicketRead(existing?.ticketRead, ticket.ticketRead) : ticket.ticketRead;
      const fields = {
        loadId,
        type: ticket.type,
        storageId: staleOrientation ? existing!.storageId : ticket.storageId,
        originalStorageId: sameImage ? existing?.originalStorageId ?? ticket.originalStorageId : ticket.originalStorageId,
        orientationVersion: sameImage ? existing?.orientationVersion ?? ticket.orientationVersion : ticket.orientationVersion,
        orientationSourceId: sameImage ? existing?.orientationSourceId : undefined,
        orientationConfidence: sameImage ? existing?.orientationConfidence : undefined,
        filter: ticket.filter,
        ticketRead,
        ocr: ocrWithRead(ticket.ocr, ticketRead),
        capturedAt: ticket.capturedAt,
        modifiedAt: ticket.modifiedAt,
        updatedAt: now,
      };
      if (existing) {
        await ctx.db.patch(existing._id, fields);
        if (existing.storageId !== fields.storageId) {
          await ctx.storage.delete(existing.storageId);
        }
        if (existing.originalStorageId && existing.originalStorageId !== existing.storageId && existing.originalStorageId !== fields.originalStorageId) {
          await ctx.storage.delete(existing.originalStorageId);
        }
      } else {
        await ctx.db.insert("tickets", {
          userId,
          clientId: ticket.clientId,
          ...fields,
          createdAt: now,
        });
      }
    }

    for (const ticket of existingTickets) {
      if (!desiredTicketIds.has(ticket.clientId)) {
        await ctx.storage.delete(ticket.storageId);
        if (ticket.originalStorageId && ticket.originalStorageId !== ticket.storageId) {
          await ctx.storage.delete(ticket.originalStorageId);
        }
        await ctx.db.delete(ticket._id);
      }
    }
    for (const load of existingLoads) {
      if (!desiredLoadIds.has(load.clientId)) await ctx.db.delete(load._id);
    }
    for (const settlement of existingSettlements) {
      if (!desiredSettlementIds.has(settlement.clientId)) await ctx.db.delete(settlement._id);
    }

    return { syncedAt: now };
  },
});

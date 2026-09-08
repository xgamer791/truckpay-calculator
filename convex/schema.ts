import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const role = v.union(v.literal("driver"), v.literal("admin"));
const pricingMode = v.union(
  v.literal("auto"),
  v.literal("fixed"),
  v.literal("perton"),
);

export default defineSchema({
  ...authTables,

  driverProfiles: defineTable({
    userId: v.id("users"),
    email: v.string(),
    fullName: v.string(),
    phone: v.string(),
    company: v.string(),
    truckNumber: v.string(),
    avgTons: v.number(),
    commissionRate: v.number(),
    role,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_email", ["email"])
    .index("by_role", ["role"]),

  settlements: defineTable({
    userId: v.id("users"),
    clientId: v.string(),
    payoutDate: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_client", ["userId", "clientId"])
    .index("by_user_payout", ["userId", "payoutDate"]),

  loads: defineTable({
    userId: v.id("users"),
    settlementId: v.id("settlements"),
    clientId: v.string(),
    day: v.string(),
    miles: v.number(),
    tons: v.number(),
    pricingMode,
    customTotal: v.optional(v.number()),
    customRate: v.optional(v.number()),
    note: v.optional(v.string()),
    calculatedPay: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_settlement", ["settlementId"])
    .index("by_user_client", ["userId", "clientId"]),

  tickets: defineTable({
    userId: v.id("users"),
    loadId: v.id("loads"),
    clientId: v.string(),
    type: v.string(),
    storageId: v.id("_storage"),
    originalStorageId: v.optional(v.id("_storage")),
    filter: v.optional(v.string()),
    ocr: v.optional(v.any()),
    capturedAt: v.optional(v.string()),
    modifiedAt: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_load", ["loadId"])
    .index("by_user_client", ["userId", "clientId"]),
});

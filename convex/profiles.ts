import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ADMIN_EMAIL, normalizedEmail, requireUserId } from "./lib/security";

export const current = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const user = await ctx.db.get(userId);
    const profile = await ctx.db
      .query("driverProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    const role = normalizedEmail(user?.email) === ADMIN_EMAIL ? "admin" : "driver";

    return {
      user: user ? { id: user._id, email: user.email ?? "" } : null,
      profile: profile ? { ...profile, role } : null,
    };
  },
});

export const complete = mutation({
  args: {
    fullName: v.string(),
    phone: v.string(),
    company: v.string(),
    truckNumber: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const user = await ctx.db.get(userId);
    const email = normalizedEmail(user?.email);
    if (!email) throw new Error("Your account is missing an email address.");

    const clean = {
      fullName: args.fullName.trim(),
      phone: args.phone.trim(),
      company: args.company.trim(),
      truckNumber: args.truckNumber.trim(),
    };
    if (Object.values(clean).some((value) => !value)) {
      throw new Error("Complete every driver profile field.");
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("driverProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    const fields = {
      ...clean,
      email,
      avgTons: existing?.avgTons ?? 25,
      commissionRate: existing?.commissionRate ?? 0.3,
      role: email === ADMIN_EMAIL ? ("admin" as const) : ("driver" as const),
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, fields);
      return existing._id;
    }
    return await ctx.db.insert("driverProfiles", {
      userId,
      ...fields,
      createdAt: now,
    });
  },
});

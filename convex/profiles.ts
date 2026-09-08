import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ADMIN_EMAIL, normalizedEmail, requireUserId } from "./lib/security";
import {
  FLEET_TRUCKS,
  isFleetTruck,
  TRUCKING_COMPANY,
} from "./lib/fleet";

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
      profile: profile ? { ...profile, company: TRUCKING_COMPANY, role } : null,
    };
  },
});

export const availableTrucks = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const user = await ctx.db.get(userId);
    const email = normalizedEmail(user?.email);
    if (!email) throw new Error("Your account is missing an email address.");

    const profiles = await ctx.db.query("driverProfiles").collect();
    const currentProfile = profiles.find((profile) => profile.userId === userId);
    const claimedByDrivers = new Map(
      profiles
        .filter((profile) => normalizedEmail(profile.email) !== ADMIN_EMAIL)
        .map((profile) => [profile.truckNumber, profile.userId]),
    );

    return {
      company: TRUCKING_COMPANY,
      assignedTruck: currentProfile?.truckNumber ?? null,
      trucks: FLEET_TRUCKS.filter((truckNumber) => {
        const claimedBy = claimedByDrivers.get(truckNumber);
        return !claimedBy || claimedBy === userId;
      }),
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
      truckNumber: args.truckNumber.trim(),
    };
    if (Object.values(clean).some((value) => !value)) {
      throw new Error("Complete every driver profile field.");
    }
    if (!isFleetTruck(clean.truckNumber)) {
      throw new Error("Choose a truck from the JLP Trucking fleet.");
    }
    const now = Date.now();
    const existing = await ctx.db
      .query("driverProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    const truckClaims = await ctx.db
      .query("driverProfiles")
      .withIndex("by_truck", (q) => q.eq("truckNumber", clean.truckNumber))
      .collect();
    const truckClaimedByAnotherDriver = truckClaims.some(
      (profile) => profile.userId !== userId && normalizedEmail(profile.email) !== ADMIN_EMAIL,
    );
    if (truckClaimedByAnotherDriver) {
      throw new Error(`Truck ${clean.truckNumber} was just assigned to another driver.`);
    }
    const fields = {
      ...clean,
      company: TRUCKING_COMPANY,
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

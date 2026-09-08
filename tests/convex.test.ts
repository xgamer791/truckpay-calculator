import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { describe, expect, it } from "vitest";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.ts");
const completeProfile = makeFunctionReference<"mutation">("profiles:complete");
const currentProfile = makeFunctionReference<"query">("profiles:current");
const saveSnapshot = makeFunctionReference<"mutation">("sync:saveSnapshot");
const getMyState = makeFunctionReference<"query">("sync:getMyState");
const listDrivers = makeFunctionReference<"query">("admin:listDrivers");

async function createUser(t: ReturnType<typeof convexTest>, email: string) {
  const userId = await t.run(async (ctx) => await ctx.db.insert("users", { email }));
  return {
    userId,
    client: t.withIdentity({
      subject: `${userId}|test-session`,
      issuer: "https://convex.test",
    }),
  };
}

async function onboard(client: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>, name: string) {
  await client.mutation(completeProfile, {
    fullName: name,
    phone: "210-555-0100",
    company: "Test Hauling",
    truckNumber: "1205",
  });
}

describe("Convex account isolation", () => {
  it("requires authentication for driver data", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(currentProfile, {})).rejects.toThrow("signed in");
  });

  it("keeps identical client record IDs separate between drivers", async () => {
    const t = convexTest(schema, modules);
    const first = await createUser(t, "first@example.com");
    const second = await createUser(t, "second@example.com");
    await onboard(first.client, "First Driver");
    await onboard(second.client, "Second Driver");

    const snapshot = (miles: number) => ({
      settings: { avgTons: 25, truckNumber: "1205" },
      settlements: [{
        clientId: "same-settlement",
        payoutDate: "2026-09-12",
        loads: [{
          clientId: "same-load",
          day: "Monday",
          miles,
          tons: 25,
          pricingMode: "auto" as const,
        }],
      }],
      tickets: [],
    });

    await first.client.mutation(saveSnapshot, snapshot(52));
    await second.client.mutation(saveSnapshot, snapshot(92));

    const firstState = await first.client.query(getMyState, {});
    const secondState = await second.client.query(getMyState, {});
    expect(firstState.history[0].loads[0].miles).toBe(52);
    expect(secondState.history[0].loads[0].miles).toBe(92);
  });

  it("grants the configured admin account an all-driver view", async () => {
    const t = convexTest(schema, modules);
    const admin = await createUser(t, "chris@mangomarketeers.com");
    const driver = await createUser(t, "driver@example.com");
    await onboard(admin.client, "Chris Admin");
    await onboard(driver.client, "Driver One");

    await t.run(async (ctx) => {
      const savedAdminProfile = await ctx.db
        .query("driverProfiles")
        .withIndex("by_user", (q) => q.eq("userId", admin.userId))
        .unique();
      if (!savedAdminProfile) throw new Error("Missing admin profile");
      await ctx.db.patch(savedAdminProfile._id, { role: "driver" });
    });

    const drivers = await admin.client.query(listDrivers, {});
    const currentAdmin = await admin.client.query(currentProfile, {});
    expect(currentAdmin.profile?.role).toBe("admin");
    expect(drivers.map((item: { email: string }) => item.email)).toEqual([
      "driver@example.com",
    ]);
    await expect(driver.client.query(listDrivers, {})).rejects.toThrow("Administrator");
  });
});

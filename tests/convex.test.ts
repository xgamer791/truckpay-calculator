import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { describe, expect, it } from "vitest";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.ts");
const completeProfile = makeFunctionReference<"mutation">("profiles:complete");
const currentProfile = makeFunctionReference<"query">("profiles:current");
const availableTrucks = makeFunctionReference<"query">("profiles:availableTrucks");
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

async function onboard(
  client: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>,
  name: string,
  truckNumber = "1203",
) {
  await client.mutation(completeProfile, {
    fullName: name,
    phone: "210-555-0100",
    company: "Test Hauling",
    truckNumber,
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
    await onboard(first.client, "First Driver", "1203");
    await onboard(second.client, "Second Driver", "1204");

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
    expect(firstState.profile?.truckNumber).toBe("1203");
    expect(secondState.profile?.truckNumber).toBe("1204");
  });

  it("grants the configured admin account an all-driver view", async () => {
    const t = convexTest(schema, modules);
    const admin = await createUser(t, "chris@mangomarketeers.com");
    const driver = await createUser(t, "driver@example.com");
    await onboard(admin.client, "Chris Admin", "1211");
    await onboard(driver.client, "Driver One", "1210");

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

  it("automatically grants Rolling Stone LLC access to the admin dashboard", async () => {
    const t = convexTest(schema, modules);
    const rollingStone = await createUser(t, "RollingStoneLLC@Yahoo.com");
    const driver = await createUser(t, "driver@example.com");
    await onboard(rollingStone.client, "Rolling Stone LLC", "None");
    await onboard(driver.client, "Driver One", "1203");

    const currentAdmin = await rollingStone.client.query(currentProfile, {});
    const drivers = await rollingStone.client.query(listDrivers, {});

    expect(currentAdmin.profile?.role).toBe("admin");
    expect(drivers.map((item: { email: string }) => item.email)).toEqual([
      "driver@example.com",
    ]);
  });

  it("locks profiles to JLP Trucking and shows only open fleet trucks", async () => {
    const t = convexTest(schema, modules);
    const owner = await createUser(t, "owner@example.com");
    const driver = await createUser(t, "driver@example.com");

    await onboard(owner.client, "Truck 1205 Owner", "1205");
    const savedOwner = await owner.client.query(currentProfile, {});
    expect(savedOwner.profile?.company).toBe("JLP Trucking");

    const ownerOptions = await owner.client.query(availableTrucks, {});
    expect(ownerOptions.assignedTruck).toBe("1205");
    expect(ownerOptions.trucks).toContain("1205");

    const driverOptions = await driver.client.query(availableTrucks, {});
    expect(driverOptions.company).toBe("JLP Trucking");
    expect(driverOptions.trucks).toEqual(["None", "1203", "1204", "1211", "1210"]);
    await expect(onboard(driver.client, "Other Driver", "1205")).rejects.toThrow("assigned to another driver");
    await expect(onboard(driver.client, "Other Driver", "9999")).rejects.toThrow("JLP Trucking fleet");
  });

  it("removes a claimed truck from every other driver's choices", async () => {
    const t = convexTest(schema, modules);
    const first = await createUser(t, "first@example.com");
    const second = await createUser(t, "second@example.com");
    await onboard(first.client, "First Driver", "1203");

    const firstOptions = await first.client.query(availableTrucks, {});
    const secondOptions = await second.client.query(availableTrucks, {});
    expect(firstOptions.trucks).toContain("1203");
    expect(secondOptions.trucks).not.toContain("1203");
    await expect(onboard(second.client, "Second Driver", "1203")).rejects.toThrow("just assigned");
  });

  it("lets multiple drivers choose None without claiming a fleet truck", async () => {
    const t = convexTest(schema, modules);
    const first = await createUser(t, "first@example.com");
    const second = await createUser(t, "second@example.com");

    await onboard(first.client, "First Driver", "None");
    await onboard(second.client, "Second Driver", "None");

    const firstOptions = await first.client.query(availableTrucks, {});
    const secondOptions = await second.client.query(availableTrucks, {});
    expect(firstOptions.trucks[0]).toBe("None");
    expect(secondOptions.trucks[0]).toBe("None");
    expect(secondOptions.trucks).toContain("1203");
  });
});

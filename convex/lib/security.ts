import { getAuthUserId } from "@convex-dev/auth/server";
import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import { ConvexError } from "convex/values";
import type { DataModel, Id } from "../_generated/dataModel";

export const ADMIN_EMAIL = "chris@mangomarketeers.com";

type ReadCtx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>;

export async function requireUserId(ctx: ReadCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new ConvexError("You must be signed in.");
  }
  return userId;
}

export function normalizedEmail(email: string | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

export async function requireAdmin(ctx: ReadCtx): Promise<Id<"users">> {
  const userId = await requireUserId(ctx);
  const user = await ctx.db.get(userId);
  if (!user || normalizedEmail(user.email) !== ADMIN_EMAIL) {
    throw new ConvexError("Administrator access is required.");
  }
  return userId;
}

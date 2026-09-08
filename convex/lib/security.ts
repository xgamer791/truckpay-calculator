import { getAuthUserId } from "@convex-dev/auth/server";
import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import { ConvexError } from "convex/values";
import type { DataModel, Id } from "../_generated/dataModel";

export const ADMIN_EMAILS = [
  "chris@mangomarketeers.com",
  "rollingstonellc@yahoo.com",
] as const;

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

export function isAdminEmail(email: string | undefined): boolean {
  const normalized = normalizedEmail(email);
  return ADMIN_EMAILS.some((adminEmail) => adminEmail === normalized);
}

export async function requireAdmin(ctx: ReadCtx): Promise<Id<"users">> {
  const userId = await requireUserId(ctx);
  const user = await ctx.db.get(userId);
  if (!user || !isAdminEmail(user.email)) {
    throw new ConvexError("Administrator access is required.");
  }
  return userId;
}

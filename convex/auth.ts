import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { emailVerification, passwordReset } from "./email";

const password = Password({
  profile(params) {
    const email = String(params.email ?? "").trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      throw new ConvexError("Enter a valid email address.");
    }
    return { email };
  },
  validatePasswordRequirements(value) {
    if (value.length < 8) {
      throw new ConvexError("Password must be at least 8 characters.");
    }
  },
  reset: passwordReset,
  verify: emailVerification,
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [password],
});

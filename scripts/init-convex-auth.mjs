import { spawnSync } from "node:child_process";
import { exportJWK, exportPKCS8, generateKeyPair } from "jose";

function runConvex(args, options = {}) {
  return spawnSync("npx", ["convex", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    ...options,
  });
}

function readEnv(name) {
  const result = runConvex(["env", "get", name]);
  return result.status === 0 ? result.stdout.trim() : "";
}

function setEnv(name, value) {
  const result = runConvex(["env", "set", name], {
    input: value,
    stdio: ["pipe", "inherit", "inherit"],
  });
  if (result.status !== 0) {
    throw new Error(`Unable to configure ${name}.`);
  }
}

if (!process.env.CONVEX_DEPLOY_KEY) {
  throw new Error("CONVEX_DEPLOY_KEY is not configured.");
}

if (!readEnv("AUTH_RESEND_KEY")) {
  throw new Error("AUTH_RESEND_KEY is missing from the Convex production deployment.");
}

if (!readEnv("JWKS") || !readEnv("JWT_PRIVATE_KEY")) {
  console.log("Initializing Convex Auth signing keys…");
  const keys = await generateKeyPair("RS256", { extractable: true });
  const privateKey = await exportPKCS8(keys.privateKey);
  const publicKey = await exportJWK(keys.publicKey);
  const jwks = JSON.stringify({ keys: [{ use: "sig", ...publicKey }] });
  setEnv("JWT_PRIVATE_KEY", privateKey.trimEnd().replace(/\n/g, " "));
  setEnv("JWKS", jwks);
} else {
  console.log("Convex Auth signing keys are already configured.");
}

const siteUrl = process.env.DRIVERPAY_SITE_URL;
if (siteUrl && readEnv("SITE_URL") !== siteUrl) {
  setEnv("SITE_URL", siteUrl);
}

console.log("Convex Auth production environment is ready.");

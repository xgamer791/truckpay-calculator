import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";

const http = httpRouter();
auth.addHttpRoutes(http);

http.route({
  path: "/internal/resend-status-c8da7cd13ed9b35859c49a712186dea2",
  method: "GET",
  handler: httpAction(async () => {
    const apiKey = process.env.AUTH_RESEND_KEY?.trim();
    if (!apiKey) {
      return new Response(JSON.stringify({ keyPresent: false }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }
    try {
      const response = await fetch("https://api.resend.com/domains", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const payload = await response.json().catch(() => null) as {
        data?: Array<{ name?: string; status?: string }>;
        message?: string;
      } | null;
      const domain = payload?.data?.find((item) => item.name === "freedomaminos.com");
      return new Response(JSON.stringify({
        keyPresent: true,
        resendStatus: response.status,
        domainStatus: domain?.status ?? "not-found",
        error: response.ok ? undefined : payload?.message ?? "unknown",
      }), { headers: { "Content-Type": "application/json" } });
    } catch (error) {
      return new Response(JSON.stringify({
        keyPresent: true,
        runtimeError: error instanceof Error ? error.message : "unknown",
      }), { headers: { "Content-Type": "application/json" } });
    }
  }),
});

export default http;

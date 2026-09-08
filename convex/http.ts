import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";

const http = httpRouter();
auth.addHttpRoutes(http);

http.route({
  path: "/internal/resend-status-c8da7cd13ed9b35859c49a712186dea2",
  method: "GET",
  handler: httpAction(async () => {
    const apiKey = process.env.AUTH_RESEND_KEY;
    if (!apiKey) {
      return Response.json({ keyPresent: false }, { status: 503 });
    }
    const response = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const payload = await response.json().catch(() => null) as {
      data?: Array<{ name?: string; status?: string }>;
      message?: string;
    } | null;
    const domain = payload?.data?.find((item) => item.name === "freedomaminos.com");
    return Response.json({
      keyPresent: true,
      resendStatus: response.status,
      domainStatus: domain?.status ?? "not-found",
      error: response.ok ? undefined : payload?.message ?? "unknown",
    });
  }),
});

export default http;

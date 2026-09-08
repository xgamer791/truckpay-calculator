import ResendProvider from "@auth/core/providers/resend";

const FROM = "DriverPay Pro <noreply@freedomaminos.com>";

function generateOtp() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return String(values[0] % 100_000_000).padStart(8, "0");
}

function emailHtml(title: string, message: string, token: string) {
  return `<!doctype html>
<html><body style="margin:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e2e8f0">
  <div style="max-width:520px;margin:0 auto;padding:40px 20px">
    <div style="background:#111c32;border:1px solid #26344f;border-radius:20px;padding:32px">
      <div style="font-size:24px;font-weight:900;color:#fff">DriverPay <span style="color:#3b82f6">Pro</span></div>
      <h1 style="font-size:22px;margin:28px 0 8px;color:#fff">${title}</h1>
      <p style="color:#94a3b8;line-height:1.6">${message}</p>
      <div style="font-size:30px;letter-spacing:8px;font-weight:900;color:#fff;background:#0b1220;border-radius:14px;padding:18px;text-align:center;margin:24px 0">${token}</div>
      <p style="font-size:13px;color:#64748b;line-height:1.5">This code expires soon. If you did not request it, you can safely ignore this email.</p>
    </div>
  </div>
</body></html>`;
}

function makeOtpProvider(options: {
  id: string;
  subject: string;
  title: string;
  message: string;
}) {
  return ResendProvider({
    id: options.id,
    apiKey: process.env.AUTH_RESEND_KEY,
    from: FROM,
    maxAge: 15 * 60,
    async generateVerificationToken() {
      return generateOtp();
    },
    async sendVerificationRequest({ identifier, provider, token }) {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${provider.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: FROM,
          to: [identifier],
          subject: options.subject,
          html: emailHtml(options.title, options.message, token),
          text: `${options.message}\n\nYour DriverPay Pro code is: ${token}`,
        }),
      });

      if (!response.ok) {
        throw new Error(`Unable to send email (${response.status}).`);
      }
    },
  });
}

export const emailVerification = makeOtpProvider({
  id: "driverpay-email-verification",
  subject: "Verify your DriverPay Pro account",
  title: "Verify your email",
  message: "Enter this code in DriverPay Pro to finish creating your account.",
});

export const passwordReset = makeOtpProvider({
  id: "driverpay-password-reset",
  subject: "Reset your DriverPay Pro password",
  title: "Reset your password",
  message: "Enter this code in DriverPay Pro to choose a new password.",
});

import "server-only";
import { Resend } from "resend";
import { env } from "./env";
import type { Identifier } from "./validation";

export type DeliveryResult = { delivered: true } | { delivered: false };

export class DeliveryError extends Error {}

let resend: Resend | null = null;

function emailHtml(code: string, purpose: "signup" | "login") {
  const action = purpose === "signup" ? "finish creating your account" : "sign in";
  return `<!doctype html><html><body style="margin:0;background:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:420px;background:#fff;border-radius:12px;padding:32px">
<tr><td style="font-size:15px;color:#44403c;line-height:1.5">
<p style="margin:0 0 16px;font-weight:600;color:#1c1917">${env.appName}</p>
<p style="margin:0 0 20px">Use this code to ${action}:</p>
<p style="margin:0 0 20px;font-size:32px;letter-spacing:8px;font-weight:700;color:#1c1917;font-family:ui-monospace,Menlo,monospace">${code}</p>
<p style="margin:0;color:#78716c;font-size:13px">It expires in 5 minutes. If you didn't request it, you can ignore this email. Nobody from ${env.appName} will ever ask you for this code.</p>
</td></tr></table></td></tr></table></body></html>`;
}

async function sendEmail(to: string, code: string, purpose: "signup" | "login") {
  if (!env.resendApiKey) return false;
  resend ??= new Resend(env.resendApiKey);
  const { error } = await resend.emails.send({
    from: env.emailFrom,
    to,
    subject: `${code} is your ${env.appName} code`,
    html: emailHtml(code, purpose),
    text: `Your ${env.appName} code is ${code}. It expires in 5 minutes. If you didn't request it, ignore this email.`,
  });
  if (error) {
    console.error("[delivery] Resend error", error);
    throw new DeliveryError("We couldn't send the email. Try again shortly.");
  }
  return true;
}

async function sendSms(to: string, code: string) {
  const tw = env.twilio;
  if (!tw) return false;
  const body = new URLSearchParams({
    To: to,
    // Origin-bound format lets iOS/Android autofill the code securely.
    Body: `${code} is your ${env.appName} code. It expires in 5 minutes.\n\n@${env.rpId} #${code}`,
  });
  body.set(tw.from.startsWith("MG") ? "MessagingServiceSid" : "From", tw.from);

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${tw.accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization:
          "Basic " + Buffer.from(`${tw.accountSid}:${tw.authToken}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    },
  );
  if (!res.ok) {
    console.error("[delivery] Twilio error", res.status, await res.text());
    throw new DeliveryError("We couldn't send the text message. Try again shortly.");
  }
  return true;
}

/**
 * Sends the code over the identifier's channel. Returns delivered:false when
 * no provider is configured (local development / demo deployments).
 */
export async function deliverCode(
  to: Identifier,
  code: string,
  purpose: "signup" | "login",
): Promise<DeliveryResult> {
  const sent =
    to.channel === "email"
      ? await sendEmail(to.value, code, purpose)
      : await sendSms(to.value, code);

  if (!sent) {
    if (!env.showCodesWhenUndelivered) {
      throw new DeliveryError(
        `${to.channel === "email" ? "Email" : "SMS"} delivery isn't configured.`,
      );
    }
    console.info(`[delivery] (no provider) ${purpose} code for ${to.value}: ${code}`);
    return { delivered: false };
  }
  return { delivered: true };
}

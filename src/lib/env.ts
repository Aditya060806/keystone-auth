import "server-only";
import { z } from "zod";

const isProd = process.env.NODE_ENV === "production";

const schema = z.object({
  /** Postgres connection string. Unset in development = embedded PGlite. */
  DATABASE_URL: z.string().optional(),
  /** Used to HMAC one-time codes. Must be long and random in production. */
  AUTH_SECRET: z.string().min(32).optional(),
  /** Public origin, e.g. https://app.example.com. Also the WebAuthn origin. */
  APP_URL: z.url().optional(),
  APP_NAME: z.string().default("Keystone"),

  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("Keystone <onboarding@resend.dev>"),

  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  /** Either a sender number (E.164) or a Messaging Service SID (MG...). */
  TWILIO_FROM: z.string().optional(),

  /**
   * Demo only: show the code on screen when a delivery provider is not
   * configured. Always on in development; must be explicitly enabled in prod.
   */
  DEMO_SHOW_CODES: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(
    "Invalid environment variables:\n" + z.prettifyError(parsed.error),
  );
}
const raw = parsed.data;

if (isProd && !raw.AUTH_SECRET) {
  throw new Error("AUTH_SECRET (32+ chars) is required in production.");
}
if (isProd && !raw.DATABASE_URL) {
  throw new Error("DATABASE_URL is required in production.");
}

function resolveAppUrl(): string {
  if (raw.APP_URL) return raw.APP_URL.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

const appUrl = resolveAppUrl();

export const env = {
  isProd,
  databaseUrl: raw.DATABASE_URL,
  authSecret:
    raw.AUTH_SECRET ?? "dev-only-insecure-secret-change-me-0123456789abcdef",
  appUrl,
  appName: raw.APP_NAME,
  rpId: new URL(appUrl).hostname,
  resendApiKey: raw.RESEND_API_KEY,
  emailFrom: raw.EMAIL_FROM,
  twilio:
    raw.TWILIO_ACCOUNT_SID && raw.TWILIO_AUTH_TOKEN && raw.TWILIO_FROM
      ? {
          accountSid: raw.TWILIO_ACCOUNT_SID,
          authToken: raw.TWILIO_AUTH_TOKEN,
          from: raw.TWILIO_FROM,
        }
      : null,
  showCodesWhenUndelivered: !isProd || raw.DEMO_SHOW_CODES,
} as const;

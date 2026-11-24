import "server-only";
import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { generateOtp, hashOtp, safeEqualHex } from "./crypto";
import { deliverCode } from "./delivery";
import { env } from "./env";
import { rateLimitAll } from "./rate-limit";
import type { Identifier } from "./validation";

export const OTP_TTL_SECONDS = 5 * 60;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_SECONDS = 30;

type Purpose = "signup" | "login";
type Payload = { surname: string; dateOfBirth: string };

export type IssueResult =
  | { ok: true; expiresInSeconds: number; devCode?: string }
  | { ok: false; reason: "rate_limited"; retryAfterSeconds: number };

export async function issueOtp(opts: {
  identifier: Identifier;
  purpose: Purpose;
  ip: string | null;
  payload?: Payload;
  /** When false, rate limits apply but nothing is stored or sent. */
  send?: boolean;
}): Promise<IssueResult> {
  const { identifier, purpose } = opts;

  const limited = await rateLimitAll([
    {
      key: `otp:send:cooldown:${identifier.value}`,
      limit: 1,
      windowSeconds: OTP_RESEND_COOLDOWN_SECONDS,
    },
    { key: `otp:send:hour:${identifier.value}`, limit: 5, windowSeconds: 3600 },
    ...(opts.ip
      ? [{ key: `otp:send:ip:${opts.ip}`, limit: 30, windowSeconds: 3600 }]
      : []),
  ]);
  if (!limited.ok) {
    return { ok: false, reason: "rate_limited", retryAfterSeconds: limited.retryAfterSeconds };
  }

  if (opts.send === false) return { ok: true, expiresInSeconds: OTP_TTL_SECONDS };

  const db = await getDb();
  const code = generateOtp();
  const now = new Date();

  // Only the newest code for an identifier + purpose is ever valid.
  await db
    .update(schema.otpCodes)
    .set({ consumedAt: now })
    .where(
      and(
        eq(schema.otpCodes.identifier, identifier.value),
        eq(schema.otpCodes.purpose, purpose),
        isNull(schema.otpCodes.consumedAt),
      ),
    );

  const [row] = await db
    .insert(schema.otpCodes)
    .values({
      identifier: identifier.value,
      channel: identifier.channel,
      purpose,
      codeHash: hashOtp(env.authSecret, { purpose, identifier: identifier.value, code }),
      payload: opts.payload,
      maxAttempts: OTP_MAX_ATTEMPTS,
      expiresAt: new Date(now.getTime() + OTP_TTL_SECONDS * 1000),
    })
    .returning({ id: schema.otpCodes.id });

  try {
    const result = await deliverCode(identifier, code, purpose);
    return {
      ok: true,
      expiresInSeconds: OTP_TTL_SECONDS,
      ...(result.delivered ? {} : { devCode: code }),
    };
  } catch (err) {
    await db
      .update(schema.otpCodes)
      .set({ consumedAt: new Date() })
      .where(eq(schema.otpCodes.id, row.id));
    throw err;
  }
}

export type VerifyResult =
  | { ok: true; payload: Payload | null }
  | {
      ok: false;
      reason: "invalid" | "expired" | "too_many_attempts" | "rate_limited";
      attemptsLeft?: number;
      retryAfterSeconds?: number;
    };

export async function verifyOtp(opts: {
  identifier: Identifier;
  purpose: Purpose;
  code: string;
  ip: string | null;
}): Promise<VerifyResult> {
  const { identifier, purpose, code } = opts;

  // Caps guesses across *all* codes for this address, so requesting fresh
  // codes can't be used to reset the attempt counter indefinitely.
  const limited = await rateLimitAll([
    { key: `otp:verify:id:${identifier.value}`, limit: 15, windowSeconds: 3600 },
    ...(opts.ip
      ? [{ key: `otp:verify:ip:${opts.ip}`, limit: 60, windowSeconds: 3600 }]
      : []),
  ]);
  if (!limited.ok) {
    return { ok: false, reason: "rate_limited", retryAfterSeconds: limited.retryAfterSeconds };
  }

  const db = await getDb();
  const [row] = await db
    .select()
    .from(schema.otpCodes)
    .where(
      and(
        eq(schema.otpCodes.identifier, identifier.value),
        eq(schema.otpCodes.purpose, purpose),
        isNull(schema.otpCodes.consumedAt),
      ),
    )
    .orderBy(desc(schema.otpCodes.createdAt))
    .limit(1);

  if (!row) return { ok: false, reason: "invalid" };
  if (row.expiresAt.getTime() <= Date.now()) {
    await db
      .update(schema.otpCodes)
      .set({ consumedAt: new Date() })
      .where(eq(schema.otpCodes.id, row.id));
    return { ok: false, reason: "expired" };
  }

  // Count the attempt *before* comparing, atomically, so parallel guesses
  // can't exceed the limit.
  const [counted] = await db
    .update(schema.otpCodes)
    .set({ attempts: sql`${schema.otpCodes.attempts} + 1` })
    .where(
      and(
        eq(schema.otpCodes.id, row.id),
        isNull(schema.otpCodes.consumedAt),
        lt(schema.otpCodes.attempts, schema.otpCodes.maxAttempts),
      ),
    )
    .returning({ attempts: schema.otpCodes.attempts });

  if (!counted) {
    await db
      .update(schema.otpCodes)
      .set({ consumedAt: new Date() })
      .where(eq(schema.otpCodes.id, row.id));
    return { ok: false, reason: "too_many_attempts" };
  }

  const expected = hashOtp(env.authSecret, { purpose, identifier: identifier.value, code });
  if (!safeEqualHex(expected, row.codeHash)) {
    const attemptsLeft = row.maxAttempts - counted.attempts;
    if (attemptsLeft <= 0) {
      await db
        .update(schema.otpCodes)
        .set({ consumedAt: new Date() })
        .where(eq(schema.otpCodes.id, row.id));
      return { ok: false, reason: "too_many_attempts" };
    }
    return { ok: false, reason: "invalid", attemptsLeft };
  }

  // Single use: only one concurrent request can flip consumedAt.
  const [consumed] = await db
    .update(schema.otpCodes)
    .set({ consumedAt: new Date() })
    .where(and(eq(schema.otpCodes.id, row.id), isNull(schema.otpCodes.consumedAt)))
    .returning({ id: schema.otpCodes.id });
  if (!consumed) return { ok: false, reason: "invalid" };

  return { ok: true, payload: row.payload ?? null };
}

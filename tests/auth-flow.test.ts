/**
 * Integration tests against a real (in-memory) Postgres via PGlite, running
 * the same migrations as production. `next/headers` is replaced with a
 * swappable cookie jar so each test can act as a different device.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { currentJar, newDevice, switchToDevice } from "./harness";

const { getDb, schema } = await import("@/db");
const { issueOtp, verifyOtp, OTP_MAX_ATTEMPTS } = await import("@/lib/otp");
const { startSession, getSession, endSession } = await import("@/lib/session");
const { createUser } = await import("@/lib/users");
const { rateLimit } = await import("@/lib/rate-limit");
const { eq } = await import("drizzle-orm");

let n = 0;
const freshEmail = () => ({ channel: "email" as const, value: `user${++n}-${Date.now()}@example.com` });
const ctx = (ua: string) => ({ ip: `10.0.${n}.${Math.floor(Math.random() * 250)}`, userAgent: ua });
const device = newDevice;
const use = switchToDevice;

beforeEach(async () => {
  const db = await getDb();
  await db.delete(schema.rateLimits);
});

describe("one-time codes", () => {
  it("verifies a correct code once, and only once", async () => {
    const id = freshEmail();
    const issued = await issueOtp({ identifier: id, purpose: "login", ip: null });
    expect(issued.ok).toBe(true);
    const code = (issued as { devCode: string }).devCode;
    expect(code).toMatch(/^\d{6}$/);

    expect((await verifyOtp({ identifier: id, purpose: "login", code, ip: null })).ok).toBe(true);
    const replay = await verifyOtp({ identifier: id, purpose: "login", code, ip: null });
    expect(replay).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("stores only a keyed hash, never the code", async () => {
    const id = freshEmail();
    const issued = (await issueOtp({ identifier: id, purpose: "login", ip: null })) as { devCode: string };
    const db = await getDb();
    const [row] = await db.select().from(schema.otpCodes).where(eq(schema.otpCodes.identifier, id.value));
    expect(row.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain(issued.devCode);
  });

  it(`locks the code after ${OTP_MAX_ATTEMPTS} wrong attempts, even if the right code follows`, async () => {
    const id = freshEmail();
    const { devCode } = (await issueOtp({ identifier: id, purpose: "login", ip: null })) as { devCode: string };
    const wrong = devCode === "000000" ? "111111" : "000000";

    for (let i = 1; i < OTP_MAX_ATTEMPTS; i++) {
      const r = await verifyOtp({ identifier: id, purpose: "login", code: wrong, ip: null });
      expect(r).toMatchObject({ ok: false, reason: "invalid", attemptsLeft: OTP_MAX_ATTEMPTS - i });
    }
    const last = await verifyOtp({ identifier: id, purpose: "login", code: wrong, ip: null });
    expect(last).toMatchObject({ ok: false, reason: "too_many_attempts" });
    const right = await verifyOtp({ identifier: id, purpose: "login", code: devCode, ip: null });
    expect(right.ok).toBe(false);
  });

  it("caps concurrent guesses at the attempt limit", async () => {
    const id = freshEmail();
    const { devCode } = (await issueOtp({ identifier: id, purpose: "login", ip: null })) as { devCode: string };
    const wrong = devCode === "000000" ? "111111" : "000000";
    await Promise.all(
      Array.from({ length: 12 }, () => verifyOtp({ identifier: id, purpose: "login", code: wrong, ip: null })),
    );
    const db = await getDb();
    const [row] = await db.select().from(schema.otpCodes).where(eq(schema.otpCodes.identifier, id.value));
    expect(row.attempts).toBeLessThanOrEqual(OTP_MAX_ATTEMPTS);
  });

  it("rejects expired codes", async () => {
    const id = freshEmail();
    const { devCode } = (await issueOtp({ identifier: id, purpose: "login", ip: null })) as { devCode: string };
    const db = await getDb();
    await db
      .update(schema.otpCodes)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.otpCodes.identifier, id.value));
    expect(await verifyOtp({ identifier: id, purpose: "login", code: devCode, ip: null })).toMatchObject({
      ok: false,
      reason: "expired",
    });
  });

  it("invalidates the previous code when a new one is issued", async () => {
    const id = freshEmail();
    const first = (await issueOtp({ identifier: id, purpose: "login", ip: null })) as { devCode: string };
    const db = await getDb();
    await db.delete(schema.rateLimits); // skip the resend cooldown
    const second = (await issueOtp({ identifier: id, purpose: "login", ip: null })) as { devCode: string };
    if (first.devCode !== second.devCode) {
      expect((await verifyOtp({ identifier: id, purpose: "login", code: first.devCode, ip: null })).ok).toBe(false);
    }
    expect((await verifyOtp({ identifier: id, purpose: "login", code: second.devCode, ip: null })).ok).toBe(true);
  });

  it("does not accept a sign-up code for login", async () => {
    const id = freshEmail();
    const { devCode } = (await issueOtp({
      identifier: id,
      purpose: "signup",
      ip: null,
      payload: { surname: "Doe", dateOfBirth: "1990-01-01" },
    })) as { devCode: string };
    expect((await verifyOtp({ identifier: id, purpose: "login", code: devCode, ip: null })).ok).toBe(false);
  });

  it("enforces a resend cooldown", async () => {
    const id = freshEmail();
    expect((await issueOtp({ identifier: id, purpose: "login", ip: null })).ok).toBe(true);
    expect(await issueOtp({ identifier: id, purpose: "login", ip: null })).toMatchObject({
      ok: false,
      reason: "rate_limited",
    });
  });
});

describe("rate limiter", () => {
  it("counts within the window and resets after it", async () => {
    const key = `test:${Date.now()}`;
    expect((await rateLimit(key, 2, 60)).ok).toBe(true);
    expect((await rateLimit(key, 2, 60)).ok).toBe(true);
    expect((await rateLimit(key, 2, 60)).ok).toBe(false);
    const db = await getDb();
    await db
      .update(schema.rateLimits)
      .set({ windowStart: new Date(Date.now() - 61_000) })
      .where(eq(schema.rateLimits.key, key));
    expect((await rateLimit(key, 2, 60)).ok).toBe(true);
  });
});

describe("one active device", () => {
  it("signs the old device out when a new device signs in", async () => {
    const { user } = await createUser(freshEmail(), { surname: "Doe", dateOfBirth: "1990-01-01" });

    const laptop = device("Mozilla/5.0 (Windows NT 10.0) Chrome/140.0 Safari/537.36");
    await startSession(user.id, "otp", ctx("Mozilla/5.0 (Windows NT 10.0) Chrome/140.0 Safari/537.36"));
    expect((await getSession()).status).toBe("active");

    const phone = device("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile Safari/604.1");
    await startSession(
      user.id,
      "passkey",
      ctx("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile Safari/604.1"),
    );
    expect((await getSession()).status).toBe("active");

    use(laptop);
    expect(await getSession()).toEqual({ status: "replaced", signedInOn: "Safari on iPhone" });

    use(phone);
    expect((await getSession()).status).toBe("active");

    const db = await getDb();
    const events = await db
      .select()
      .from(schema.securityEvents)
      .where(eq(schema.securityEvents.userId, user.id));
    expect(events.some((e) => e.type === "session_replaced")).toBe(true);
  });

  it("leaves exactly one active session when many devices sign in at once", async () => {
    const { user } = await createUser(freshEmail(), { surname: "Race", dateOfBirth: "1990-01-01" });
    await Promise.all(Array.from({ length: 6 }, (_, i) => startSession(user.id, "otp", ctx(`device-${i}`))));

    const db = await getDb();
    const sessions = await db.select().from(schema.sessions).where(eq(schema.sessions.userId, user.id));
    const live = sessions.filter((s) => !s.revokedAt);
    const [fresh] = await db.select().from(schema.users).where(eq(schema.users.id, user.id));
    expect(sessions).toHaveLength(6);
    expect(live).toHaveLength(1);
    expect(fresh.activeSessionId).toBe(live[0].id);
  });

  it("logging out ends the session and clears the active pointer", async () => {
    const { user } = await createUser(freshEmail(), { surname: "Out", dateOfBirth: "1990-01-01" });
    const original = device("ua");
    await startSession(user.id, "otp", ctx("ua"));
    const jarCopy = { ...original, jar: new Map(currentJar()) };
    expect(jarCopy.jar.size).toBe(1);
    await endSession(ctx("ua"));
    expect((await getSession()).status).toBe("none");

    // A stolen copy of the cookie is useless after logout.
    use(jarCopy);
    expect((await getSession()).status).toBe("none");

    const db = await getDb();
    const [fresh] = await db.select().from(schema.users).where(eq(schema.users.id, user.id));
    expect(fresh.activeSessionId).toBeNull();
  });

  it("does not create a duplicate account for the same identifier", async () => {
    const id = freshEmail();
    const a = await createUser(id, { surname: "First", dateOfBirth: "1990-01-01" });
    const b = await createUser(id, { surname: "Second", dateOfBirth: "1991-01-01" });
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(b.user.id).toBe(a.user.id);
    expect(b.user.surname).toBe("First");
  });
});

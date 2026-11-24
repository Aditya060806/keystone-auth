import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { and, eq, isNull, ne } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Session, User } from "@/db/schema";
import { logEvent } from "./audit";
import { randomToken, sha256 } from "./crypto";
import { env } from "./env";
import type { RequestContext } from "./request";
import { describeUserAgent } from "./user-agent";

export const SESSION_COOKIE = env.isProd ? "__Host-session" : "session";
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;

export type SessionState =
  | { status: "active"; user: User; session: Session }
  /** This device was signed out because the account signed in elsewhere. */
  | { status: "replaced"; signedInOn: string | null }
  | { status: "none" };

/**
 * Creates a session and makes it the user's only active one, atomically.
 *
 * The user row is locked (SELECT … FOR UPDATE) so two devices signing in at
 * the same moment serialise: exactly one ends up as `activeSessionId`, and
 * every other session is revoked as "replaced".
 */
export async function startSession(
  userId: string,
  authMethod: "otp" | "passkey",
  ctx: RequestContext,
): Promise<void> {
  const db = await getDb();
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);

  const { replaced } = await db.transaction(async (tx) => {
    await tx
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .for("update");

    const [created] = await tx
      .insert(schema.sessions)
      .values({
        userId,
        tokenHash: sha256(token),
        authMethod,
        userAgent: ctx.userAgent,
        ip: ctx.ip,
        expiresAt,
      })
      .returning({ id: schema.sessions.id });

    const replaced = await tx
      .update(schema.sessions)
      .set({ revokedAt: new Date(), revokedReason: "replaced" })
      .where(
        and(
          eq(schema.sessions.userId, userId),
          ne(schema.sessions.id, created.id),
          isNull(schema.sessions.revokedAt),
        ),
      )
      .returning({ id: schema.sessions.id, userAgent: schema.sessions.userAgent });

    await tx
      .update(schema.users)
      .set({ activeSessionId: created.id })
      .where(eq(schema.users.id, userId));

    return { replaced };
  });

  for (const old of replaced) {
    await logEvent("session_replaced", ctx, {
      userId,
      metadata: {
        signedOutDevice: describeUserAgent(old.userAgent),
        newDevice: describeUserAgent(ctx.userAgent),
      },
    });
  }

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

/** Resolves the current request's session. Memoised per request. */
export const getSession = cache(async (): Promise<SessionState> => {
  // Session checks compare against the clock, so they must never be prerendered.
  await connection();
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return { status: "none" };

  const db = await getDb();
  const [row] = await db
    .select({ session: schema.sessions, user: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(eq(schema.sessions.tokenHash, sha256(token)))
    .limit(1);

  if (!row) return { status: "none" };
  const { session, user } = row;

  if (session.expiresAt.getTime() <= Date.now()) return { status: "none" };
  if (session.revokedReason === "logout") return { status: "none" };

  // The one-device rule: only the session the user row points at is valid.
  if (session.revokedAt || user.activeSessionId !== session.id) {
    let signedInOn: string | null = null;
    if (user.activeSessionId) {
      const [active] = await db
        .select({ userAgent: schema.sessions.userAgent })
        .from(schema.sessions)
        .where(eq(schema.sessions.id, user.activeSessionId))
        .limit(1);
      signedInOn = active ? describeUserAgent(active.userAgent) : null;
    }
    return { status: "replaced", signedInOn };
  }

  if (Date.now() - session.lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS) {
    await db
      .update(schema.sessions)
      .set({ lastSeenAt: new Date() })
      .where(eq(schema.sessions.id, session.id));
  }

  return { status: "active", user, session };
});

export async function endSession(ctx: RequestContext): Promise<void> {
  const state = await getSession();
  await clearSessionCookie();
  if (state.status !== "active") return;

  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx
      .update(schema.sessions)
      .set({ revokedAt: new Date(), revokedReason: "logout" })
      .where(eq(schema.sessions.id, state.session.id));
    await tx
      .update(schema.users)
      .set({ activeSessionId: null })
      .where(
        and(
          eq(schema.users.id, state.user.id),
          eq(schema.users.activeSessionId, state.session.id),
        ),
      );
  });
  await logEvent("logout", ctx, { userId: state.user.id });
}

/** Expires the cookie with the same attributes it was set with (required for __Host-). */
export async function clearSessionCookie(): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: env.isProd,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

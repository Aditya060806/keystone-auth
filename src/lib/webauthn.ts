import "server-only";
import { cookies } from "next/headers";
import { and, eq, gt, lt } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { env } from "./env";
import { HttpError } from "./http";

const CHALLENGE_COOKIE = env.isProd ? "__Host-webauthn" : "webauthn";
const CHALLENGE_TTL_SECONDS = 5 * 60;

export const rp = {
  name: env.appName,
  id: env.rpId,
  origin: env.appUrl,
};

/** Persists a challenge server-side and points an httpOnly cookie at it. */
export async function storeChallenge(
  challenge: string,
  purpose: "register" | "authenticate",
  userId: string | null,
): Promise<void> {
  const db = await getDb();
  // Opportunistic cleanup keeps the table small without a cron job.
  await db
    .delete(schema.webauthnChallenges)
    .where(lt(schema.webauthnChallenges.expiresAt, new Date()));

  const [row] = await db
    .insert(schema.webauthnChallenges)
    .values({
      challenge,
      purpose,
      userId,
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_SECONDS * 1000),
    })
    .returning({ id: schema.webauthnChallenges.id });

  (await cookies()).set(CHALLENGE_COOKIE, row.id, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: "strict",
    path: "/",
    maxAge: CHALLENGE_TTL_SECONDS,
  });
}

/** Fetches and deletes the challenge in one statement: strictly single use. */
export async function consumeChallenge(
  purpose: "register" | "authenticate",
  userId: string | null,
): Promise<string> {
  const jar = await cookies();
  const id = jar.get(CHALLENGE_COOKIE)?.value;
  jar.set(CHALLENGE_COOKIE, "", {
    httpOnly: true,
    secure: env.isProd,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    throw new HttpError(400, "challenge_missing", "This request expired. Please try again.");
  }

  const db = await getDb();
  const [row] = await db
    .delete(schema.webauthnChallenges)
    .where(
      and(
        eq(schema.webauthnChallenges.id, id),
        eq(schema.webauthnChallenges.purpose, purpose),
        gt(schema.webauthnChallenges.expiresAt, new Date()),
      ),
    )
    .returning();

  if (!row || (userId !== null && row.userId !== userId)) {
    throw new HttpError(400, "challenge_invalid", "This request expired. Please try again.");
  }
  return row.challenge;
}

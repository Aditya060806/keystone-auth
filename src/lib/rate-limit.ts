import "server-only";
import { sql } from "drizzle-orm";
import { getDb, schema } from "@/db";

export type RateLimitResult = { ok: boolean; retryAfterSeconds: number };

/**
 * Fixed-window counter stored in Postgres, so the limit is shared by every
 * serverless instance. The upsert is a single atomic statement.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const db = await getDb();
  const t = schema.rateLimits;
  const expired = sql`${t.windowStart} <= now() - make_interval(secs => ${windowSeconds})`;
  const [row] = await db
    .insert(t)
    .values({ key, count: 1, windowStart: sql`now()` })
    .onConflictDoUpdate({
      target: t.key,
      set: {
        count: sql`case when ${expired} then 1 else ${t.count} + 1 end`,
        windowStart: sql`case when ${expired} then now() else ${t.windowStart} end`,
      },
    })
    .returning({ count: t.count, windowStart: t.windowStart });
  const started = row.windowStart.getTime();
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((started + windowSeconds * 1000 - Date.now()) / 1000),
  );
  return { ok: Number(row.count) <= limit, retryAfterSeconds };
}

/** Checks several limits; fails on the first one exceeded. */
export async function rateLimitAll(
  rules: { key: string; limit: number; windowSeconds: number }[],
): Promise<RateLimitResult> {
  for (const r of rules) {
    const res = await rateLimit(r.key, r.limit, r.windowSeconds);
    if (!res.ok) return res;
  }
  return { ok: true, retryAfterSeconds: 0 };
}

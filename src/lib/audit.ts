import "server-only";
import { getDb, schema } from "@/db";
import type { SecurityEventType } from "@/db/schema";
import type { RequestContext } from "./request";

export async function logEvent(
  type: SecurityEventType,
  ctx: RequestContext,
  opts: { userId?: string | null; metadata?: Record<string, unknown> } = {},
): Promise<void> {
  try {
    const db = await getDb();
    await db.insert(schema.securityEvents).values({
      type,
      userId: opts.userId ?? null,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      metadata: opts.metadata,
    });
  } catch (err) {
    // Auditing must never break authentication itself.
    console.error("[audit] failed to record event", type, err);
  }
}

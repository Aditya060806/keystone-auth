import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { logEvent } from "@/lib/audit";
import { HttpError, handler, requireUser } from "@/lib/http";
import { getRequestContext } from "@/lib/request";

export const DELETE = handler(async (req) => {
  const { user } = await requireUser();
  const id = decodeURIComponent(new URL(req.url).pathname.split("/").pop() ?? "");
  const db = await getDb();
  const deleted = await db
    .delete(schema.passkeys)
    .where(and(eq(schema.passkeys.id, id), eq(schema.passkeys.userId, user.id)))
    .returning({ name: schema.passkeys.name });
  if (deleted.length === 0) throw new HttpError(404, "not_found", "Passkey not found.");

  await logEvent("passkey_removed", await getRequestContext(), {
    userId: user.id,
    metadata: { name: deleted[0].name },
  });
  return NextResponse.json({ ok: true });
});

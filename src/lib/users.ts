import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { User } from "@/db/schema";
import { randomToken } from "./crypto";
import type { Identifier } from "./validation";

export async function findUserByIdentifier(id: Identifier): Promise<User | null> {
  const db = await getDb();
  const column = id.channel === "email" ? schema.users.email : schema.users.phone;
  const [user] = await db.select().from(schema.users).where(eq(column, id.value)).limit(1);
  return user ?? null;
}

/**
 * Creates the user once their identifier is verified. If someone else
 * verified the same identifier a moment earlier, returns that user instead
 * (unique index + ON CONFLICT DO NOTHING keeps this race-safe).
 */
export async function createUser(
  id: Identifier,
  profile: { surname: string; dateOfBirth: string },
): Promise<{ user: User; created: boolean }> {
  const db = await getDb();
  const [user] = await db
    .insert(schema.users)
    .values({
      email: id.channel === "email" ? id.value : null,
      phone: id.channel === "sms" ? id.value : null,
      surname: profile.surname,
      dateOfBirth: profile.dateOfBirth,
      webauthnUserId: randomToken(32),
    })
    .onConflictDoNothing()
    .returning();
  if (user) return { user, created: true };

  const existing = await findUserByIdentifier(id);
  if (!existing) throw new Error("User insert conflicted but no user found");
  return { user: existing, created: false };
}

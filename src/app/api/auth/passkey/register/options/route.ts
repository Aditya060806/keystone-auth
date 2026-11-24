import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { getDb, schema } from "@/db";
import { handler, requireUser } from "@/lib/http";
import { rp, storeChallenge } from "@/lib/webauthn";

/** Signed-in users only: begin adding Face ID / Touch ID / fingerprint / Windows Hello. */
export const POST = handler(async () => {
  const { user } = await requireUser();
  const db = await getDb();
  const existing = await db
    .select({ id: schema.passkeys.id, transports: schema.passkeys.transports })
    .from(schema.passkeys)
    .where(eq(schema.passkeys.userId, user.id));

  const options = await generateRegistrationOptions({
    rpName: rp.name,
    rpID: rp.id,
    userID: Buffer.from(user.webauthnUserId, "base64url"),
    userName: user.email ?? user.phone ?? user.surname,
    userDisplayName: user.surname,
    attestationType: "none",
    // Don't let the same authenticator be registered twice.
    excludeCredentials: existing.map((c) => ({
      id: c.id,
      transports: c.transports ?? undefined,
    })),
    authenticatorSelection: {
      // Discoverable credential = "Sign in with Face ID" without typing anything.
      residentKey: "required",
      // Requires the biometric / device PIN, not just a tap.
      userVerification: "required",
    },
    // Prefer the platform authenticator (the device's own biometrics).
    preferredAuthenticatorType: "localDevice",
  });

  await storeChallenge(options.challenge, "register", user.id);
  return NextResponse.json(options);
});

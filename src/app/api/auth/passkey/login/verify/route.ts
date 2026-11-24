import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { getDb, schema } from "@/db";
import { logEvent } from "@/lib/audit";
import { HttpError, handler, readJson } from "@/lib/http";
import { getRequestContext } from "@/lib/request";
import { startSession } from "@/lib/session";
import { consumeChallenge, rp } from "@/lib/webauthn";

const bodySchema = z.object({
  response: z.looseObject({
    id: z.string().max(1024),
    rawId: z.string(),
    type: z.literal("public-key"),
    response: z.looseObject({ userHandle: z.string().optional() }),
  }),
});

const FAILED = "We couldn't sign you in with that passkey.";

export const POST = handler(async (req) => {
  const { response } = await readJson(req, bodySchema);
  const ctx = await getRequestContext();
  const expectedChallenge = await consumeChallenge("authenticate", null);

  const db = await getDb();
  const [row] = await db
    .select({ passkey: schema.passkeys, user: schema.users })
    .from(schema.passkeys)
    .innerJoin(schema.users, eq(schema.users.id, schema.passkeys.userId))
    .where(eq(schema.passkeys.id, response.id))
    .limit(1);

  if (!row) {
    await logEvent("passkey_failed", ctx, { metadata: { reason: "unknown_credential" } });
    throw new HttpError(
      400,
      "passkey_unknown",
      "That passkey isn't registered here. It may have been removed — sign in with a code instead.",
    );
  }
  const { passkey, user } = row;

  // The authenticator's user handle must match the account that owns the key.
  const handle = response.response.userHandle;
  if (handle && handle !== user.webauthnUserId) {
    await logEvent("passkey_failed", ctx, { userId: user.id, metadata: { reason: "user_handle" } });
    throw new HttpError(400, "passkey_invalid", FAILED);
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: response as unknown as AuthenticationResponseJSON,
      expectedChallenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.id,
      requireUserVerification: true,
      credential: {
        id: passkey.id,
        publicKey: new Uint8Array(Buffer.from(passkey.publicKey, "base64url")),
        counter: passkey.counter,
        transports: passkey.transports ?? undefined,
      },
    });
  } catch (err) {
    console.warn("[passkey] authentication verification failed", err);
    await logEvent("passkey_failed", ctx, { userId: user.id, metadata: { reason: "verify" } });
    throw new HttpError(400, "passkey_invalid", FAILED);
  }
  if (!verification.verified) {
    await logEvent("passkey_failed", ctx, { userId: user.id, metadata: { reason: "verify" } });
    throw new HttpError(400, "passkey_invalid", FAILED);
  }

  await db
    .update(schema.passkeys)
    .set({
      counter: verification.authenticationInfo.newCounter,
      backedUp: verification.authenticationInfo.credentialBackedUp,
      lastUsedAt: new Date(),
    })
    .where(eq(schema.passkeys.id, passkey.id));

  await logEvent("login_passkey", ctx, { userId: user.id, metadata: { passkey: passkey.name } });
  await startSession(user.id, "passkey", ctx);
  return NextResponse.json({ ok: true });
});

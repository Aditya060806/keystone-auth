import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { getDb, schema } from "@/db";
import { logEvent } from "@/lib/audit";
import { HttpError, handler, readJson, requireUser } from "@/lib/http";
import { getRequestContext } from "@/lib/request";
import { describeUserAgent } from "@/lib/user-agent";
import { consumeChallenge, rp } from "@/lib/webauthn";

const bodySchema = z.object({
  response: z.looseObject({ id: z.string(), rawId: z.string(), type: z.literal("public-key") }),
});

export const POST = handler(async (req) => {
  const { user } = await requireUser();
  const { response } = await readJson(req, bodySchema);
  const ctx = await getRequestContext();
  const expectedChallenge = await consumeChallenge("register", user.id);

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: response as unknown as RegistrationResponseJSON,
      expectedChallenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.id,
      requireUserVerification: true,
    });
  } catch (err) {
    console.warn("[passkey] registration verification failed", err);
    throw new HttpError(400, "passkey_invalid", "We couldn't verify that passkey. Try again.");
  }
  if (!verification.verified) {
    throw new HttpError(400, "passkey_invalid", "We couldn't verify that passkey. Try again.");
  }

  const info = verification.registrationInfo;
  const db = await getDb();
  const inserted = await db
    .insert(schema.passkeys)
    .values({
      id: info.credential.id,
      userId: user.id,
      publicKey: Buffer.from(info.credential.publicKey).toString("base64url"),
      counter: info.credential.counter,
      transports: info.credential.transports ?? null,
      deviceType: info.credentialDeviceType,
      backedUp: info.credentialBackedUp,
      aaguid: info.aaguid,
      name: describeUserAgent(ctx.userAgent),
    })
    .onConflictDoNothing()
    .returning({ id: schema.passkeys.id });

  if (inserted.length === 0) {
    throw new HttpError(409, "passkey_exists", "This passkey is already registered.");
  }

  await logEvent("passkey_added", ctx, {
    userId: user.id,
    metadata: { deviceType: info.credentialDeviceType, backedUp: info.credentialBackedUp },
  });
  return NextResponse.json({ ok: true });
});

import { NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { handler, tooManyRequests } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { getRequestContext } from "@/lib/request";
import { rp, storeChallenge } from "@/lib/webauthn";

/**
 * Usernameless sign-in: no allowCredentials, so the browser offers whichever
 * passkey the user has for this site (Face ID, fingerprint, Windows Hello…).
 */
export const POST = handler(async () => {
  const ctx = await getRequestContext();
  if (ctx.ip) {
    const limit = await rateLimit(`passkey:options:ip:${ctx.ip}`, 60, 3600);
    if (!limit.ok) tooManyRequests(limit.retryAfterSeconds);
  }

  const options = await generateAuthenticationOptions({
    rpID: rp.id,
    userVerification: "required",
  });
  await storeChallenge(options.challenge, "authenticate", null);
  return NextResponse.json(options);
});

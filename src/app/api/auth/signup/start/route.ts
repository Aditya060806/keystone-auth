import { NextResponse } from "next/server";
import { handler, readJson, tooManyRequests } from "@/lib/http";
import { issueOtp } from "@/lib/otp";
import { getRequestContext } from "@/lib/request";
import { maskIdentifier, signupStartSchema } from "@/lib/validation";

/**
 * Step 1 of sign-up: validate details and send a code.
 *
 * Deliberately does not reveal whether the email/phone is already
 * registered (that would let anyone enumerate accounts). If it is, verifying
 * the code simply signs the owner in to their existing account.
 */
export const POST = handler(async (req) => {
  const { identifier, surname, dateOfBirth } = await readJson(req, signupStartSchema);
  const ctx = await getRequestContext();

  const result = await issueOtp({
    identifier,
    purpose: "signup",
    ip: ctx.ip,
    payload: { surname, dateOfBirth },
  });
  if (!result.ok) tooManyRequests(result.retryAfterSeconds, "codes");

  return NextResponse.json({
    sentTo: maskIdentifier(identifier),
    channel: identifier.channel,
    expiresInSeconds: result.expiresInSeconds,
    devCode: result.devCode,
  });
});

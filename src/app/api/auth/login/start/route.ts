import { NextResponse } from "next/server";
import { handler, readJson, tooManyRequests } from "@/lib/http";
import { issueOtp } from "@/lib/otp";
import { getRequestContext } from "@/lib/request";
import { findUserByIdentifier } from "@/lib/users";
import { loginStartSchema, maskIdentifier } from "@/lib/validation";

/**
 * Sends a login code if an account exists. The response is identical either
 * way, so this endpoint can't be used to discover who has an account.
 */
export const POST = handler(async (req) => {
  const { identifier } = await readJson(req, loginStartSchema);
  const ctx = await getRequestContext();

  const user = await findUserByIdentifier(identifier);
  const result = await issueOtp({
    identifier,
    purpose: "login",
    ip: ctx.ip,
    send: Boolean(user),
  });
  if (!result.ok) tooManyRequests(result.retryAfterSeconds, "codes");

  return NextResponse.json({
    sentTo: maskIdentifier(identifier),
    channel: identifier.channel,
    expiresInSeconds: result.expiresInSeconds,
    devCode: result.devCode,
  });
});

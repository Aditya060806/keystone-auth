import { NextResponse } from "next/server";
import { logEvent } from "@/lib/audit";
import { HttpError, handler, readJson } from "@/lib/http";
import { verifyOtp } from "@/lib/otp";
import { throwForFailedVerify } from "@/lib/otp-errors";
import { getRequestContext } from "@/lib/request";
import { startSession } from "@/lib/session";
import { createUser } from "@/lib/users";
import { verifySchema } from "@/lib/validation";

export const POST = handler(async (req) => {
  const { identifier, code } = await readJson(req, verifySchema);
  const ctx = await getRequestContext();

  const result = await verifyOtp({ identifier, purpose: "signup", code, ip: ctx.ip });
  if (!result.ok) {
    await logEvent("otp_failed", ctx, { metadata: { purpose: "signup", reason: result.reason } });
    throwForFailedVerify(result);
  }
  if (!result.payload) throw new HttpError(400, "code_invalid", "Please start sign-up again.");

  // Possession of the identifier is now proven.
  const { user, created } = await createUser(identifier, result.payload);
  if (created) {
    await logEvent("signup", ctx, { userId: user.id, metadata: { channel: identifier.channel } });
  } else {
    await logEvent("login_otp", ctx, {
      userId: user.id,
      metadata: { channel: identifier.channel, via: "signup" },
    });
  }
  await startSession(user.id, "otp", ctx);

  return NextResponse.json({ ok: true, existingAccount: !created });
});

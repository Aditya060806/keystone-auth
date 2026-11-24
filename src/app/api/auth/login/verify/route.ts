import { NextResponse } from "next/server";
import { logEvent } from "@/lib/audit";
import { HttpError, handler, readJson } from "@/lib/http";
import { verifyOtp } from "@/lib/otp";
import { throwForFailedVerify } from "@/lib/otp-errors";
import { getRequestContext } from "@/lib/request";
import { startSession } from "@/lib/session";
import { findUserByIdentifier } from "@/lib/users";
import { verifySchema } from "@/lib/validation";

export const POST = handler(async (req) => {
  const { identifier, code } = await readJson(req, verifySchema);
  const ctx = await getRequestContext();

  const result = await verifyOtp({ identifier, purpose: "login", code, ip: ctx.ip });
  const user = await findUserByIdentifier(identifier);

  if (!result.ok) {
    await logEvent(result.reason === "too_many_attempts" ? "otp_locked" : "otp_failed", ctx, {
      userId: user?.id,
      metadata: { purpose: "login", reason: result.reason },
    });
    throwForFailedVerify(result);
  }
  if (!user) throw new HttpError(400, "code_invalid", "That code isn't right.");

  await logEvent("login_otp", ctx, { userId: user.id, metadata: { channel: identifier.channel } });
  await startSession(user.id, "otp", ctx);

  return NextResponse.json({ ok: true });
});

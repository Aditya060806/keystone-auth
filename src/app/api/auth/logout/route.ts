import { NextResponse } from "next/server";
import { handler } from "@/lib/http";
import { getRequestContext } from "@/lib/request";
import { endSession } from "@/lib/session";

export const POST = handler(async () => {
  await endSession(await getRequestContext());
  return NextResponse.json({ ok: true });
});

import { NextResponse } from "next/server";
import { handler } from "@/lib/http";
import { clearSessionCookie, getSession } from "@/lib/session";

/**
 * Polled by signed-in pages so a device that has been replaced finds out
 * within seconds, rather than on its next action.
 */
export const GET = handler(
  async () => {
    const state = await getSession();
    if (state.status === "active") {
      return NextResponse.json({ status: "active" });
    }
    await clearSessionCookie();
    return NextResponse.json(
      state.status === "replaced"
        ? { status: "replaced", signedInOn: state.signedInOn }
        : { status: "none" },
      { status: 401 },
    );
  },
  { checkOrigin: false },
);

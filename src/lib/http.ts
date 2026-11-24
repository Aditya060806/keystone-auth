import "server-only";
import { unstable_rethrow } from "next/navigation";
import { NextResponse } from "next/server";
import { z } from "zod";
import { DeliveryError } from "./delivery";
import { env } from "./env";
import { getSession } from "./session";

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

/**
 * CSRF defence in depth on top of SameSite=Lax cookies: state-changing
 * requests must come from our own origin.
 */
function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const allowed = new Set([env.appUrl, new URL(req.url).origin]);
  if (!origin || !allowed.has(origin)) {
    throw new HttpError(403, "bad_origin", "Request blocked.");
  }
}

export async function readJson<S extends z.ZodType>(req: Request, schema: S) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, "bad_json", "Invalid request body.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "_";
      fieldErrors[key] ??= issue.message;
    }
    const first = Object.values(fieldErrors)[0] ?? "Invalid input.";
    throw new HttpError(422, "validation", first, { fieldErrors });
  }
  return parsed.data as z.output<S>;
}

/** Route handler wrapper: origin check, typed errors, no stack traces leaked. */
export function handler(
  fn: (req: Request) => Promise<Response>,
  opts: { checkOrigin?: boolean } = { checkOrigin: true },
) {
  return async (req: Request) => {
    try {
      if (opts.checkOrigin !== false) assertSameOrigin(req);
      const res = await fn(req);
      res.headers.set("Cache-Control", "no-store");
      return res;
    } catch (err) {
      // Let Next.js' own control-flow errors (dynamic rendering, redirects) through.
      unstable_rethrow(err);
      if (err instanceof HttpError) {
        const res = NextResponse.json(
          { error: { code: err.code, message: err.message, ...err.extra } },
          { status: err.status },
        );
        if (err.status === 429 && typeof err.extra.retryAfterSeconds === "number") {
          res.headers.set("Retry-After", String(err.extra.retryAfterSeconds));
        }
        return res;
      }
      if (err instanceof DeliveryError) {
        return NextResponse.json(
          { error: { code: "delivery_failed", message: err.message } },
          { status: 502 },
        );
      }
      console.error("[api] unhandled error", err);
      return NextResponse.json(
        { error: { code: "internal", message: "Something went wrong. Please try again." } },
        { status: 500 },
      );
    }
  };
}

export async function requireUser() {
  const state = await getSession();
  if (state.status === "replaced") {
    throw new HttpError(
      401,
      "session_replaced",
      "You were signed out because your account signed in on another device.",
    );
  }
  if (state.status !== "active") {
    throw new HttpError(401, "unauthenticated", "Please sign in.");
  }
  return state;
}

export function tooManyRequests(
  retryAfterSeconds: number,
  what: "attempts" | "codes" = "attempts",
): never {
  throw new HttpError(
    429,
    "rate_limited",
    what === "codes"
      ? `Please wait ${formatWait(retryAfterSeconds)} before requesting another code.`
      : `Too many attempts. Try again in ${formatWait(retryAfterSeconds)}.`,
    { retryAfterSeconds },
  );
}

function formatWait(s: number) {
  if (s < 60) return `${s} second${s === 1 ? "" : "s"}`;
  const m = Math.ceil(s / 60);
  return `${m} minute${m === 1 ? "" : "s"}`;
}

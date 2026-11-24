import "server-only";
import { headers } from "next/headers";

export type RequestContext = { ip: string | null; userAgent: string | null };

export async function getRequestContext(): Promise<RequestContext> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    ip: h.get("x-real-ip") ?? forwarded ?? null,
    userAgent: h.get("user-agent")?.slice(0, 512) ?? null,
  };
}

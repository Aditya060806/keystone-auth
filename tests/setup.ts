/**
 * Replaces Next's request-scoped APIs with a swappable "device": a cookie jar
 * plus request headers. Tests switch devices via tests/harness.ts.
 */
import { vi } from "vitest";

type State = { jar: Map<string, string>; headers: Headers };
const g = globalThis as unknown as { __req: State };
g.__req = { jar: new Map(), headers: new Headers({ "user-agent": "test-agent" }) };

vi.mock("next/headers", () => ({
  cookies: async () => {
    const jar = (globalThis as unknown as { __req: State }).__req.jar;
    return {
      get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
      set: (name: string, value: string, opts?: { maxAge?: number }) => {
        if (opts?.maxAge === 0 || value === "") jar.delete(name);
        else jar.set(name, value);
      },
      delete: (name: string) => jar.delete(name),
    };
  },
  headers: async () => (globalThis as unknown as { __req: State }).__req.headers,
}));

vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  connection: async () => {},
}));

// React's `cache` memoises per request; tests make many "requests".
vi.mock("react", async (orig) => ({
  ...(await orig<typeof import("react")>()),
  cache: <T,>(fn: T) => fn,
}));

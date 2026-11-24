export type ApiError = {
  code: string;
  message: string;
  fieldErrors?: Record<string, string>;
  retryAfterSeconds?: number;
};

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export async function api<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method: init.method ?? "POST",
      headers: init.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error: ApiError = json?.error ?? {
        code: "http_" + res.status,
        message: "Something went wrong. Please try again.",
      };
      if (error.code === "session_replaced") {
        window.location.replace("/login?reason=replaced");
      }
      return { ok: false, error };
    }
    return { ok: true, data: json as T };
  } catch {
    return {
      ok: false,
      error: { code: "network", message: "Can't reach the server. Check your connection." },
    };
  }
}

export type CodeSent = {
  sentTo: string;
  channel: "email" | "sms";
  expiresInSeconds: number;
  devCode?: string;
};

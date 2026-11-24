"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { browserSupportsWebAuthn, startRegistration } from "@simplewebauthn/browser";
import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";
import { Alert, BiometricIcon, Button } from "@/components/ui";
import { api } from "@/lib/api-client";
import { biometricLabel } from "@/lib/biometric-label";

const POLL_MS = 10_000;

/**
 * Detects within seconds that this device was signed out by a login
 * elsewhere: polls, and re-checks immediately when the tab regains focus.
 */
export function SessionWatcher() {
  useEffect(() => {
    let stopped = false;
    async function check() {
      if (stopped || document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/auth/session", { cache: "no-store" });
        if (res.status !== 401) return;
        const body = await res.json().catch(() => ({}));
        stopped = true;
        const qs = new URLSearchParams();
        if (body.status === "replaced") {
          qs.set("reason", "replaced");
          if (body.signedInOn) qs.set("on", body.signedInOn);
        }
        window.location.replace(`/login${qs.size ? `?${qs}` : ""}`);
      } catch {
        // Offline: try again on the next tick.
      }
    }
    const id = setInterval(check, POLL_MS);
    const onVisible = () => check();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      stopped = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);
  return null;
}

export function SignOutButton() {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="ghost"
      className="h-9 px-3 text-sm"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        await api("/api/auth/logout");
        window.location.replace("/login");
      }}
    >
      Sign out
    </Button>
  );
}

export function AddPasskeyButton({ prominent = false }: { prominent?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [env, setEnv] = useState<{ supported: boolean; label: string } | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnv({ supported: browserSupportsWebAuthn(), label: biometricLabel() });
  }, []);

  if (env && !env.supported) {
    return (
      <Alert tone="info">
        This browser doesn&apos;t support passkeys. Try Safari, Chrome, Edge or Firefox on a
        device with Face ID, Touch ID, a fingerprint reader or Windows Hello.
      </Alert>
    );
  }

  async function add() {
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const opts = await api<PublicKeyCredentialCreationOptionsJSON>("/api/auth/passkey/register/options");
      if (!opts.ok) throw new Error(opts.error.message);
      const response = await startRegistration({ optionsJSON: opts.data });
      const res = await api("/api/auth/passkey/register/verify", { body: { response } });
      if (!res.ok) throw new Error(res.error.message);
      setDone(true);
      router.refresh();
    } catch (err) {
      const name = (err as { name?: string })?.name;
      setError(
        name === "InvalidStateError"
          ? "This device is already set up for this account."
          : name === "NotAllowedError" || name === "AbortError"
            ? "Setup was cancelled or timed out."
            : (err as Error).message || "Couldn't add a passkey.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button
        variant={prominent ? "primary" : "secondary"}
        onClick={add}
        loading={busy}
        disabled={!env}
        className={prominent ? "w-full sm:w-auto" : ""}
      >
        {!busy && <BiometricIcon />}
        Set up {env?.label ?? "Face ID or fingerprint"}
      </Button>
      {error && <Alert>{error}</Alert>}
      {done && <Alert tone="success">Done. Next time, sign in with {env?.label}.</Alert>}
    </div>
  );
}

export function RemovePasskeyButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="danger"
      className="h-8 px-2.5 text-sm"
      loading={busy}
      onClick={async () => {
        if (!confirm(`Remove the passkey "${name}"? You won't be able to sign in with it any more.`)) return;
        setBusy(true);
        await api(`/api/auth/passkey/${encodeURIComponent(id)}`, { method: "DELETE" });
        setBusy(false);
        router.refresh();
      }}
    >
      Remove
    </Button>
  );
}

/** Formats in the viewer's own timezone. */
export function LocalTime({ iso, relative = false }: { iso: string; relative?: boolean }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    const d = new Date(iso);
    if (relative) {
      const diff = (d.getTime() - Date.now()) / 1000;
      const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
      const abs = Math.abs(diff);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setText(
        abs < 60
          ? rtf.format(Math.round(diff), "second")
          : abs < 3600
            ? rtf.format(Math.round(diff / 60), "minute")
            : abs < 86400
              ? rtf.format(Math.round(diff / 3600), "hour")
              : rtf.format(Math.round(diff / 86400), "day"),
      );
    } else {
      setText(d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }));
    }
  }, [iso, relative]);
  return (
    <time dateTime={iso} title={iso}>
      {text ?? "…"}
    </time>
  );
}

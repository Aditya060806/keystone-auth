"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  WebAuthnAbortService,
  browserSupportsWebAuthn,
  startAuthentication,
} from "@simplewebauthn/browser";
import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import { CodeStep } from "@/components/code-step";
import { Alert, BiometricIcon, Button, Divider, Field, Input } from "@/components/ui";
import { api, type ApiError, type CodeSent } from "@/lib/api-client";
import { biometricLabel } from "@/lib/biometric-label";

function ReasonBanner() {
  const params = useSearchParams();
  const reason = params.get("reason");
  const on = params.get("on");
  if (reason !== "replaced") return null;
  const device = on && /^[\w .-]{1,60}$/.test(on) ? on : null;
  return (
    <div className="mb-5">
      <Alert tone="warning">
        You were signed out because your account signed in on another device
        {device ? <> ({device})</> : null}. Only one device can be signed in at a time.
      </Alert>
    </div>
  );
}

export function LoginForm() {
  const [identifier, setIdentifier] = useState("");
  const [sent, setSent] = useState<CodeSent | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [sending, setSending] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const [webauthn, setWebauthn] = useState<{ supported: boolean; label: string } | null>(null);

  useEffect(() => {
    // Browser-only checks; done after mount to keep SSR markup stable.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWebauthn({ supported: browserSupportsWebAuthn(), label: biometricLabel() });
    return () => WebAuthnAbortService.cancelCeremony();
  }, []);

  async function requestCode() {
    setSending(true);
    setError(null);
    const res = await api<CodeSent>("/api/auth/login/start", { body: { identifier } });
    setSending(false);
    if (!res.ok) {
      setError(res.error);
      return res.error;
    }
    setSent(res.data);
    return null;
  }

  async function verify(code: string) {
    const res = await api("/api/auth/login/verify", { body: { identifier, code } });
    if (!res.ok) return res.error;
    window.location.replace("/dashboard");
    return null;
  }

  async function passkeyLogin() {
    setPasskeyBusy(true);
    setPasskeyError(null);
    try {
      const opts = await api<PublicKeyCredentialRequestOptionsJSON>("/api/auth/passkey/login/options");
      if (!opts.ok) throw new Error(opts.error.message);
      const response = await startAuthentication({ optionsJSON: opts.data });
      const res = await api("/api/auth/passkey/login/verify", { body: { response } });
      if (!res.ok) throw new Error(res.error.message);
      window.location.replace("/dashboard");
    } catch (err) {
      const name = (err as { name?: string })?.name;
      setPasskeyError(
        name === "NotAllowedError" || name === "AbortError"
          ? "Sign-in was cancelled or timed out. Try again, or use a code."
          : (err as Error).message || "Passkey sign-in failed.",
      );
      setPasskeyBusy(false);
    }
  }

  if (sent) {
    return (
      <CodeStep
        sent={sent}
        onVerify={verify}
        onResend={requestCode}
        onBack={() => {
          setSent(null);
          setError(null);
        }}
      />
    );
  }

  return (
    <div>
      <ReasonBanner />

      {webauthn?.supported !== false && (
        <>
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={passkeyLogin}
            loading={passkeyBusy}
            disabled={!webauthn}
          >
            {!passkeyBusy && <BiometricIcon />}
            Sign in with {webauthn?.label ?? "Face ID or fingerprint"}
          </Button>
          {passkeyError && (
            <div className="mt-3">
              <Alert>{passkeyError}</Alert>
            </div>
          )}
          <Divider>or get a code</Divider>
        </>
      )}

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          requestCode();
        }}
      >
        <Field
          label="Email or phone number"
          htmlFor="identifier"
          error={error?.code === "validation" ? error.message : undefined}
          hint="Phone numbers need a country code, like +44 or +91."
        >
          <Input
            id="identifier"
            name="identifier"
            autoComplete="username"
            placeholder="you@example.com or +44 7911 123456"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            invalid={error?.code === "validation"}
            aria-describedby={error ? "identifier-error" : undefined}
            required
            autoFocus
          />
        </Field>
        {error && error.code !== "validation" && <Alert>{error.message}</Alert>}
        <Button type="submit" className="w-full" loading={sending}>
          Send code
        </Button>
      </form>
    </div>
  );
}

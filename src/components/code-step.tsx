"use client";

import { useEffect, useState } from "react";
import { OtpInput } from "./otp-input";
import { Alert, Button } from "./ui";
import type { ApiError, CodeSent } from "@/lib/api-client";

const RESEND_SECONDS = 30;

/** Shared "enter the 6-digit code" step for sign-up and login. */
export function CodeStep({
  sent,
  onVerify,
  onResend,
  onBack,
}: {
  sent: CodeSent;
  onVerify: (code: string) => Promise<ApiError | null>;
  onResend: () => Promise<ApiError | null>;
  onBack: () => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function verify(value: string) {
    if (verifying || value.length !== 6) return;
    setVerifying(true);
    setError(null);
    const err = await onVerify(value);
    if (err) {
      setError(err);
      setCode("");
      setVerifying(false);
    }
    // On success the parent navigates; keep the spinner until it does.
  }

  async function resend() {
    setResending(true);
    setError(null);
    setResent(false);
    const err = await onResend();
    setResending(false);
    if (err) {
      setError(err);
      if (err.retryAfterSeconds) setCooldown(err.retryAfterSeconds);
    } else {
      setCode("");
      setResent(true);
      setCooldown(RESEND_SECONDS);
    }
  }

  const locked = error?.code === "code_locked" || error?.code === "code_expired";

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        verify(code);
      }}
    >
      <p className="text-muted text-sm leading-relaxed">
        We sent a 6-digit code {sent.channel === "email" ? "by email" : "by text message"} to{" "}
        <span className="text-ink font-medium">{sent.sentTo}</span>. It expires in 5 minutes.
      </p>

      {sent.devCode && (
        <div className="border-line-strong bg-surface-muted rounded-xl border border-dashed px-3.5 py-3 text-sm">
          <p className="text-muted">
            Demo mode: no {sent.channel === "email" ? "email" : "SMS"} provider is configured, so
            the code is shown here.
          </p>
          <button
            type="button"
            className="text-ink mt-1 font-mono text-lg font-semibold tracking-[0.3em] underline-offset-4 hover:underline"
            onClick={() => {
              setCode(sent.devCode!);
              verify(sent.devCode!);
            }}
          >
            {sent.devCode}
          </button>
        </div>
      )}

      <OtpInput
        value={code}
        onChange={(v) => {
          setCode(v);
          if (error && !locked) setError(null);
        }}
        onComplete={verify}
        disabled={verifying || locked}
        invalid={Boolean(error) && !locked}
      />

      {error && <Alert>{error.message}</Alert>}
      {resent && !error && <Alert tone="success">A new code is on its way.</Alert>}

      <Button type="submit" className="w-full" loading={verifying} disabled={code.length !== 6 || locked}>
        Verify
      </Button>

      <div className="flex items-center justify-between text-sm">
        <button type="button" onClick={onBack} className="text-muted hover:text-ink">
          ← Change {sent.channel === "email" ? "email" : "number"}
        </button>
        <button
          type="button"
          onClick={resend}
          disabled={cooldown > 0 || resending}
          className="text-ink font-medium disabled:text-faint disabled:font-normal"
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : resending ? "Sending…" : "Resend code"}
        </button>
      </div>
    </form>
  );
}

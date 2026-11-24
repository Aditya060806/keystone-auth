"use client";

import { useState } from "react";
import { CodeStep } from "@/components/code-step";
import { Alert, Button, Field, Input } from "@/components/ui";
import { api, type ApiError, type CodeSent } from "@/lib/api-client";

type Method = "email" | "phone";

function isoDateYearsAgo(years: number) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}

export function SignupForm() {
  const [method, setMethod] = useState<Method>("email");
  const [identifier, setIdentifier] = useState("");
  const [surname, setSurname] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<CodeSent | null>(null);

  const field = (name: string) => {
    const msg = error?.fieldErrors?.[name];
    // The server accepts either kind; tailor the message to the tab in use.
    if (msg && name === "identifier") {
      return method === "email"
        ? "Enter a valid email address."
        : "Enter a valid phone number, starting with + and your country code.";
    }
    return msg;
  };

  async function start() {
    setSending(true);
    setError(null);
    const res = await api<CodeSent>("/api/auth/signup/start", {
      body: { identifier, surname, dateOfBirth },
    });
    setSending(false);
    if (!res.ok) {
      setError(res.error);
      return res.error;
    }
    setSent(res.data);
    return null;
  }

  async function verify(code: string) {
    const res = await api<{ existingAccount: boolean }>("/api/auth/signup/verify", {
      body: { identifier, code },
    });
    if (!res.ok) return res.error;
    window.location.replace(res.data.existingAccount ? "/dashboard?existing=1" : "/dashboard?welcome=1");
    return null;
  }

  if (sent) {
    return (
      <CodeStep
        sent={sent}
        onVerify={verify}
        onResend={start}
        onBack={() => {
          setSent(null);
          setError(null);
        }}
      />
    );
  }

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        start();
      }}
    >
      <div role="tablist" aria-label="Sign up with" className="bg-surface-muted grid grid-cols-2 gap-1 rounded-xl p-1">
        {(["email", "phone"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={method === m}
            onClick={() => {
              setMethod(m);
              setIdentifier("");
              setError(null);
            }}
            className={[
              "h-9 rounded-lg text-sm font-medium transition",
              method === m ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink",
            ].join(" ")}
          >
            {m === "email" ? "Email" : "Phone"}
          </button>
        ))}
      </div>

      {method === "email" ? (
        <Field label="Email" htmlFor="identifier" error={field("identifier")}>
          <Input
            id="identifier"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            invalid={Boolean(field("identifier"))}
            autoFocus
          />
        </Field>
      ) : (
        <Field
          label="Phone number"
          htmlFor="identifier"
          error={field("identifier")}
          hint="Include your country code, e.g. +44 7911 123456 or +91 98765 43210."
        >
          <Input
            id="identifier"
            type="tel"
            autoComplete="tel"
            placeholder="+44 7911 123456"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            invalid={Boolean(field("identifier"))}
            autoFocus
          />
        </Field>
      )}

      <Field label="Surname" htmlFor="surname" error={field("surname")}>
        <Input
          id="surname"
          autoComplete="family-name"
          placeholder="e.g. O'Neill"
          value={surname}
          onChange={(e) => setSurname(e.target.value)}
          invalid={Boolean(field("surname"))}
          maxLength={100}
        />
      </Field>

      <Field label="Date of birth" htmlFor="dateOfBirth" error={field("dateOfBirth")} hint="You must be 13 or older.">
        <Input
          id="dateOfBirth"
          type="date"
          autoComplete="bday"
          value={dateOfBirth}
          onChange={(e) => setDateOfBirth(e.target.value)}
          invalid={Boolean(field("dateOfBirth"))}
          min="1900-01-01"
          // Set on focus, not render, so the prerendered HTML has no clock in it.
          onFocus={(e) => (e.currentTarget.max = isoDateYearsAgo(13))}
        />
      </Field>

      {error && !error.fieldErrors && <Alert>{error.message}</Alert>}

      <Button type="submit" className="w-full" loading={sending}>
        Continue
      </Button>
      <p className="text-faint text-center text-xs leading-relaxed">
        We&apos;ll send a 6-digit code to confirm it&apos;s you. You can add Face ID or a
        fingerprint after signing up.
      </p>
    </form>
  );
}

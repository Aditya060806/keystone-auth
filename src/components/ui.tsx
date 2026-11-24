import Link from "next/link";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export function Logo() {
  return (
    <Link href="/" className="text-ink inline-flex items-center gap-2 font-semibold tracking-tight">
      <span className="bg-ink text-surface grid size-7 place-items-center rounded-lg">
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 3 4 7v5c0 4.4 3.4 8.4 8 9 4.6-.6 8-4.6 8-9V7z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      </span>
      Keystone
    </Link>
  );
}

export function AuthShell({ title, subtitle, children, footer }: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center px-4 py-10 sm:justify-center">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="border-line bg-surface rounded-2xl border p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.08)] sm:p-8">
          <h1 className="text-ink text-xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="text-muted mt-1.5 text-sm leading-relaxed">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
        {footer && <div className="text-muted mt-6 text-center text-sm">{footer}</div>}
      </div>
    </main>
  );
}

export function Field({ label, htmlFor, error, hint, children }: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-ink block text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : hint ? (
        <p className="text-muted text-xs">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({ invalid, className = "", ...props }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      {...props}
      aria-invalid={invalid || undefined}
      className={[
        "bg-surface text-ink placeholder:text-faint h-11 w-full rounded-xl border px-3.5 text-[15px] outline-none transition",
        "focus:border-ink focus:ring-ink/10 focus:ring-4",
        invalid ? "border-red-400 dark:border-red-500/60" : "border-line-strong",
        className,
      ].join(" ")}
    />
  );
}

export function Button({ variant = "primary", loading, children, className = "", disabled, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  loading?: boolean;
}) {
  const styles = {
    primary: "bg-ink text-surface hover:bg-ink/90",
    secondary: "border-line-strong bg-surface text-ink hover:bg-surface-muted border",
    ghost: "text-ink hover:bg-surface-muted",
    danger: "text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40",
  }[variant];
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={[
        "inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-[15px] font-medium transition",
        "focus-visible:ring-ink/20 outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-60",
        styles,
        className,
      ].join(" ")}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function Spinner() {
  return (
    <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Alert({ tone = "error", children }: { tone?: "error" | "info" | "warning" | "success"; children: ReactNode }) {
  const styles = {
    error: "border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200",
    info: "border-line bg-surface-muted text-ink",
    warning: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-100",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-xl border px-3.5 py-3 text-sm leading-relaxed ${styles}`}>
      {children}
    </div>
  );
}

export function Divider({ children }: { children: ReactNode }) {
  return (
    <div className="text-faint my-6 flex items-center gap-3 text-xs font-medium uppercase tracking-wider">
      <span className="bg-line h-px flex-1" />
      {children}
      <span className="bg-line h-px flex-1" />
    </div>
  );
}

export function BiometricIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
      <path d="M9 9.5v1M15 9.5v1M12 9v4.5h-1M9.5 15.5c1.4 1 3.6 1 5 0" />
    </svg>
  );
}

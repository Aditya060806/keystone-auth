"use client";

import { useEffect, useRef } from "react";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
};

const LENGTH = 6;

/**
 * Six boxes backed by one real input, so iOS/Android SMS autofill
 * (autocomplete="one-time-code"), paste, and screen readers all just work.
 */
export function OtpInput({ value, onChange, onComplete, disabled, invalid }: Props) {
  const ref = useRef<HTMLInputElement>(null);

  // Focus on mount, and again when re-enabled after a failed attempt.
  useEffect(() => {
    if (!disabled) ref.current?.focus();
  }, [disabled]);

  const digits = value.padEnd(LENGTH, " ").slice(0, LENGTH).split("");
  const activeIndex = Math.min(value.length, LENGTH - 1);

  return (
    <div className="relative" onClick={() => ref.current?.focus()}>
      <input
        ref={ref}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const next = e.target.value.replace(/\D/g, "").slice(0, LENGTH);
          onChange(next);
          if (next.length === LENGTH) onComplete?.(next);
        }}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={LENGTH}
        aria-label="6-digit code"
        aria-invalid={invalid || undefined}
        className="absolute inset-0 h-full w-full cursor-text opacity-0"
      />
      <div className="grid grid-cols-6 gap-2" aria-hidden>
        {digits.map((d, i) => {
          const filled = d.trim() !== "";
          const active = !disabled && i === activeIndex && value.length < LENGTH;
          return (
            <div
              key={i}
              className={[
                "flex h-14 items-center justify-center rounded-xl border text-2xl font-semibold tabular-nums transition-colors",
                invalid
                  ? "border-red-400 bg-red-50 text-red-900 dark:border-red-500/60 dark:bg-red-950/40 dark:text-red-100"
                  : active
                    ? "border-ink ring-ink/15 bg-surface ring-4"
                    : filled
                      ? "border-line-strong bg-surface"
                      : "border-line bg-surface-muted",
                disabled ? "opacity-60" : "",
              ].join(" ")}
            >
              {filled ? d : active ? <span className="bg-ink h-6 w-px animate-pulse" /> : ""}
            </div>
          );
        })}
      </div>
    </div>
  );
}

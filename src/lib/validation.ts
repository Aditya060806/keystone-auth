import { z } from "zod";
import { parsePhoneNumberFromString } from "libphonenumber-js";

export type Channel = "email" | "sms";
export type Identifier = { channel: Channel; value: string };

const emailSchema = z.email().max(254);

/**
 * Accepts an email or an international phone number and returns its
 * canonical form: lower-cased email, or E.164 phone (+447911123456).
 */
export function parseIdentifier(input: string): Identifier | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (trimmed.includes("@")) {
    const value = trimmed.toLowerCase();
    return emailSchema.safeParse(value).success
      ? { channel: "email", value }
      : null;
  }

  if (!trimmed.startsWith("+")) return null;
  const phone = parsePhoneNumberFromString(trimmed);
  if (!phone || !phone.isValid()) return null;
  return { channel: "sms", value: phone.number };
}

export const identifierSchema = z
  .string()
  .max(320)
  .transform((v, ctx) => {
    const parsed = parseIdentifier(v);
    if (!parsed) {
      ctx.addIssue({
        code: "custom",
        message:
          "Enter a valid email, or a phone number with country code (e.g. +44 7911 123456).",
      });
      return z.NEVER;
    }
    return parsed;
  });

export const MIN_AGE = 13;
export const MAX_AGE = 120;

/** Whole years between an ISO date and `today` (both YYYY-MM-DD, UTC). */
export function ageOn(dob: string, today: Date): number {
  const [y, m, d] = dob.split("-").map(Number);
  const ty = today.getUTCFullYear();
  const tm = today.getUTCMonth() + 1;
  const td = today.getUTCDate();
  let age = ty - y;
  if (tm < m || (tm === m && td < d)) age--;
  return age;
}

export function isRealDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
  );
}

export const dateOfBirthSchema = z
  .string()
  .refine(isRealDate, "Enter a valid date of birth.")
  .refine((v) => ageOn(v, new Date()) >= 0, "Date of birth can't be in the future.")
  .refine(
    (v) => ageOn(v, new Date()) >= MIN_AGE,
    `You must be at least ${MIN_AGE} to sign up.`,
  )
  .refine((v) => ageOn(v, new Date()) <= MAX_AGE, "Enter a valid date of birth.");

export const surnameSchema = z
  .string()
  .transform((v) => v.trim().replace(/\s+/g, " "))
  .pipe(
    z
      .string()
      .min(1, "Enter your surname.")
      .max(100, "Surname is too long.")
      .regex(
        /^[\p{L}\p{M}][\p{L}\p{M}' .-]*$/u,
        "Surname can only contain letters, spaces, hyphens and apostrophes.",
      ),
  );

export const codeSchema = z
  .string()
  .regex(/^\d{6}$/, "Enter the 6-digit code.");

export const signupStartSchema = z.object({
  identifier: identifierSchema,
  surname: surnameSchema,
  dateOfBirth: dateOfBirthSchema,
});

export const loginStartSchema = z.object({ identifier: identifierSchema });

export const verifySchema = z.object({
  identifier: identifierSchema,
  code: codeSchema,
});

/** Masks for display: j•••@example.com, +44•••••••456 */
export function maskIdentifier(id: Identifier): string {
  if (id.channel === "email") {
    const [local, domain] = id.value.split("@");
    return `${local.slice(0, 1)}•••@${domain}`;
  }
  return `${id.value.slice(0, 3)}${"•".repeat(Math.max(0, id.value.length - 6))}${id.value.slice(-3)}`;
}

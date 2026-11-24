import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/** Uniformly random 6-digit code, leading zeros allowed. */
export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/** 256-bit random token, base64url. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Keyed hash for one-time codes. A plain hash of a 6-digit code can be
 * reversed by brute force in milliseconds; an HMAC with a server secret
 * cannot, even if the database leaks. Binding purpose + identifier means a
 * code issued for one flow or address cannot be replayed against another.
 */
export function hashOtp(
  secret: string,
  parts: { purpose: string; identifier: string; code: string },
): string {
  return createHmac("sha256", secret)
    .update(`${parts.purpose}\u0000${parts.identifier}\u0000${parts.code}`)
    .digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

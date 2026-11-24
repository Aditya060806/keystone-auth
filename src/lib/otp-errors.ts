import "server-only";
import { HttpError, tooManyRequests } from "./http";
import type { VerifyResult } from "./otp";

export function throwForFailedVerify(result: Extract<VerifyResult, { ok: false }>): never {
  switch (result.reason) {
    case "rate_limited":
      tooManyRequests(result.retryAfterSeconds ?? 60);
    case "expired":
      throw new HttpError(400, "code_expired", "That code has expired. Request a new one.");
    case "too_many_attempts":
      throw new HttpError(
        400,
        "code_locked",
        "Too many incorrect attempts. Request a new code.",
      );
    case "invalid":
      throw new HttpError(
        400,
        "code_invalid",
        result.attemptsLeft
          ? `That code isn't right. ${result.attemptsLeft} attempt${result.attemptsLeft === 1 ? "" : "s"} left.`
          : "That code isn't right, or it has already been used.",
        { attemptsLeft: result.attemptsLeft },
      );
  }
}

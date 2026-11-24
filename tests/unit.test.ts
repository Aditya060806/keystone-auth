import { describe, expect, it } from "vitest";
import { generateOtp, hashOtp, safeEqualHex } from "@/lib/crypto";
import { describeUserAgent } from "@/lib/user-agent";
import {
  ageOn,
  dateOfBirthSchema,
  isRealDate,
  maskIdentifier,
  parseIdentifier,
  surnameSchema,
} from "@/lib/validation";

describe("generateOtp", () => {
  it("always returns exactly six digits", () => {
    for (let i = 0; i < 2000; i++) expect(generateOtp()).toMatch(/^\d{6}$/);
  });
});

describe("hashOtp", () => {
  const base = { purpose: "login", identifier: "a@b.co", code: "123456" };
  it("is deterministic for the same input", () => {
    expect(hashOtp("s".repeat(32), base)).toBe(hashOtp("s".repeat(32), base));
  });
  it("binds the code to purpose, identifier and secret", () => {
    const h = hashOtp("s".repeat(32), base);
    expect(hashOtp("s".repeat(32), { ...base, purpose: "signup" })).not.toBe(h);
    expect(hashOtp("s".repeat(32), { ...base, identifier: "x@b.co" })).not.toBe(h);
    expect(hashOtp("t".repeat(32), base)).not.toBe(h);
  });
  it("compares in constant time and handles length mismatch", () => {
    const h = hashOtp("s".repeat(32), base);
    expect(safeEqualHex(h, h)).toBe(true);
    expect(safeEqualHex(h, h.slice(0, -2))).toBe(false);
  });
});

describe("parseIdentifier", () => {
  it("normalises emails to lower case", () => {
    expect(parseIdentifier("  Jane.Doe@Example.COM ")).toEqual({
      channel: "email",
      value: "jane.doe@example.com",
    });
  });
  it("normalises phone numbers to E.164", () => {
    expect(parseIdentifier("+44 7911 123 456")).toEqual({ channel: "sms", value: "+447911123456" });
    expect(parseIdentifier("+91 98765-43210")).toEqual({ channel: "sms", value: "+919876543210" });
  });
  it("rejects invalid input and numbers without a country code", () => {
    expect(parseIdentifier("not-an-email@")).toBeNull();
    expect(parseIdentifier("07700900123")).toBeNull();
    expect(parseIdentifier("+1 123")).toBeNull();
    expect(parseIdentifier("")).toBeNull();
  });
});

describe("date of birth", () => {
  it("rejects impossible dates", () => {
    expect(isRealDate("2001-02-29")).toBe(false);
    expect(isRealDate("2000-02-29")).toBe(true);
    expect(isRealDate("2000-13-01")).toBe(false);
    expect(isRealDate("01/02/2000")).toBe(false);
  });
  it("computes age correctly around birthdays", () => {
    const today = new Date(Date.UTC(2026, 10, 24));
    expect(ageOn("2013-11-24", today)).toBe(13);
    expect(ageOn("2013-11-25", today)).toBe(12);
  });
  it("enforces the minimum age and rejects future dates", () => {
    expect(dateOfBirthSchema.safeParse("1990-05-17").success).toBe(true);
    expect(dateOfBirthSchema.safeParse("2099-01-01").success).toBe(false);
    const tooYoung = new Date();
    tooYoung.setUTCFullYear(tooYoung.getUTCFullYear() - 5);
    expect(dateOfBirthSchema.safeParse(tooYoung.toISOString().slice(0, 10)).success).toBe(false);
  });
});

describe("surname", () => {
  it("accepts real-world surnames and trims whitespace", () => {
    for (const s of ["O'Neill", "García Márquez", "Smith-Jones", "Nguyễn", "van der Berg", "Ó Briain"]) {
      expect(surnameSchema.safeParse(s).success, s).toBe(true);
    }
    expect(surnameSchema.parse("  de   la Cruz ")).toBe("de la Cruz");
  });
  it("rejects empty, numeric or markup input", () => {
    for (const s of ["", "   ", "R2D2", "<script>", "-Smith"]) {
      expect(surnameSchema.safeParse(s).success, s).toBe(false);
    }
  });
});

describe("display helpers", () => {
  it("masks identifiers", () => {
    expect(maskIdentifier({ channel: "email", value: "jane@example.com" })).toBe("j•••@example.com");
    expect(maskIdentifier({ channel: "sms", value: "+447911123456" })).toBe("+44•••••••456");
  });
  it("describes common user agents", () => {
    expect(
      describeUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      ),
    ).toBe("Safari on iPhone");
    expect(
      describeUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Edg/140.0",
      ),
    ).toBe("Edge on Windows");
    expect(describeUserAgent(null)).toBe("Unknown device");
  });
});

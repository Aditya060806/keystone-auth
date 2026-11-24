/**
 * End-to-end passkey tests through the real route handlers, with a software
 * authenticator standing in for Face ID / Touch ID / Windows Hello.
 */
import { describe, expect, it } from "vitest";
import { ORIGIN, newDevice, post, switchToDevice } from "./harness";
import { SoftAuthenticator } from "./soft-authenticator";

const regOptions = await import("@/app/api/auth/passkey/register/options/route");
const regVerify = await import("@/app/api/auth/passkey/register/verify/route");
const loginOptions = await import("@/app/api/auth/passkey/login/options/route");
const loginVerify = await import("@/app/api/auth/passkey/login/verify/route");
const sessionRoute = await import("@/app/api/auth/session/route");
const { startSession } = await import("@/lib/session");
const { createUser } = await import("@/lib/users");

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";
const LAPTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36";

let n = 0;
async function signedInUser(ua: string) {
  const { user } = await createUser(
    { channel: "email", value: `wa${++n}-${Date.now()}@example.com` },
    { surname: "Lovelace", dateOfBirth: "1990-12-10" },
  );
  const device = newDevice(ua);
  await startSession(user.id, "otp", { ip: null, userAgent: ua });
  return { user, device };
}

async function register(auth: SoftAuthenticator) {
  const optsRes = await regOptions.POST(post("/api/auth/passkey/register/options"));
  expect(optsRes.status).toBe(200);
  const opts = await optsRes.json();
  expect(opts.authenticatorSelection).toMatchObject({ residentKey: "required", userVerification: "required" });
  const credential = auth.create(opts);
  return regVerify.POST(post("/api/auth/passkey/register/verify", { response: credential }));
}

async function passkeyLogin(auth: SoftAuthenticator, overrides?: { counter?: number }) {
  const opts = await (await loginOptions.POST(post("/api/auth/passkey/login/options"))).json();
  expect(opts.allowCredentials ?? []).toHaveLength(0); // usernameless
  const assertion = auth.get(opts, undefined, overrides);
  return loginVerify.POST(post("/api/auth/passkey/login/verify", { response: assertion }));
}

describe("passkeys", () => {
  it("registers a passkey and signs in with it on a new device, signing the old one out", async () => {
    const { device: laptop } = await signedInUser(LAPTOP);
    const faceId = new SoftAuthenticator(ORIGIN);

    expect((await register(faceId)).status).toBe(200);

    // Sign in on a phone with the passkey.
    const phone = newDevice(IPHONE);
    const res = await passkeyLogin(faceId);
    expect(res.status).toBe(200);
    expect((await sessionRoute.GET(post("/api/auth/session"))).status).toBe(200);

    // The laptop has been signed out, and is told where.
    switchToDevice(laptop);
    const laptopState = await sessionRoute.GET(post("/api/auth/session"));
    expect(laptopState.status).toBe(401);
    expect(await laptopState.json()).toEqual({ status: "replaced", signedInOn: "Safari on iPhone" });

    switchToDevice(phone);
    expect((await sessionRoute.GET(post("/api/auth/session"))).status).toBe(200);
  });

  it("requires a signed-in user to register", async () => {
    newDevice(LAPTOP);
    const res = await regOptions.POST(post("/api/auth/passkey/register/options"));
    expect(res.status).toBe(401);
  });

  it("rejects a registration that skipped biometric/PIN verification", async () => {
    await signedInUser(LAPTOP);
    const res = await register(new SoftAuthenticator(ORIGIN, { userVerified: false }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("passkey_invalid");
  });

  it("rejects a credential created for another website", async () => {
    await signedInUser(LAPTOP);
    const res = await register(new SoftAuthenticator("https://evil.example"));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("passkey_invalid");
  });

  it("rejects a replayed challenge", async () => {
    await signedInUser(LAPTOP);
    const auth = new SoftAuthenticator(ORIGIN);
    await register(auth);

    newDevice(IPHONE);
    const opts = await (await loginOptions.POST(post("/api/auth/passkey/login/options"))).json();
    const assertion = auth.get(opts);
    const cookieSnapshot = new Map(
      (globalThis as unknown as { __req: { jar: Map<string, string> } }).__req.jar,
    );
    expect((await loginVerify.POST(post("/api/auth/passkey/login/verify", { response: assertion }))).status).toBe(200);

    // Same challenge cookie + same signed assertion, sent again.
    const attacker = newDevice(IPHONE);
    for (const [k, v] of cookieSnapshot) if (k.includes("webauthn")) attacker.jar.set(k, v);
    const replay = await loginVerify.POST(post("/api/auth/passkey/login/verify", { response: assertion }));
    expect(replay.status).toBe(400);
    expect((await replay.json()).error.code).toBe("challenge_invalid");
  });

  it("rejects a cloned authenticator whose signature counter goes backwards", async () => {
    await signedInUser(LAPTOP);
    const auth = new SoftAuthenticator(ORIGIN);
    await register(auth);
    newDevice(IPHONE);
    expect((await passkeyLogin(auth, { counter: 10 })).status).toBe(200);
    newDevice(IPHONE);
    const cloned = await passkeyLogin(auth, { counter: 5 });
    expect(cloned.status).toBe(400);
    expect((await cloned.json()).error.code).toBe("passkey_invalid");
  });

  it("rejects requests from another origin (CSRF)", async () => {
    await signedInUser(LAPTOP);
    const req = new Request(ORIGIN + "/api/auth/passkey/register/options", {
      method: "POST",
      headers: { origin: "https://evil.example" },
    });
    expect((await regOptions.POST(req)).status).toBe(403);
  });
});

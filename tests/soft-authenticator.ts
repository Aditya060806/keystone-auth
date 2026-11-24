/**
 * A minimal software WebAuthn platform authenticator (ES256, "none"
 * attestation). It produces the exact same JSON a browser returns from
 * navigator.credentials.create()/get(), so the server's real verification
 * code runs end to end without Face ID hardware.
 */
import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from "node:crypto";

const b64u = (b: Uint8Array) => Buffer.from(b).toString("base64url");
const sha256 = (b: Uint8Array | string) => createHash("sha256").update(b).digest();

// ── Tiny CBOR encoder (just what attestation objects need) ────────────────
function head(major: number, n: number): Buffer {
  if (n < 24) return Buffer.from([(major << 5) | n]);
  if (n < 256) return Buffer.from([(major << 5) | 24, n]);
  if (n < 65536) return Buffer.from([(major << 5) | 25, n >> 8, n & 0xff]);
  const b = Buffer.alloc(5);
  b[0] = (major << 5) | 26;
  b.writeUInt32BE(n, 1);
  return b;
}
type Cbor = number | string | Uint8Array | Map<Cbor, Cbor>;
function cbor(v: Cbor): Buffer {
  if (typeof v === "number") return v >= 0 ? head(0, v) : head(1, -1 - v);
  if (typeof v === "string") {
    const s = Buffer.from(v, "utf8");
    return Buffer.concat([head(3, s.length), s]);
  }
  if (v instanceof Uint8Array) return Buffer.concat([head(2, v.length), Buffer.from(v)]);
  const parts = [head(5, v.size)];
  for (const [k, val] of v) parts.push(cbor(k), cbor(val));
  return Buffer.concat(parts);
}

const FLAG_UP = 0x01;
const FLAG_UV = 0x04;
const FLAG_AT = 0x40;

export class SoftAuthenticator {
  private credentials = new Map<
    string,
    { privateKey: KeyObject; userHandle: string; rpId: string; counter: number }
  >();

  constructor(
    private origin: string,
    private opts: { userVerified?: boolean } = {},
  ) {}

  private flags(extra = 0) {
    return FLAG_UP | (this.opts.userVerified === false ? 0 : FLAG_UV) | extra;
  }

  /** navigator.credentials.create() */
  create(options: { challenge: string; rp: { id?: string }; user: { id: string } }) {
    const rpId = options.rp.id!;
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const jwk = publicKey.export({ format: "jwk" });
    const credId = randomBytes(32);

    const coseKey = new Map<Cbor, Cbor>([
      [1, 2], // kty: EC2
      [3, -7], // alg: ES256
      [-1, 1], // crv: P-256
      [-2, Buffer.from(jwk.x!, "base64url")],
      [-3, Buffer.from(jwk.y!, "base64url")],
    ]);
    const counter = 0;
    const credIdLen = Buffer.alloc(2);
    credIdLen.writeUInt16BE(credId.length);
    const signCount = Buffer.alloc(4);
    signCount.writeUInt32BE(counter);
    const authData = Buffer.concat([
      sha256(rpId),
      Buffer.from([this.flags(FLAG_AT)]),
      signCount,
      Buffer.alloc(16), // AAGUID
      credIdLen,
      credId,
      cbor(coseKey),
    ]);
    const attestationObject = cbor(
      new Map<Cbor, Cbor>([
        ["fmt", "none"],
        ["attStmt", new Map()],
        ["authData", authData],
      ]),
    );
    const clientDataJSON = Buffer.from(
      JSON.stringify({ type: "webauthn.create", challenge: options.challenge, origin: this.origin, crossOrigin: false }),
    );

    this.credentials.set(b64u(credId), { privateKey, userHandle: options.user.id, rpId, counter });
    return {
      id: b64u(credId),
      rawId: b64u(credId),
      type: "public-key" as const,
      authenticatorAttachment: "platform",
      clientExtensionResults: {},
      response: {
        clientDataJSON: b64u(clientDataJSON),
        attestationObject: b64u(attestationObject),
        transports: ["internal"],
      },
    };
  }

  /** navigator.credentials.get() with a discoverable credential. */
  get(options: { challenge: string; rpId?: string }, credentialId?: string, overrides: { counter?: number } = {}) {
    const id = credentialId ?? [...this.credentials.keys()][0];
    const cred = this.credentials.get(id);
    if (!cred) throw new Error("No credential");
    cred.counter = overrides.counter ?? cred.counter + 1;

    const signCount = Buffer.alloc(4);
    signCount.writeUInt32BE(cred.counter);
    const authData = Buffer.concat([sha256(options.rpId ?? cred.rpId), Buffer.from([this.flags()]), signCount]);
    const clientDataJSON = Buffer.from(
      JSON.stringify({ type: "webauthn.get", challenge: options.challenge, origin: this.origin, crossOrigin: false }),
    );
    const signature = sign("sha256", Buffer.concat([authData, sha256(clientDataJSON)]), cred.privateKey);

    return {
      id,
      rawId: id,
      type: "public-key" as const,
      authenticatorAttachment: "platform",
      clientExtensionResults: {},
      response: {
        clientDataJSON: b64u(clientDataJSON),
        authenticatorData: b64u(authData),
        signature: b64u(signature),
        userHandle: cred.userHandle,
      },
    };
  }
}

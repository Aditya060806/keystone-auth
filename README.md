# Keystone

**Live demo: https://keystone-auth.vercel.app** (demo mode: codes are shown on screen instead of being emailed or texted)

Passwordless authentication in Next.js and TypeScript:

1. **Sign-up** with an email address *or* a phone number, plus surname and date of birth.
2. **Login** with a 6-digit code sent by email (Resend) or SMS (Twilio), or with
   **Face ID / Touch ID / a fingerprint / Windows Hello** using WebAuthn passkeys (SimpleWebAuthn).
3. **One active device per user.** Signing in on a new device signs the old one out immediately.

```
Next.js 16 (App Router) · TypeScript · PostgreSQL (Supabase) · Drizzle ORM
SimpleWebAuthn · Resend · Twilio · Tailwind CSS · Vitest
```

---

## Run it locally (no setup needed)

```bash
npm install
npm run dev        # http://localhost:3000
```

Locally there's no database or provider to configure:

- **Database:** with no `DATABASE_URL` set, the app uses [PGlite](https://pglite.dev), a real
  Postgres compiled to WebAssembly and stored in `./.pglite`. Migrations run automatically.
  The first request takes about 15 s while it initialises; after that it's instant.
- **Codes:** with no Resend or Twilio keys, the code appears on screen (marked *Demo mode*) and
  is printed in the server log.
- **Passkeys** work on `http://localhost`. Browsers treat localhost as a secure context.

```bash
npm test           # 34 unit + integration tests against a real Postgres (in-memory)
npm run lint
npm run typecheck
```

---

## How it works

### Sign-up

```
POST /api/auth/signup/start   { identifier, surname, dateOfBirth }
POST /api/auth/signup/verify  { identifier, code }
```

- `identifier` is an email or a phone number. Emails are lower-cased. Phones must include a
  country code and are normalised to E.164 with `libphonenumber-js`
  (`+44 7911 123 456` → `+447911123456`).
- Surnames allow Unicode letters, spaces, hyphens and apostrophes (`O'Neill`, `García Márquez`,
  `Nguyễn`). Dates of birth must be real calendar dates, not in the future, and at least
  13 years ago.
- **No user row exists until the code is verified.** The pending surname and date of birth
  ride along with the code (`otp_codes.payload`), so unverified sign-ups never touch `users`.
- **No account enumeration.** If the email or phone is already registered, sign-up behaves
  exactly the same. Verifying the code proves the person owns that address, so they're simply
  signed in to their existing account, and their profile is left unchanged.

### 6-digit codes (`src/lib/otp.ts`)

| Property | Implementation |
|---|---|
| Generation | `crypto.randomInt(0, 1_000_000)`, zero-padded: uniform, CSPRNG |
| Storage | **HMAC-SHA256** with `AUTH_SECRET`, bound to `purpose + identifier + code`. A plain hash of a 6-digit code can be brute-forced instantly if the DB leaks; an HMAC can't. Binding means a sign-up code can't be used to log in, and a code for one address can't be used for another. |
| Expiry | 5 minutes |
| Attempts | 5 per code. The counter is incremented **atomically before comparing** (`UPDATE … WHERE attempts < max RETURNING`), so parallel guesses can't exceed it. |
| Single use | `consumed_at` is set with a conditional update; only one concurrent request can win |
| Re-issue | Issuing a new code invalidates any older unused code |
| Comparison | `crypto.timingSafeEqual` |
| Rate limits | Resend cooldown 30 s; 5 codes/hour per address; 30 codes/hour per IP; 15 verify attempts/hour per address (so requesting fresh codes can't reset the guess budget); 60/hour per IP |

Rate limits are fixed-window counters in Postgres (one atomic upsert), so they hold across
every serverless instance on Vercel without Redis.

Login (`/api/auth/login/start`) returns the same response whether or not the account exists.

**SMS** is sent through Twilio's REST API with `fetch`, so there's no SDK dependency. The message
ends with `@your-domain #123456`, the [origin-bound one-time code](https://wicg.github.io/sms-one-time-codes/)
format that lets iOS and Android autofill the code safely. The code input uses
`autocomplete="one-time-code"`.

### Biometrics: WebAuthn passkeys (`src/app/api/auth/passkey/*`)

Face ID, Touch ID, Android fingerprint and Windows Hello all go through the same standard:
WebAuthn. The biometric never leaves the device. The device signs a server challenge with a
private key bound to this domain, and the server checks the signature with the stored public key.

- **Registration** (signed-in users only): `residentKey: "required"` (a discoverable credential,
  so no username is needed later), `userVerification: "required"` (the biometric or device PIN
  must actually be used, not just a tap), and `excludeCredentials` stops the same device being
  registered twice.
- **Login** is usernameless: there's no `allowCredentials`, the browser offers the user's
  passkey for this site, and the server looks the credential up by ID.
- **Challenges** are stored server-side, referenced by an httpOnly `SameSite=Strict` cookie, and
  consumed with `DELETE … RETURNING`, so each one works exactly once and expires after 5 minutes.
- The **signature counter** is checked and updated, so a cloned authenticator with a counter
  that goes backwards is rejected. The `userHandle` must match the credential's owner.
- The WebAuthn user ID is a random opaque value (`users.webauthn_user_id`), never the
  database ID or the email.
- The button label adapts to the device ("Face ID or Touch ID", "Windows Hello",
  "fingerprint or screen lock").

### One active device (`src/lib/session.ts`)

```
users.active_session_id ──► sessions.id
```

A session is valid **only if it is the row `users.active_session_id` points to**, it isn't
revoked, and it isn't expired. Every login, whether by code or passkey, runs in one transaction:

```sql
SELECT … FROM users WHERE id = $1 FOR UPDATE;           -- serialise concurrent logins
INSERT INTO sessions (…) RETURNING id;                    -- new session
UPDATE sessions SET revoked_at = now(), revoked_reason = 'replaced'
  WHERE user_id = $1 AND id <> $new AND revoked_at IS NULL;
UPDATE users SET active_session_id = $new WHERE id = $1;
```

The row lock means two devices signing in at the same moment can't both end up active.

- **Every request from an old device is rejected** server-side (`401 session_replaced`).
- **The old device finds out within seconds:** signed-in pages check
  `/api/auth/session` every 10 s and as soon as the tab regains focus. The old device then goes
  to the login page with: *"You were signed out because your account signed in on another
  device (Safari on iPhone)."*
- The new sign-in and the device it replaced are recorded in `security_events` and shown on the
  dashboard.
- Session cookies hold a 256-bit random token. The database stores only its SHA-256, so a
  leaked `sessions` table can't be replayed. In production the cookie is
  `__Host-session; Secure; HttpOnly; SameSite=Lax; Path=/`.
- Logging out revokes the session server-side, so a copied cookie is useless afterwards.

### Other hardening

- **CSRF:** every state-changing endpoint checks the `Origin` header, on top of `SameSite` cookies.
- **Security headers:** HSTS, `X-Frame-Options: DENY`, `nosniff`, a strict referrer policy, and a
  `Permissions-Policy` that allows WebAuthn only for this origin.
- **Supabase Data API lockdown:** migration `0001_enable_rls.sql` enables row-level security
  with no policies on every table. Supabase's auto-generated REST API can't read them with the
  anon key, while the app (connecting as the table owner) is unaffected.
- **Errors:** validation errors are per field; internal errors never leak stack traces.
- **Audit log:** sign-ups, logins, replaced sessions, failed and locked codes, and passkey
  changes are stored in `security_events`.

---

## Deploy: Vercel + Supabase + Resend + Twilio

### 1. Database (Supabase)

1. Create a Supabase project.
2. **Project Settings → Database → Connection string**:
   - **Session pooler / direct** (port 5432) for migrations
   - **Transaction pooler** (port 6543) for the app (`prepare: false` is already set)
3. Run the migrations once:
   ```bash
   DATABASE_URL="postgresql://…:5432/postgres" npm run db:migrate
   ```

Any Postgres works (Neon, RDS, Vercel Postgres); nothing here is Supabase-specific.

### 2. Email (Resend)

Create an API key and verify a sending domain. `onboarding@resend.dev` only delivers to your own
Resend account's address, which is enough for a quick test.

### 3. SMS (Twilio)

You need an Account SID, an Auth Token, and a sender number or Messaging Service SID (`MG…`).
Trial accounts can only text numbers you've verified in the Twilio console.

### 4. Vercel

Import the repo and set these environment variables (see `.env.example`):

| Variable | Value |
|---|---|
| `DATABASE_URL` | Supabase transaction pooler URL (port 6543) |
| `AUTH_SECRET` | `openssl rand -base64 48` |
| `APP_URL` | `https://your-app.vercel.app` (passkeys are bound to this hostname) |
| `RESEND_API_KEY`, `EMAIL_FROM` | from Resend |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | from Twilio |
| `DEMO_SHOW_CODES` | `false`. Set it to `true` only for a public demo without SMS, so reviewers can try the phone flow. It shows codes on screen and reveals which accounts exist. |

The app refuses to start in production without `AUTH_SECRET` (32+ chars) and `DATABASE_URL`.

> Passkeys are bound to the RP ID (`APP_URL`'s hostname). Passkeys created on a preview URL
> won't work on the production domain, and vice versa. Use a stable production domain.

---

## Project structure

```
src/
  app/
    api/auth/
      signup/{start,verify}       sign-up: send code → verify, create user, start session
      login/{start,verify}        login with a code
      passkey/register/*          add Face ID / fingerprint (signed-in)
      passkey/login/*             usernameless biometric login
      passkey/[id]                remove a passkey
      session                     polled by signed-in pages (one-device enforcement)
      logout
    login/ signup/ dashboard/     UI
  db/schema.ts                    Drizzle schema (7 tables)
  lib/
    otp.ts                        issue / verify codes
    session.ts                    single-active-session logic
    webauthn.ts                   relying-party config, challenge store
    rate-limit.ts                 Postgres fixed-window limiter
    delivery.ts                   Resend + Twilio
    validation.ts                 identifier / surname / DOB rules
    http.ts                       route wrapper: origin check, typed errors
drizzle/                          SQL migrations
tests/
  unit.test.ts                    validation, crypto, helpers
  auth-flow.test.ts               codes, rate limits, single device (real Postgres via PGlite)
  webauthn.test.ts                passkey registration and login through the real route handlers
  soft-authenticator.ts           software Face ID: real P-256 keys, CBOR, signatures
```

## Tests

`npm test` runs 34 tests. The integration tests use an in-memory Postgres with the production
migrations. The passkey tests drive the **real route handlers** with a software authenticator
that produces the same attestation and assertion data as a phone's secure enclave. They cover:

- a code works once; a wrong code locks after 5 tries; expiry; re-issue invalidation;
  purpose binding; the resend cooldown; concurrent guessing
- the old device is signed out when a new one signs in (including the "signed in on" device
  name); exactly one active session after 6 simultaneous logins; logout invalidates copied cookies
- passkey registration and login; rejection without user verification; rejection of a
  credential made for another origin; replayed challenges; cloned authenticators (counter
  going backwards); cross-origin requests

## Known limitations

- The old device learns it was signed out by polling (10 s, plus immediately on tab focus). The
  server rejects it instantly either way. Server-sent events or Supabase Realtime could make the
  UI update instantly too.
- The concurrent-login test runs on PGlite, which has a single connection, so it checks the
  invariant but not real lock contention. Real lock contention relies on Postgres
  `SELECT … FOR UPDATE`.
- "One active device" is enforced per session, as specified. A synced passkey (iCloud Keychain,
  Google Password Manager) can still sign in on another of the user's devices, and doing so
  signs the previous one out.

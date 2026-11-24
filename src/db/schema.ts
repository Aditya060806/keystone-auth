import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  check,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/**
 * A user signs up with either an email address or a phone number (E.164).
 * At least one must be present; both are unique when present.
 *
 * `activeSessionId` is the single source of truth for "one active device":
 * a session is only valid if it is the one this column points at.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email"),
    phone: text("phone"),
    surname: text("surname").notNull(),
    dateOfBirth: date("date_of_birth", { mode: "string" }).notNull(),
    /** Opaque, random WebAuthn user handle (base64url). Never the DB id. */
    webauthnUserId: text("webauthn_user_id").notNull(),
    activeSessionId: uuid("active_session_id").references(
      (): AnyPgColumn => sessions.id,
      { onDelete: "set null" },
    ),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("users_email_key").on(t.email),
    uniqueIndex("users_phone_key").on(t.phone),
    uniqueIndex("users_webauthn_user_id_key").on(t.webauthnUserId),
    check(
      "users_contact_check",
      sql`${t.email} is not null or ${t.phone} is not null`,
    ),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references((): AnyPgColumn => users.id, { onDelete: "cascade" }),
    /** SHA-256 of the cookie token. The raw token is never stored. */
    tokenHash: text("token_hash").notNull(),
    authMethod: text("auth_method", { enum: ["otp", "passkey"] }).notNull(),
    userAgent: text("user_agent"),
    ip: text("ip"),
    createdAt: createdAt(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedReason: text("revoked_reason", {
      enum: ["replaced", "logout"],
    }),
  },
  (t) => [
    uniqueIndex("sessions_token_hash_key").on(t.tokenHash),
    index("sessions_user_id_idx").on(t.userId),
  ],
);

/**
 * One row per issued 6-digit code. Only an HMAC of the code is stored.
 * `payload` carries pending sign-up details until the code is verified,
 * so no user row exists for unverified identifiers.
 */
export const otpCodes = pgTable(
  "otp_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    identifier: text("identifier").notNull(),
    channel: text("channel", { enum: ["email", "sms"] }).notNull(),
    purpose: text("purpose", { enum: ["signup", "login"] }).notNull(),
    codeHash: text("code_hash").notNull(),
    payload: jsonb("payload").$type<{ surname: string; dateOfBirth: string }>(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("otp_codes_lookup_idx").on(t.identifier, t.purpose)],
);

export const passkeys = pgTable(
  "passkeys",
  {
    /** Credential ID, base64url. */
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** COSE public key, base64url. */
    publicKey: text("public_key").notNull(),
    counter: bigint("counter", { mode: "number" }).notNull().default(0),
    transports: jsonb("transports").$type<string[]>(),
    deviceType: text("device_type").notNull(),
    backedUp: boolean("backed_up").notNull(),
    aaguid: text("aaguid"),
    name: text("name").notNull(),
    createdAt: createdAt(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (t) => [index("passkeys_user_id_idx").on(t.userId)],
);

/** Single-use WebAuthn challenges, referenced by an httpOnly cookie. */
export const webauthnChallenges = pgTable("webauthn_challenges", {
  id: uuid("id").primaryKey().defaultRandom(),
  challenge: text("challenge").notNull(),
  purpose: text("purpose", { enum: ["register", "authenticate"] }).notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

/** Fixed-window counters. DB-backed so limits hold across serverless instances. */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
});

export const securityEvents = pgTable(
  "security_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    type: text("type", {
      enum: [
        "signup",
        "login_otp",
        "login_passkey",
        "session_replaced",
        "logout",
        "passkey_added",
        "passkey_removed",
        "otp_failed",
        "otp_locked",
        "passkey_failed",
      ],
    }).notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index("security_events_user_idx").on(t.userId, t.createdAt)],
);

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Passkey = typeof passkeys.$inferSelect;
export type SecurityEventType = (typeof securityEvents.$inferInsert)["type"];

-- Supabase exposes the public schema through its Data API (PostgREST).
-- Enabling RLS with no policies denies all access via anon/authenticated keys.
-- The app connects as the table owner, which bypasses RLS.
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "otp_codes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "passkeys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "webauthn_challenges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rate_limits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "security_events" ENABLE ROW LEVEL SECURITY;

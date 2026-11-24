import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { SecurityEventType } from "@/db/schema";
import { Alert, Logo } from "@/components/ui";
import { getSession } from "@/lib/session";
import { describeUserAgent } from "@/lib/user-agent";
import {
  AddPasskeyButton,
  LocalTime,
  RemovePasskeyButton,
  SessionWatcher,
  SignOutButton,
} from "./client";

export const metadata: Metadata = { title: "Your account" };

export default function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Dashboard searchParams={searchParams} />
    </Suspense>
  );
}

const EVENT_LABELS: Record<SecurityEventType, string> = {
  signup: "Account created",
  login_otp: "Signed in with a one-time code",
  login_passkey: "Signed in with a passkey",
  session_replaced: "Another device was signed out",
  logout: "Signed out",
  passkey_added: "Passkey added",
  passkey_removed: "Passkey removed",
  otp_failed: "Incorrect or expired code entered",
  otp_locked: "Code locked after too many attempts",
  passkey_failed: "Passkey sign-in failed",
};

async function Dashboard({ searchParams }: { searchParams: PageProps<"/dashboard">["searchParams"] }) {
  const state = await getSession();
  if (state.status === "replaced") {
    const qs = new URLSearchParams({ reason: "replaced" });
    if (state.signedInOn) qs.set("on", state.signedInOn);
    redirect(`/login?${qs}`);
  }
  if (state.status !== "active") redirect("/login");

  const { user, session } = state;
  const params = await searchParams;
  const db = await getDb();
  const [passkeys, events] = await Promise.all([
    db
      .select()
      .from(schema.passkeys)
      .where(eq(schema.passkeys.userId, user.id))
      .orderBy(desc(schema.passkeys.createdAt)),
    db
      .select()
      .from(schema.securityEvents)
      .where(eq(schema.securityEvents.userId, user.id))
      .orderBy(desc(schema.securityEvents.createdAt))
      .limit(8),
  ]);

  const contact = user.email ?? user.phone!;
  const [y, m, d] = user.dateOfBirth.split("-").map(Number);
  const dob = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <div className="min-h-dvh">
      <SessionWatcher />
      <header className="border-line bg-surface/80 sticky top-0 z-10 border-b backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Logo />
          <SignOutButton />
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <div>
          <h1 className="text-ink text-2xl font-semibold tracking-tight">Hello, {user.surname}</h1>
          <p className="text-muted mt-1 text-sm">Manage how you sign in and see recent activity.</p>
        </div>

        {params.existing === "1" && (
          <Alert tone="info">You already had an account with {contact}, so we signed you in to it.</Alert>
        )}

        {passkeys.length === 0 && (
          <section className="border-ink/10 from-surface to-surface-muted rounded-2xl border bg-gradient-to-br p-6">
            <h2 className="text-ink font-semibold">
              {params.welcome === "1" ? "You're in. One more step:" : "Sign in faster next time"}
            </h2>
            <p className="text-muted mt-1 mb-4 max-w-prose text-sm leading-relaxed">
              Add Face ID, Touch ID, a fingerprint or Windows Hello. It&apos;s a passkey, so it
              can&apos;t be phished or reused on another site, and your biometric never leaves
              your device.
            </p>
            <AddPasskeyButton prominent />
          </section>
        )}

        <Card title="This device" description="Only one device can be signed in at a time.">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex size-2.5 shrink-0 rounded-full bg-emerald-500 ring-4 ring-emerald-500/15" />
            <div className="text-sm">
              <p className="text-ink font-medium">{describeUserAgent(session.userAgent)}</p>
              <p className="text-muted mt-0.5">
                Signed in <LocalTime iso={session.createdAt.toISOString()} relative /> with{" "}
                {session.authMethod === "passkey" ? "a passkey" : "a one-time code"}
              </p>
              <p className="text-muted mt-3 leading-relaxed">
                If you sign in on another phone or computer, this one will be signed out
                automatically.
              </p>
            </div>
          </div>
        </Card>

        <Card
          title="Face ID & biometrics"
          description="Passkeys stored on your devices or in your password manager."
          action={passkeys.length > 0 ? <AddPasskeyButton /> : undefined}
        >
          {passkeys.length === 0 ? (
            <p className="text-muted text-sm">No passkeys yet.</p>
          ) : (
            <ul className="divide-line -my-3 divide-y">
              {passkeys.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0 text-sm">
                    <p className="text-ink flex flex-wrap items-center gap-2 font-medium">
                      {p.name}
                      {p.backedUp && (
                        <span className="bg-surface-muted text-muted rounded-md px-1.5 py-0.5 text-xs font-normal">
                          Synced
                        </span>
                      )}
                    </p>
                    <p className="text-muted mt-0.5">
                      Added <LocalTime iso={p.createdAt.toISOString()} />
                      {p.lastUsedAt && (
                        <>
                          {" · "}last used <LocalTime iso={p.lastUsedAt.toISOString()} relative />
                        </>
                      )}
                    </p>
                  </div>
                  <RemovePasskeyButton id={p.id} name={p.name} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Profile">
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            <Detail label="Surname" value={user.surname} />
            <Detail label="Date of birth" value={dob} />
            <Detail label={user.email ? "Email" : "Phone"} value={contact} />
          </dl>
        </Card>

        <Card title="Recent security activity">
          <ul className="space-y-3 text-sm">
            {events.map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-ink">{EVENT_LABELS[e.type]}</p>
                  <p className="text-muted truncate">
                    {e.type === "session_replaced" && e.metadata
                      ? `${String(e.metadata.signedOutDevice)} → ${String(e.metadata.newDevice)}`
                      : describeUserAgent(e.userAgent)}
                  </p>
                </div>
                <span className="text-faint shrink-0">
                  <LocalTime iso={e.createdAt.toISOString()} relative />
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </main>
    </div>
  );
}

function Card({ title, description, action, children }: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-line bg-surface rounded-2xl border p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-ink font-semibold">{title}</h2>
          {description && <p className="text-muted mt-0.5 text-sm">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="text-ink mt-0.5 font-medium break-all">{value}</dd>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-24" aria-busy>
      {[0, 1, 2].map((i) => (
        <div key={i} className="bg-surface border-line h-36 animate-pulse rounded-2xl border" />
      ))}
    </div>
  );
}

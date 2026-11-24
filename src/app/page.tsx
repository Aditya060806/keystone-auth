import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { BiometricIcon, Logo } from "@/components/ui";
import { getSession } from "@/lib/session";

async function RedirectIfSignedIn() {
  const state = await getSession();
  if (state.status === "active") redirect("/dashboard");
  return null;
}

const features = [
  {
    title: "No passwords",
    body: "Sign up with your email or phone. We confirm it with a 6-digit code that expires in 5 minutes.",
  },
  {
    title: "Face ID & fingerprint",
    body: "Add a passkey and sign in with your face, finger or Windows Hello. It can't be phished.",
  },
  {
    title: "One device at a time",
    body: "Signing in on a new device signs the old one out straight away, so a lost phone stays locked out.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4 py-6">
      <Suspense>
        <RedirectIfSignedIn />
      </Suspense>
      <header className="flex items-center justify-between">
        <Logo />
        <Link href="/login" className="text-ink text-sm font-medium hover:underline underline-offset-4">
          Sign in
        </Link>
      </header>

      <section className="flex flex-1 flex-col justify-center py-16">
        <span className="text-muted border-line bg-surface inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium">
          <BiometricIcon className="size-3.5" /> Passkeys · One-time codes · Single device
        </span>
        <h1 className="text-ink mt-5 max-w-xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Sign in with a glance, not a password.
        </h1>
        <p className="text-muted mt-4 max-w-lg text-lg leading-relaxed">
          Keystone is a demo of modern account security: email or SMS codes, Face ID and
          fingerprint sign-in, and one active device per account.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/signup"
            className="bg-ink text-surface hover:bg-ink/90 inline-flex h-11 items-center rounded-xl px-5 text-[15px] font-medium transition"
          >
            Create an account
          </Link>
          <Link
            href="/login"
            className="border-line-strong bg-surface text-ink hover:bg-surface-muted inline-flex h-11 items-center rounded-xl border px-5 text-[15px] font-medium transition"
          >
            Sign in
          </Link>
        </div>

        <div className="mt-16 grid gap-4 sm:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="border-line bg-surface rounded-2xl border p-5">
              <h2 className="text-ink font-semibold">{f.title}</h2>
              <p className="text-muted mt-1.5 text-sm leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

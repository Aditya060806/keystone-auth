import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/ui";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Create account" };

export default function SignupPage() {
  return (
    <AuthShell
      title="Create your account"
      subtitle="Sign up with your email or phone number."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="text-ink font-medium underline-offset-4 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <SignupForm />
    </AuthShell>
  );
}

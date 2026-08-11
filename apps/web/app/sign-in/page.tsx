import { redirect } from "next/navigation";

import { SignInForm } from "@/app/sign-in/sign-in-form";
import { SignInShell } from "@/app/sign-in/sign-in-shell";
import { getAuthSessionStatus } from "@/lib/server/auth-session";

export default async function SignInPage() {
  const sessionStatus = await getAuthSessionStatus();

  if (sessionStatus === "authenticated") {
    redirect("/dashboard");
  }

  return (
    <SignInShell>
      <SignInForm />
    </SignInShell>
  );
}

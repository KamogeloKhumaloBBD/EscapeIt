import { redirect } from "next/navigation";

import { SignInForm } from "@/app/sign-in/sign-in-form";
import { SignInShell } from "@/app/sign-in/sign-in-shell";
import { getAuthSessionStatus } from "@/lib/server/auth-session";
import { safeReturnPath } from "@/lib/validation/return-path";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const query = await searchParams;
  const returnTo = safeReturnPath(query.returnTo);
  const sessionStatus = await getAuthSessionStatus();

  if (sessionStatus === "authenticated") {
    redirect(returnTo ?? "/dashboard");
  }

  return (
    <SignInShell>
      <SignInForm returnTo={returnTo} />
    </SignInShell>
  );
}

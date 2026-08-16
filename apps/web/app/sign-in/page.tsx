import { redirect } from "next/navigation";

import { SignInForm } from "@/app/sign-in/sign-in-form";
import { SignInShell } from "@/app/sign-in/sign-in-shell";
import { getAuthSessionStatus } from "@/lib/server/auth-session";
import {
  oauthAuthorizationReturnPath,
  safeReturnPath,
} from "@/lib/validation/return-path";
import { emailSchema } from "@/lib/validation/sign-in";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const returnTo =
    safeReturnPath(query.returnTo) ?? oauthAuthorizationReturnPath(query);
  const parsedEmail = emailSchema.safeParse({ email: query.email });
  const initialEmail = parsedEmail.success ? parsedEmail.data.email : "";
  const sessionStatus = await getAuthSessionStatus();

  if (sessionStatus === "authenticated") {
    redirect(returnTo ?? "/dashboard");
  }

  return (
    <SignInShell>
      <SignInForm initialEmail={initialEmail} returnTo={returnTo} />
    </SignInShell>
  );
}

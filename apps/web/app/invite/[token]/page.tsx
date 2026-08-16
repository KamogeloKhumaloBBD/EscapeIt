import {
  EnvelopeSimpleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AcceptInvitationForm } from "@/app/invite/[token]/accept-invitation-form";
import { AppHeader } from "@/components/app-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getInvitationState } from "@/lib/server/member";
import { invitationTokenSchema } from "@/lib/validation/member";
import { emailSchema } from "@/lib/validation/sign-in";

const blockedCopy = {
  "already-member": {
    description: "This account already belongs to a workspace.",
    title: "You already have a workspace",
  },
  "email-mismatch": {
    description:
      "Sign out and use the email address that received this invitation.",
    title: "Use the invited email address",
  },
  unavailable: {
    description:
      "The link may have expired, been revoked, or already been used.",
    title: "Invitation unavailable",
  },
} as const;

export default async function InvitationPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ token: rawToken }, query] = await Promise.all([
    params,
    searchParams,
  ]);
  const parsed = invitationTokenSchema.safeParse(rawToken);

  if (!parsed.success) notFound();

  const token = parsed.data;
  const state = await getInvitationState(token);
  const returnTo = `/invite/${token}`;
  const parsedEmail = emailSchema.safeParse({ email: query.email });
  const signInParameters = new URLSearchParams({ returnTo });

  if (parsedEmail.success) {
    signInParameters.set("email", parsedEmail.data.email);
  }

  if (state.status === "anonymous") {
    return (
      <main className="min-h-screen bg-background text-foreground">
        <AppHeader showSignOut={false} />
        <section className="mx-auto flex min-h-[calc(100vh-88px)] w-full max-w-lg items-center px-6 pb-24">
          <Card className="w-full">
            <CardHeader>
              <EnvelopeSimpleIcon
                aria-hidden="true"
                className="mb-4 size-8 text-primary"
              />
              <CardTitle>You&apos;ve been invited</CardTitle>
              <CardDescription>
                Sign in with the email address that received the invitation to
                see the workspace and accept.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full">
                <Link href={`/sign-in?${signInParameters.toString()}`}>
                  Sign in to continue
                </Link>
              </Button>
            </CardContent>
          </Card>
        </section>
      </main>
    );
  }

  if (state.status === "blocked") {
    const copy = blockedCopy[state.reason];
    return (
      <main className="min-h-screen bg-background text-foreground">
        <AppHeader />
        <section className="mx-auto flex min-h-[calc(100vh-88px)] w-full max-w-lg items-center px-6 pb-24">
          <Alert variant="destructive">
            <WarningCircleIcon aria-hidden="true" />
            <AlertTitle>{copy.title}</AlertTitle>
            <AlertDescription>{copy.description}</AlertDescription>
          </Alert>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <AppHeader />
      <section className="mx-auto flex min-h-[calc(100vh-88px)] w-full max-w-lg items-center px-6 pb-24">
        <Card className="w-full">
          <CardHeader>
            <CardDescription>Workspace invitation</CardDescription>
            <CardTitle>Join {state.data.workspaceName}</CardTitle>
            <CardDescription>
              {state.data.inviterName} invited you to collaborate in this
              workspace. Your provider accounts will remain personal to you.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AcceptInvitationForm token={token} />
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

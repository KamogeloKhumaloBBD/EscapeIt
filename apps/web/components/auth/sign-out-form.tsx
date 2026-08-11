"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

import { signOutAction } from "@/app/auth-actions";
import { initialSignOutState } from "@/components/auth/sign-out-state";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

function SignOutButton() {
  const { pending } = useFormStatus();

  return (
    <Button
      className="w-full justify-start"
      disabled={pending}
      size="sm"
      type="submit"
      variant="ghost"
    >
      {pending ? <Spinner data-icon="inline-start" /> : null}
      {pending ? "Signing out..." : "Log out"}
    </Button>
  );
}

export function SignOutForm() {
  const [state, formAction, isPending] = useActionState(
    signOutAction,
    initialSignOutState,
  );

  useEffect(() => {
    if (state.error !== null) {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <form action={formAction} aria-busy={isPending}>
      <SignOutButton />
    </form>
  );
}

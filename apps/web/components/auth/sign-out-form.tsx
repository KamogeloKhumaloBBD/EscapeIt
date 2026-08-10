"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

import { signOutAction } from "@/app/auth-actions";
import { initialSignOutState } from "@/components/auth/sign-out-state";
import { Button } from "@/components/ui/button";

function SignOutButton() {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending} size="sm" type="submit">
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

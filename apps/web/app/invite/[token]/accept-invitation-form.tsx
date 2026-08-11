"use client";

import { CheckIcon } from "@phosphor-icons/react";
import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

import { acceptInvitationAction } from "@/app/invite/[token]/actions";
import { initialAcceptInvitationState } from "@/app/invite/[token]/action-state";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

function AcceptButton() {
  const { pending } = useFormStatus();

  return (
    <Button className="w-full" disabled={pending} type="submit">
      {pending ? <Spinner aria-hidden="true" /> : <CheckIcon />}
      {pending ? "Joining workspace..." : "Accept invitation"}
    </Button>
  );
}

export function AcceptInvitationForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(
    acceptInvitationAction,
    initialAcceptInvitationState,
  );

  useEffect(() => {
    if (state.status === "error" && state.message !== null) {
      toast.error(state.message);
    }
  }, [state]);

  return (
    <form action={formAction} aria-busy={pending}>
      <input name="token" type="hidden" value={token} />
      <AcceptButton />
      {state.message === null ? null : (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {state.message}
        </p>
      )}
    </form>
  );
}

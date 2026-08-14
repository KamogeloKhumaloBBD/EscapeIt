"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  consentAction,
  type ConsentActionState,
} from "@/app/oauth/consent/actions";
import { Button } from "@/components/ui/button";

const initialState: ConsentActionState = { message: null, status: "idle" };

function DecisionButtons() {
  const { pending } = useFormStatus();

  return (
    <div className="grid grid-cols-2 gap-3">
      <Button
        disabled={pending}
        name="decision"
        type="submit"
        value="deny"
        variant="outline"
      >
        Deny
      </Button>
      <Button disabled={pending} name="decision" type="submit" value="allow">
        {pending ? "Authorizing…" : "Allow"}
      </Button>
    </div>
  );
}

export function ConsentForm({ oauthQuery }: { oauthQuery: string }) {
  const [state, formAction] = useActionState(consentAction, initialState);

  return (
    <form action={formAction} className="mt-8 space-y-4">
      <input name="oauthQuery" type="hidden" value={oauthQuery} />
      <DecisionButtons />
      {state.message === null ? null : (
        <p className="text-sm text-destructive" role="alert">
          {state.message}
        </p>
      )}
    </form>
  );
}

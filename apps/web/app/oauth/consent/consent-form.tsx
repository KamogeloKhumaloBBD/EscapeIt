"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  consentAction,
  type ConsentActionState,
} from "@/app/oauth/consent/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

export function ConsentForm({
  bundles,
  oauthQuery,
}: {
  bundles: readonly { id: string; name: string }[];
  oauthQuery: string;
}) {
  const [state, formAction] = useActionState(consentAction, initialState);

  return (
    <form action={formAction} className="mt-8 space-y-4">
      <input name="oauthQuery" type="hidden" value={oauthQuery} />
      {bundles.length === 0 ? null : (
        <Field>
          <FieldLabel htmlFor="consent-bundle">Bundle</FieldLabel>
          <Select defaultValue="none" name="bundleId">
            <SelectTrigger className="w-full" id="consent-bundle">
              <SelectValue placeholder="All connected providers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">All connected providers</SelectItem>
              {bundles.map((bundle) => (
                <SelectItem key={bundle.id} value={bundle.id}>
                  {bundle.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
      <DecisionButtons />
      {state.message === null ? null : (
        <p className="text-sm text-destructive" role="alert">
          {state.message}
        </p>
      )}
    </form>
  );
}

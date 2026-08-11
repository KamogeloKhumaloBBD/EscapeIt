"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

import { createWorkspaceAction } from "@/app/onboarding/actions";
import { initialOnboardingState } from "@/app/onboarding/onboarding-state";
import { Button } from "@/components/ui/button";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button className="w-full" disabled={pending} type="submit">
      {pending ? "Creating workspace..." : "Create workspace"}
    </Button>
  );
}

export function OnboardingForm() {
  const [state, formAction, isPending] = useActionState(
    createWorkspaceAction,
    initialOnboardingState,
    "/onboarding",
  );

  useEffect(() => {
    if (state.message !== null) {
      toast.error(state.message);
    }
  }, [state.message]);

  return (
    <form action={formAction} aria-busy={isPending} className="mt-10 space-y-6">
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="workspace-name">
          Workspace name
        </label>
        <input
          aria-describedby={
            state.fieldErrors.name === undefined
              ? "workspace-name-hint"
              : "workspace-name-error"
          }
          aria-invalid={state.fieldErrors.name === undefined ? undefined : true}
          autoComplete="organization"
          autoFocus
          className="h-12 w-full border-0 border-b border-[#d8d2c7] bg-transparent px-0 text-base outline-none transition placeholder:text-[#a8a094] focus:border-[#15130f] focus:ring-0"
          defaultValue={state.name}
          disabled={isPending}
          id="workspace-name"
          maxLength={120}
          name="name"
          placeholder="Acme Engineering"
          required
        />
        {state.fieldErrors.name === undefined ? (
          <p className="text-sm text-[#817b72]" id="workspace-name-hint">
            This is the shared home for your team&apos;s context.
          </p>
        ) : (
          <p
            className="text-sm text-red-700"
            id="workspace-name-error"
            role="alert"
          >
            {state.fieldErrors.name}
          </p>
        )}
      </div>

      <SubmitButton />
    </form>
  );
}

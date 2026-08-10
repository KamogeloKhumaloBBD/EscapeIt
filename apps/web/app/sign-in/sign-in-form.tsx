"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

import { signInAction } from "@/app/sign-in/actions";
import { initialSignInState } from "@/app/sign-in/sign-in-state";
import { Button } from "@/components/ui/button";

function SubmitButton({
  pendingLabel,
  label,
}: {
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button className="w-full" disabled={pending} type="submit">
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function SignInForm() {
  const [state, formAction, isPending] = useActionState(
    signInAction,
    initialSignInState,
    "/sign-in",
  );

  useEffect(() => {
    if (state.message === null) {
      return;
    }

    if (state.status === "error") {
      toast.error(state.message);
      return;
    }

    toast.success("Sign-in code sent", {
      description: state.message,
    });
  }, [state]);

  if (state.step === "code") {
    return (
      <form
        action={formAction}
        aria-busy={isPending}
        className="mt-10 space-y-5"
      >
        <input name="intent" type="hidden" value="verify-code" />
        <input name="email" type="hidden" value={state.email} />

        <div className="space-y-2">
          <label htmlFor="code" className="text-sm font-medium">
            Code
          </label>
          <input
            id="code"
            name="code"
            type="text"
            aria-describedby={
              state.fieldErrors.code === undefined ? undefined : "code-error"
            }
            aria-invalid={
              state.fieldErrors.code === undefined ? undefined : true
            }
            autoComplete="one-time-code"
            autoFocus
            className="h-12 w-full rounded-none border-0 border-b border-[#d8d2c7] bg-transparent px-0 font-mono text-base tracking-[0.35em] outline-none transition placeholder:tracking-normal placeholder:text-[#a8a094] focus:border-[#15130f] focus:ring-0"
            disabled={isPending}
            inputMode="numeric"
            maxLength={6}
            minLength={6}
            pattern="[0-9]{6}"
            placeholder="000000"
            required
          />
          {state.fieldErrors.code === undefined ? null : (
            <p id="code-error" role="alert" className="text-sm text-red-700">
              {state.fieldErrors.code}
            </p>
          )}
        </div>

        <p className="text-sm text-[#68635a]">
          We sent a 6-digit code to{" "}
          <span className="font-medium text-[#15130f]">{state.email}</span>.
        </p>

        <div className="space-y-3">
          <SubmitButton label="Sign in" pendingLabel="Signing in..." />
          <a
            className="block w-full text-center text-sm text-[#68635a] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#15130f]"
            href="/sign-in"
          >
            Use a different email
          </a>
        </div>
      </form>
    );
  }

  return (
    <form action={formAction} aria-busy={isPending} className="mt-10 space-y-5">
      <input name="intent" type="hidden" value="request-code" />

      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          aria-describedby={
            state.fieldErrors.email === undefined ? undefined : "email-error"
          }
          aria-invalid={
            state.fieldErrors.email === undefined ? undefined : true
          }
          autoComplete="email"
          className="h-12 w-full rounded-none border-0 border-b border-[#d8d2c7] bg-transparent px-0 text-base outline-none transition placeholder:text-[#a8a094] focus:border-[#15130f] focus:ring-0"
          defaultValue={state.email}
          disabled={isPending}
          maxLength={254}
          placeholder="you@example.com"
          required
        />
        {state.fieldErrors.email === undefined ? null : (
          <p id="email-error" role="alert" className="text-sm text-red-700">
            {state.fieldErrors.email}
          </p>
        )}
      </div>

      <SubmitButton label="Send sign-in code" pendingLabel="Sending code..." />
    </form>
  );
}

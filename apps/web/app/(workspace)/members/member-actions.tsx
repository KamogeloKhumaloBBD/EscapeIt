"use client";

import { PaperPlaneTiltIcon, TrashIcon } from "@phosphor-icons/react";
import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

import {
  initialInviteMemberState,
  initialRevokeInvitationState,
} from "@/app/(workspace)/members/action-state";
import {
  inviteMemberAction,
  revokeInvitationAction,
} from "@/app/(workspace)/members/actions";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

function InviteSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending} type="submit">
      {pending ? <Spinner aria-hidden="true" /> : <PaperPlaneTiltIcon />}
      {pending ? "Sending…" : "Send invitation"}
    </Button>
  );
}

export function InviteMemberForm() {
  const [state, formAction, pending] = useActionState(
    inviteMemberAction,
    initialInviteMemberState,
  );
  const formReference = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") {
      formReference.current?.reset();
      toast.success("Invitation sent", {
        description: state.message,
      });
    } else if (state.status === "error" && state.message !== null) {
      toast.error(state.message);
    }
  }, [state]);

  return (
    <form
      ref={formReference}
      action={formAction}
      aria-busy={pending}
      className="flex flex-col gap-4 sm:flex-row sm:items-end justify-items-center"
    >
      <Field className="flex-1" data-invalid={state.fieldError !== undefined}>
        <FieldLabel htmlFor="invitation-email">Email address</FieldLabel>
        <Input
          aria-describedby={
            state.fieldError === undefined
              ? "invitation-email-description"
              : "invitation-email-error"
          }
          aria-invalid={state.fieldError === undefined ? undefined : true}
          autoComplete="email"
          defaultValue={state.email}
          disabled={pending}
          id="invitation-email"
          maxLength={320}
          name="email"
          placeholder="teammate@example.com"
          required
          type="email"
        />
      </Field>
      <InviteSubmitButton />
    </form>
  );
}

function RevokeSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending} type="submit" variant="destructive">
      {pending ? <Spinner aria-hidden="true" /> : <TrashIcon />}
      {pending ? "Revoking…" : "Revoke invitation"}
    </Button>
  );
}

export function RevokeInvitationButton({
  email,
  invitationId,
}: {
  email: string;
  invitationId: string;
}) {
  const [state, formAction] = useActionState(
    revokeInvitationAction,
    initialRevokeInvitationState,
  );

  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message ?? "Invitation revoked.");
    } else if (state.status === "error" && state.message !== null) {
      toast.error(state.message);
    }
  }, [state]);

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="destructive">
          Revoke
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke this invitation?</AlertDialogTitle>
          <AlertDialogDescription>
            The invitation sent to {email} will stop working immediately.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep invitation</AlertDialogCancel>
          <form action={formAction}>
            <input name="invitationId" type="hidden" value={invitationId} />
            <RevokeSubmitButton />
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

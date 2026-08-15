"use client";

import { EnvelopeSimpleIcon } from "@phosphor-icons/react";
import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

import { initialSendDigestState } from "@/app/(workspace)/dashboard/action-state";
import { sendDigestNowAction } from "@/app/(workspace)/dashboard/actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending} type="submit">
      {pending ? <Spinner aria-hidden="true" /> : null}
      {pending ? "Sending" : "Send now"}
    </Button>
  );
}

/**
 * Behind a confirmation because it emails every member who has not opted out,
 * and there is no way to recall it once sent.
 */
export function SendDigestButton() {
  const [state, formAction] = useActionState(
    sendDigestNowAction,
    initialSendDigestState,
  );

  useEffect(() => {
    if (state.status === "success" && state.message !== null) {
      toast.success(state.message, {
        description:
          "Members may need to check their spam or junk folder if the digest doesn’t arrive.",
      });
    } else if (state.status === "error" && state.message !== null) {
      toast.error(state.message);
    }
  }, [state]);

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="secondary">
          <EnvelopeSimpleIcon aria-hidden="true" />
          Send digest
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Send today&apos;s digest now?</AlertDialogTitle>
          <AlertDialogDescription>
            Every member who hasn&apos;t turned the digest off will be emailed a
            summary of the last 24 hours. This sends it early rather than
            changing who receives it. Members may need to check their spam or
            junk folder if the digest doesn&apos;t arrive.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <form action={formAction}>
            <AlertDialogAction asChild>
              <SubmitButton />
            </AlertDialogAction>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

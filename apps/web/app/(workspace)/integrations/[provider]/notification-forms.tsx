"use client";

import { TrashIcon, WarningIcon } from "@phosphor-icons/react";
import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

import { initialNotificationActionState } from "@/app/(workspace)/integrations/[provider]/notification-action-state";
import { notificationAction } from "@/app/(workspace)/integrations/[provider]/notification-actions";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";

function useActionToast(state: typeof initialNotificationActionState) {
  useEffect(() => {
    if (state.status === "success" && state.message !== null) {
      toast.success(state.message);
    } else if (state.status === "error" && state.message !== null) {
      toast.error(state.message);
    }
  }, [state]);
}

function SubmitButton({
  children,
  pendingLabel,
  variant = "outline",
}: {
  children: React.ReactNode;
  pendingLabel: string;
  variant?: "default" | "destructive" | "ghost" | "outline";
}) {
  const { pending } = useFormStatus();
  return (
    <Button disabled={pending} size="sm" type="submit" variant={variant}>
      {pending ? <Spinner data-icon="inline-start" /> : null}
      {pending ? pendingLabel : children}
    </Button>
  );
}

export function TestChannelButton({ channelId }: { channelId: string }) {
  const [state, formAction] = useActionState(
    notificationAction,
    initialNotificationActionState,
  );
  useActionToast(state);

  return (
    <form action={formAction}>
      <input name="intent" type="hidden" value="test-channel" />
      <input name="channelId" type="hidden" value={channelId} />
      <SubmitButton pendingLabel="Sending...">Send test message</SubmitButton>
    </form>
  );
}

export function DeleteChannelButton({
  channelId,
  channelName,
}: {
  channelId: string;
  channelName: string;
}) {
  const [state, formAction] = useActionState(
    notificationAction,
    initialNotificationActionState,
  );
  useActionToast(state);

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          aria-label={`Remove ${channelName}`}
          size="icon-sm"
          variant="ghost"
        >
          <TrashIcon aria-hidden="true" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <form action={formAction}>
          <input name="intent" type="hidden" value="delete-channel" />
          <input name="channelId" type="hidden" value={channelId} />
          <AlertDialogHeader>
            <AlertDialogMedia>
              <WarningIcon aria-hidden="true" />
            </AlertDialogMedia>
            <AlertDialogTitle>
              Remove &quot;{channelName}&quot;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Context Layer will stop sending notifications to this Teams
              channel. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-6">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <SubmitButton pendingLabel="Removing..." variant="destructive">
              Remove channel
            </SubmitButton>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function PreferenceToggle({
  enabled,
  eventKey,
}: {
  enabled: boolean;
  eventKey: string;
}) {
  const [state, formAction, isPending] = useActionState(
    notificationAction,
    initialNotificationActionState,
  );
  useActionToast(state);

  return (
    <Switch
      aria-label={`Toggle ${eventKey}`}
      checked={enabled}
      disabled={isPending}
      onCheckedChange={(checked) => {
        const formData = new FormData();
        formData.set("intent", "set-preference");
        formData.set("eventKey", eventKey);
        formData.set("enabled", String(checked));
        formAction(formData);
      }}
    />
  );
}

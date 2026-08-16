"use client";

import { TrashIcon, WarningIcon } from "@phosphor-icons/react";
import {
  useActionState,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
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
import {
  Item,
  ItemActions,
  ItemContent,
  ItemTitle,
} from "@/components/ui/item";
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
      <SubmitButton pendingLabel="Sending…">Send test message</SubmitButton>
    </form>
  );
}

export function DeleteChannelButton({
  channelId,
  channelName,
  providerDisplayName,
}: {
  channelId: string;
  channelName: string;
  providerDisplayName: string;
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
              Context Layer will stop sending notifications to this{" "}
              {providerDisplayName} channel. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-6">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <SubmitButton pendingLabel="Removing…" variant="destructive">
              Remove channel
            </SubmitButton>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function ChannelSourceSelector({
  channelId,
  currentSources,
  disabled,
  options,
}: {
  channelId: string;
  currentSources: readonly string[];
  disabled?: boolean;
  options: readonly { displayName: string; provider: string }[];
}) {
  const serverSources = useMemo(
    () => new Set(currentSources),
    [currentSources],
  );
  const [sources, setSources] = useState(serverSources);
  const [isPending, startTransition] = useTransition();

  function saveSources(next: ReadonlySet<string>) {
    const previous = new Set(sources);
    const formData = new FormData();
    formData.set("intent", "set-channel-sources");
    formData.set("channelId", channelId);
    next.forEach((source) => {
      formData.append("providers", source);
    });

    setSources(new Set(next));
    startTransition(async () => {
      const result = await notificationAction(
        initialNotificationActionState,
        formData,
      );

      if (result.status === "error") {
        setSources(previous);
        if (result.message !== null) toast.error(result.message);
      } else if (result.message !== null) {
        toast.success(result.message);
      }
    });
  }

  return (
    <div aria-busy={isPending} className="mt-3 divide-y divide-border">
      {options.map((option) => (
        <Item className="px-0" key={option.provider}>
          <ItemContent>
            <ItemTitle>{option.displayName}</ItemTitle>
          </ItemContent>
          <ItemActions>
            <Switch
              aria-label={`Toggle ${option.displayName} notifications`}
              checked={sources.has(option.provider)}
              disabled={disabled === true || isPending}
              onCheckedChange={(checked) => {
                const next = new Set(sources);
                if (checked) {
                  next.add(option.provider);
                } else {
                  next.delete(option.provider);
                }
                saveSources(next);
              }}
            />
          </ItemActions>
        </Item>
      ))}
    </div>
  );
}

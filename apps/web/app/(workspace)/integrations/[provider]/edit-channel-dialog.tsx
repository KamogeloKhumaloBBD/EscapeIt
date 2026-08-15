"use client";

import { PencilSimpleIcon } from "@phosphor-icons/react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { updateChannelAction } from "@/app/(workspace)/integrations/[provider]/notification-actions";
import { initialNotificationActionState } from "@/app/(workspace)/integrations/[provider]/notification-action-state";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

export function EditChannelDialog({
  channelId,
  channelName,
}: {
  channelId: string;
  channelName: string;
}) {
  const [open, setOpen] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await updateChannelAction(
        initialNotificationActionState,
        formData,
      );

      if (result.status === "success") {
        toast.success(result.message);
        setFieldError(null);
        formRef.current?.reset();
        setOpen(false);
        return;
      }

      setFieldError(result.message);
      toast.error(result.message);
    });
  }

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setFieldError(null);
      }}
      open={open}
    >
      <DialogTrigger asChild>
        <Button
          aria-label={`Update ${channelName}`}
          size="icon-sm"
          variant="ghost"
        >
          <PencilSimpleIcon aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Update notification channel</DialogTitle>
          <DialogDescription>
            Enter a current Teams workflow webhook URL. A test message is sent
            before the saved connection is replaced.
          </DialogDescription>
        </DialogHeader>

        <form action={handleSubmit} className="space-y-5" ref={formRef}>
          <input name="channelId" type="hidden" value={channelId} />
          <FieldGroup>
            <Field data-invalid={fieldError !== null}>
              <FieldLabel htmlFor={`channel-name-${channelId}`}>
                Channel name
              </FieldLabel>
              <FieldContent>
                <Input
                  defaultValue={channelName}
                  id={`channel-name-${channelId}`}
                  maxLength={120}
                  name="name"
                  required
                />
              </FieldContent>
            </Field>

            <Field data-invalid={fieldError !== null}>
              <FieldLabel htmlFor={`channel-webhook-url-${channelId}`}>
                Replacement workflow webhook URL
              </FieldLabel>
              <FieldContent>
                <Input
                  autoComplete="off"
                  id={`channel-webhook-url-${channelId}`}
                  name="webhookUrl"
                  placeholder="https://prod-00.westus.logic.azure.com/workflows/..."
                  required
                  type="url"
                />
                <FieldDescription>
                  Stored webhook URLs are never displayed. Paste the complete
                  replacement URL.
                </FieldDescription>
                {fieldError === null ? null : (
                  <FieldError>{fieldError}</FieldError>
                )}
              </FieldContent>
            </Field>
          </FieldGroup>

          <DialogFooter>
            <Button
              disabled={isPending}
              onClick={() => {
                setOpen(false);
              }}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={isPending} type="submit">
              {isPending ? <Spinner data-icon="inline-start" /> : null}
              {isPending ? "Testing…" : "Test and update"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

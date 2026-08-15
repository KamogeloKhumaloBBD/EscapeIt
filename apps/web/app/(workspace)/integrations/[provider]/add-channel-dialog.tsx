"use client";

import { PlusIcon } from "@phosphor-icons/react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { createChannelAction } from "@/app/(workspace)/integrations/[provider]/notification-actions";
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

export function AddChannelDialog({
  providerDisplayName,
}: {
  providerDisplayName: string;
}) {
  const [open, setOpen] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await createChannelAction(
        initialNotificationActionState,
        formData,
      );

      if (result.status === "success") {
        toast.success(
          result.message ?? `The ${providerDisplayName} channel was connected.`,
        );
        setFieldError(null);
        formRef.current?.reset();
        setOpen(false);
        return;
      }

      setFieldError(result.message);
      toast.error(result.message ?? "We couldn't add the channel.");
    });
  }

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setFieldError(null);
        }
      }}
      open={open}
    >
      <DialogTrigger asChild>
        <Button>
          <PlusIcon aria-hidden="true" data-icon="inline-start" />
          Add channel
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Connect a {providerDisplayName} channel</DialogTitle>
          <DialogDescription>
            In Teams, open the target channel&apos;s &ldquo;&hellip;&rdquo;
            menu, choose Workflows, and create an &ldquo;incoming webhook&rdquo;
            workflow. Paste the generated URL below.
          </DialogDescription>
        </DialogHeader>

        <form action={handleSubmit} className="space-y-5" ref={formRef}>
          <FieldGroup>
            <Field data-invalid={fieldError !== null}>
              <FieldLabel htmlFor="channel-name">Channel name</FieldLabel>
              <FieldContent>
                <Input
                  id="channel-name"
                  maxLength={120}
                  name="name"
                  placeholder="Engineering alerts"
                  required
                />
              </FieldContent>
            </Field>

            <Field data-invalid={fieldError !== null}>
              <FieldLabel htmlFor="channel-webhook-url">
                Workflow webhook URL
              </FieldLabel>
              <FieldContent>
                <Input
                  id="channel-webhook-url"
                  name="webhookUrl"
                  placeholder="https://prod-00.westus.logic.azure.com/workflows/..."
                  required
                  type="url"
                />
                <FieldDescription>
                  Must be an HTTPS URL. A test message is sent immediately to
                  confirm it works.
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
              {isPending ? "Connecting…" : "Connect channel"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { PlugsConnectedIcon, WarningIcon } from "@phosphor-icons/react";
import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

import { initialIntegrationActionState } from "@/app/(workspace)/integrations/[provider]/action-state";
import { integrationAction } from "@/app/(workspace)/integrations/[provider]/actions";
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
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import type { IntegrationResource } from "@/lib/validation/integration";

function SubmitButton({
  children,
  pendingLabel,
  variant = "default",
}: {
  children: React.ReactNode;
  pendingLabel: string;
  variant?: "default" | "destructive" | "outline";
}) {
  const { pending } = useFormStatus();
  return (
    <Button disabled={pending} type="submit" variant={variant}>
      {pending ? <Spinner data-icon="inline-start" /> : null}
      {pending ? pendingLabel : children}
    </Button>
  );
}

function DialogSubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button disabled={pending} type="submit" variant="destructive">
      {pending ? <Spinner data-icon="inline-start" /> : null}
      {pending ? "Disconnecting..." : label}
    </Button>
  );
}

function useActionToast(state: typeof initialIntegrationActionState) {
  useEffect(() => {
    if (state.status === "success" && state.message !== null) {
      toast.success(state.message);
    } else if (state.status === "error" && state.message !== null) {
      toast.error(state.message);
    }
  }, [state]);
}

function DisconnectAccount({ provider }: { provider: string }) {
  const [state, formAction] = useActionState(
    integrationAction,
    initialIntegrationActionState,
  );
  useActionToast(state);

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive">Disconnect my account</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <form action={formAction}>
          <input name="intent" type="hidden" value="disconnect-account" />
          <input name="provider" type="hidden" value={provider} />
          <AlertDialogHeader>
            <AlertDialogMedia>
              <WarningIcon aria-hidden="true" />
            </AlertDialogMedia>
            <AlertDialogTitle>
              Disconnect your Atlassian account?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Jira requests will stop using your identity. Workspace
              configuration and other members remain unchanged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-6">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <DialogSubmitButton label="Disconnect account" />
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function SimpleIntegrationAction({
  intent,
  label,
  pendingLabel,
  provider,
  variant = "outline",
}: {
  intent: "disconnect-account" | "validate";
  label: string;
  pendingLabel: string;
  provider: string;
  variant?: "default" | "destructive" | "outline";
}) {
  const [state, formAction] = useActionState(
    integrationAction,
    initialIntegrationActionState,
  );
  useActionToast(state);

  if (intent === "disconnect-account") {
    return <DisconnectAccount provider={provider} />;
  }

  return (
    <form action={formAction}>
      <input name="intent" type="hidden" value={intent} />
      <input name="provider" type="hidden" value={provider} />
      <SubmitButton pendingLabel={pendingLabel} variant={variant}>
        {label}
      </SubmitButton>
    </form>
  );
}

export function DisconnectInstallation({ provider }: { provider: string }) {
  const [state, formAction] = useActionState(
    integrationAction,
    initialIntegrationActionState,
  );
  useActionToast(state);

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive">Disconnect Jira</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <form action={formAction}>
          <input name="intent" type="hidden" value="disconnect-installation" />
          <input name="provider" type="hidden" value={provider} />
          <AlertDialogHeader>
            <AlertDialogMedia>
              <PlugsConnectedIcon aria-hidden="true" />
            </AlertDialogMedia>
            <AlertDialogTitle>
              Disconnect Jira from this workspace?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This clears every member&apos;s Jira credentials and the selected
              project allowlist. Activity history is retained.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-6">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <DialogSubmitButton label="Disconnect Jira" />
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function SiteSelector({
  provider,
  resources,
}: {
  provider: string;
  resources: readonly IntegrationResource[];
}) {
  const [state, formAction] = useActionState(
    integrationAction,
    initialIntegrationActionState,
  );
  useActionToast(state);
  const defaultResource = resources.at(0);

  if (defaultResource === undefined) {
    return null;
  }

  return (
    <form action={formAction} className="space-y-6">
      <input name="intent" type="hidden" value="select-site" />
      <input name="provider" type="hidden" value={provider} />
      <FieldSet>
        <FieldLegend>Select Jira site</FieldLegend>
        <RadioGroup
          defaultValue={defaultResource.externalId}
          name="externalId"
          required
        >
          {resources.map((resource) => (
            <Field key={resource.externalId} orientation="horizontal">
              <RadioGroupItem
                id={`site-${resource.externalId}`}
                value={resource.externalId}
              />
              <FieldContent>
                <FieldLabel htmlFor={`site-${resource.externalId}`}>
                  <FieldTitle>{resource.name}</FieldTitle>
                </FieldLabel>
                <FieldDescription>{resource.url}</FieldDescription>
              </FieldContent>
            </Field>
          ))}
        </RadioGroup>
      </FieldSet>
      <SubmitButton pendingLabel="Saving site...">
        Use selected site
      </SubmitButton>
    </form>
  );
}

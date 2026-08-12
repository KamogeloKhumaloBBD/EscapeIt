"use client";

import { PlugsConnectedIcon, WarningIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import type {
  IntegrationDetail,
  IntegrationMcpTool,
  IntegrationResource,
} from "@/lib/validation/integration";

type IntegrationPresentation = IntegrationDetail["presentation"];

function SubmitButton({
  children,
  disabled = false,
  pendingLabel,
  variant = "default",
}: {
  children: React.ReactNode;
  disabled?: boolean;
  pendingLabel: string;
  variant?: "default" | "destructive" | "outline";
}) {
  const { pending } = useFormStatus();
  return (
    <Button disabled={disabled || pending} type="submit" variant={variant}>
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

function useCloseDialogOnSuccess(
  state: typeof initialIntegrationActionState,
  setOpen: React.Dispatch<React.SetStateAction<boolean>>,
) {
  useEffect(() => {
    if (state.status === "success") {
      setOpen(false);
    }
  }, [setOpen, state.status]);
}

function DisconnectAccount({
  accountLabel,
  provider,
  providerDisplayName,
}: {
  accountLabel: string;
  provider: string;
  providerDisplayName: string;
}) {
  const [state, formAction] = useActionState(
    integrationAction,
    initialIntegrationActionState,
  );
  const [open, setOpen] = useState(false);
  useActionToast(state);
  useCloseDialogOnSuccess(state, setOpen);

  return (
    <AlertDialog onOpenChange={setOpen} open={open}>
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
            <AlertDialogTitle>Disconnect your {accountLabel}?</AlertDialogTitle>
            <AlertDialogDescription>
              {providerDisplayName} requests will stop using your identity.
              Workspace configuration and other members remain unchanged.
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

type SimpleIntegrationActionProps = {
  label: string;
  pendingLabel: string;
  provider: string;
  variant?: "default" | "destructive" | "outline";
} & (
  | {
      accountLabel: string;
      intent: "disconnect-account";
      providerDisplayName: string;
    }
  | { intent: "validate" }
);

export function SimpleIntegrationAction(props: SimpleIntegrationActionProps) {
  const { intent, label, pendingLabel, provider, variant = "outline" } = props;
  const [state, formAction] = useActionState(
    integrationAction,
    initialIntegrationActionState,
  );
  useActionToast(state);

  if (intent === "disconnect-account") {
    return (
      <DisconnectAccount
        accountLabel={props.accountLabel}
        provider={provider}
        providerDisplayName={props.providerDisplayName}
      />
    );
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

export function DisconnectInstallation({
  presentation,
  provider,
  providerDisplayName,
}: {
  presentation: IntegrationPresentation;
  provider: string;
  providerDisplayName: string;
}) {
  const [state, formAction] = useActionState(
    integrationAction,
    initialIntegrationActionState,
  );
  const [open, setOpen] = useState(false);
  useActionToast(state);
  useCloseDialogOnSuccess(state, setOpen);

  return (
    <AlertDialog onOpenChange={setOpen} open={open}>
      <AlertDialogTrigger asChild>
        <Button variant="destructive">Disconnect {providerDisplayName}</Button>
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
              Disconnect {providerDisplayName} from this workspace?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This clears every member&apos;s connected account credentials
              {presentation.scopeLabels === undefined
                ? ""
                : ` and the selected ${presentation.scopeLabels.singular} allowlist`}
              {". "}MCP tool choices and activity history are retained.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-6">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <DialogSubmitButton label={`Disconnect ${providerDisplayName}`} />
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function ResourceSelector({
  provider,
  resourceLabel,
  resources,
}: {
  provider: string;
  resourceLabel: string;
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
      <input name="intent" type="hidden" value="select-resource" />
      <input name="provider" type="hidden" value={provider} />
      <FieldSet>
        <FieldLegend>Select {resourceLabel}</FieldLegend>
        <RadioGroup
          defaultValue={defaultResource.externalId}
          name="externalId"
          required
        >
          {resources.map((resource) => (
            <Field key={resource.externalId} orientation="horizontal">
              <RadioGroupItem
                id={`resource-${resource.externalId}`}
                value={resource.externalId}
              />
              <FieldContent>
                <FieldLabel htmlFor={`resource-${resource.externalId}`}>
                  <FieldTitle>{resource.name}</FieldTitle>
                </FieldLabel>
                <FieldDescription>{resource.url}</FieldDescription>
              </FieldContent>
            </Field>
          ))}
        </RadioGroup>
      </FieldSet>
      <SubmitButton pendingLabel="Saving resource...">
        Use selected {resourceLabel}
      </SubmitButton>
    </form>
  );
}

export function McpToolSelector({
  disabled = false,
  provider,
  tools,
}: {
  accountLabel: string | undefined;
  disabled?: boolean;
  provider: string;
  providerDisplayName: string;
  tools: readonly IntegrationMcpTool[];
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(
    integrationAction,
    initialIntegrationActionState,
  );
  const [selected, setSelected] = useState(
    () =>
      new Set(tools.filter((tool) => tool.enabled).map((tool) => tool.name)),
  );
  const allSelected = tools.length > 0 && selected.size === tools.length;
  const noneSelected = selected.size === 0;
  useActionToast(state);

  useEffect(() => {
    if (state.status === "success") {
      router.refresh();
    }
  }, [router, state.status]);

  return (
    <form action={formAction} className="space-y-6">
      <input name="intent" type="hidden" value="save-mcp-tools" />
      <input name="provider" type="hidden" value={provider} />
      {[...selected].map((name) => (
        <input key={name} name="toolNames" type="hidden" value={name} />
      ))}
      <FieldSet disabled={disabled}>
        <FieldLegend>Available MCP tools</FieldLegend>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {selected.size} of {tools.length} selected
          </p>
          <div className="flex gap-2">
            <Button
              disabled={disabled || allSelected}
              onClick={() => {
                setSelected(new Set(tools.map((tool) => tool.name)));
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              Select all
            </Button>
            <Button
              disabled={disabled || noneSelected}
              onClick={() => {
                setSelected(new Set());
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              Unselect all
            </Button>
          </div>
        </div>
        <div className="divide-y divide-border border-y border-border">
          {tools.map((tool) => {
            const checked = selected.has(tool.name);
            const id = `mcp-tool-${tool.name}`;

            return (
              <Field className="py-4" key={tool.name} orientation="horizontal">
                <Checkbox
                  checked={checked}
                  disabled={disabled}
                  id={id}
                  onCheckedChange={(nextChecked) => {
                    setSelected((current) => {
                      const next = new Set(current);

                      if (nextChecked === true) {
                        next.add(tool.name);
                      } else {
                        next.delete(tool.name);
                      }

                      return next;
                    });
                  }}
                />
                <FieldContent>
                  <FieldLabel htmlFor={id}>
                    <FieldTitle>
                      {tool.displayName}
                      <Badge variant={"secondary"}>{tool.kind}</Badge>
                    </FieldTitle>
                  </FieldLabel>
                  <FieldDescription>{tool.description}</FieldDescription>
                </FieldContent>
              </Field>
            );
          })}
        </div>
      </FieldSet>
      <SubmitButton disabled={disabled} pendingLabel="Saving tools...">
        Save MCP tools
      </SubmitButton>
    </form>
  );
}

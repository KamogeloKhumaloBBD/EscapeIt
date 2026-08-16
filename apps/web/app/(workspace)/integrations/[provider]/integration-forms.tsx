"use client";

import { PlugsConnectedIcon, WarningIcon } from "@phosphor-icons/react";
import {
  useActionState,
  useEffect,
  useMemo,
  useOptimistic,
  useState,
  useTransition,
} from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

import { initialIntegrationActionState } from "@/app/(workspace)/integrations/[provider]/action-state";
import { integrationAction } from "@/app/(workspace)/integrations/[provider]/actions";
import {
  matchesToolFilter,
  ToolSelectorFilters,
  type ToolKindFilter,
} from "@/components/integrations/tool-selector-filters";
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
  IntegrationNotificationEvent,
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
      {pending ? "Disconnecting…" : label}
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
  const [selectedResource, setOptimisticResource] = useOptimistic<
    string | null,
    string
  >(null, (_current, next) => next);
  const [pending, startTransition] = useTransition();
  useActionToast(state);

  if (resources.length === 0) {
    return null;
  }

  function saveResource(externalId: string) {
    const formData = new FormData();
    formData.set("intent", "select-resource");
    formData.set("provider", provider);
    formData.set("externalId", externalId);

    startTransition(() => {
      setOptimisticResource(externalId);
      formAction(formData);
    });
  }

  return (
    <div aria-busy={pending} className="space-y-6">
      <FieldSet>
        <FieldLegend>Select {resourceLabel}</FieldLegend>
        <RadioGroup
          disabled={pending}
          onValueChange={saveResource}
          value={selectedResource ?? ""}
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
    </div>
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
  const serverSelected = useMemo(
    () =>
      new Set(tools.filter((tool) => tool.enabled).map((tool) => tool.name)),
    [tools],
  );
  const [selected, setSelected] = useState(serverSelected);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<ToolKindFilter>("all");
  const [pending, startTransition] = useTransition();
  const visibleTools = useMemo(
    () =>
      tools.filter((tool) =>
        matchesToolFilter(
          {
            description: tool.description,
            kind: tool.kind,
            searchableNames: [tool.displayName, tool.name],
          },
          query,
          kindFilter,
        ),
      ),
    [kindFilter, query, tools],
  );
  const visibleSelectedCount = visibleTools.filter((tool) =>
    selected.has(tool.name),
  ).length;
  const allVisibleSelected =
    visibleTools.length > 0 && visibleSelectedCount === visibleTools.length;
  const noneVisibleSelected = visibleSelectedCount === 0;

  function saveTools(next: ReadonlySet<string>) {
    const previous = new Set(selected);
    const formData = new FormData();
    formData.set("intent", "save-mcp-tools");
    formData.set("provider", provider);
    next.forEach((name) => {
      formData.append("toolNames", name);
    });

    setSelected(new Set(next));
    startTransition(async () => {
      const result = await integrationAction(
        initialIntegrationActionState,
        formData,
      );

      if (result.status === "error") {
        setSelected(previous);
        if (result.message !== null) toast.error(result.message);
      } else if (result.message !== null) {
        toast.success(result.message);
      }
    });
  }

  return (
    <div aria-busy={pending} className="space-y-6">
      <FieldSet disabled={disabled || pending}>
        <FieldLegend>Available MCP tools</FieldLegend>
        <ToolSelectorFilters
          disabled={disabled || pending}
          kindFilter={kindFilter}
          onKindFilterChange={setKindFilter}
          onQueryChange={setQuery}
          query={query}
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {selected.size} of {tools.length} selected · {visibleTools.length}{" "}
            shown
          </p>
          <div className="flex gap-2">
            <Button
              disabled={
                disabled ||
                pending ||
                allVisibleSelected ||
                visibleTools.length === 0
              }
              onClick={() => {
                const next = new Set(selected);
                visibleTools.forEach((tool) => next.add(tool.name));
                saveTools(next);
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              Select all
            </Button>
            <Button
              disabled={disabled || pending || noneVisibleSelected}
              onClick={() => {
                const next = new Set(selected);
                visibleTools.forEach((tool) => next.delete(tool.name));
                saveTools(next);
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
          {visibleTools.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              No MCP tools match these filters.
            </p>
          ) : null}
          {visibleTools.map((tool) => {
            const checked = selected.has(tool.name);
            const id = `mcp-tool-${tool.name}`;

            return (
              <Field className="py-4" key={tool.name} orientation="horizontal">
                <Checkbox
                  checked={checked}
                  disabled={disabled || pending}
                  id={id}
                  onCheckedChange={(nextChecked) => {
                    const next = new Set(selected);

                    if (nextChecked === true) {
                      next.add(tool.name);
                    } else {
                      next.delete(tool.name);
                    }

                    saveTools(next);
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
    </div>
  );
}

export function NotificationEventsChecklist({
  disabled = false,
  events,
  provider,
}: {
  disabled?: boolean;
  events: readonly IntegrationNotificationEvent[];
  provider: string;
}) {
  const serverEnabled = useMemo(
    () =>
      new Set(
        events.filter((event) => event.enabled).map((event) => event.key),
      ),
    [events],
  );
  const [enabledKeys, setEnabledKeys] = useState(serverEnabled);
  const [isPending, startTransition] = useTransition();

  function saveEvents(next: ReadonlySet<string>) {
    const previous = new Set(enabledKeys);
    const formData = new FormData();
    formData.set("intent", "set-notification-event-keys");
    formData.set("provider", provider);
    next.forEach((key) => {
      formData.append("eventKeys", key);
    });

    setEnabledKeys(new Set(next));
    startTransition(async () => {
      const result = await integrationAction(
        initialIntegrationActionState,
        formData,
      );

      if (result.status === "error") {
        setEnabledKeys(previous);
        if (result.message !== null) toast.error(result.message);
      } else if (result.message !== null) {
        toast.success(result.message);
      }
    });
  }

  return (
    <div className="divide-y divide-border border-y border-border">
      {events.map((event) => {
        const id = `notification-event-${event.key}`;

        return (
          <Field className="py-4" key={event.key} orientation="horizontal">
            <Checkbox
              checked={enabledKeys.has(event.key)}
              disabled={disabled || isPending}
              id={id}
              onCheckedChange={(checked) => {
                const next = new Set(enabledKeys);
                if (checked === true) {
                  next.add(event.key);
                } else {
                  next.delete(event.key);
                }
                saveEvents(next);
              }}
            />
            <FieldContent>
              <FieldLabel htmlFor={id}>
                <FieldTitle>{event.displayName}</FieldTitle>
              </FieldLabel>
            </FieldContent>
          </Field>
        );
      })}
    </div>
  );
}

"use client";

import { WarningIcon } from "@phosphor-icons/react";
import {
  useActionState,
  useEffect,
  useMemo,
  useOptimistic,
  useTransition,
} from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

import { initialCustomMcpActionState } from "../action-state";
import { customMcpAction } from "../actions";
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
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { CustomMcpTool } from "@/lib/validation/custom-mcp";

type MutationIntent = "archive" | "disconnect" | "refresh" | "validate";

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

function useFeedback() {
  const result = useActionState(customMcpAction, initialCustomMcpActionState);
  const state = result[0];
  useEffect(() => {
    if (state.status === "success" && state.message !== null)
      toast.success(state.message);
    if (state.status === "error" && state.message !== null)
      toast.error(state.message);
  }, [state]);
  return result;
}

export function BearerForm({
  secondary = false,
  serverId,
}: {
  secondary?: boolean;
  serverId: string;
}) {
  const [state, action] = useFeedback();
  return (
    <form action={action} className="space-y-4">
      <input name="intent" type="hidden" value="connect-bearer" />
      <input name="serverId" type="hidden" value={serverId} />
      <Field data-invalid={state.fieldErrors?.token !== undefined}>
        <FieldLabel htmlFor={`custom-mcp-token-${serverId}`}>
          {secondary ? "Personal bearer token" : "Bearer token"}
        </FieldLabel>
        <Input
          aria-describedby={`custom-mcp-token-description-${serverId}`}
          autoComplete="off"
          id={`custom-mcp-token-${serverId}`}
          name="token"
          placeholder="Paste your personal token"
          required
          type="password"
        />
        {state.fieldErrors?.token === undefined ? (
          <FieldDescription id={`custom-mcp-token-description-${serverId}`}>
            The token is encrypted for your membership and is never shared with
            the workspace owner.
          </FieldDescription>
        ) : (
          <p className="text-xs text-destructive" role="alert">
            {state.fieldErrors.token}
          </p>
        )}
      </Field>
      <SubmitButton pendingLabel="Connecting…">Connect token</SubmitButton>
    </form>
  );
}

export function SimpleMutationForm({
  intent,
  label,
  pendingLabel,
  serverId,
  variant = "outline",
}: {
  intent: Exclude<MutationIntent, "archive" | "disconnect">;
  label: string;
  pendingLabel: string;
  serverId: string;
  variant?: "default" | "destructive" | "outline";
}) {
  const [, action] = useFeedback();
  return (
    <form action={action}>
      <input name="intent" type="hidden" value={intent} />
      <input name="serverId" type="hidden" value={serverId} />
      <SubmitButton pendingLabel={pendingLabel} variant={variant}>
        {label}
      </SubmitButton>
    </form>
  );
}

export function RenameForm({
  name,
  serverId,
}: {
  name: string;
  serverId: string;
}) {
  const [state, action] = useFeedback();
  return (
    <form action={action} className="space-y-4">
      <input name="intent" type="hidden" value="rename" />
      <input name="serverId" type="hidden" value={serverId} />
      <Field data-invalid={state.fieldErrors?.name !== undefined}>
        <FieldLabel htmlFor={`custom-mcp-rename-${serverId}`}>
          Server name
        </FieldLabel>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            defaultValue={name}
            id={`custom-mcp-rename-${serverId}`}
            maxLength={120}
            name="name"
            required
          />
          <SubmitButton pendingLabel="Renaming…">Rename</SubmitButton>
        </div>
        {state.fieldErrors?.name === undefined ? null : (
          <p className="text-xs text-destructive" role="alert">
            {state.fieldErrors.name}
          </p>
        )}
      </Field>
    </form>
  );
}

function DestructiveMutationDialog({
  description,
  intent,
  label,
  pendingLabel,
  serverId,
  title,
}: {
  description: string;
  intent: "archive" | "disconnect";
  label: string;
  pendingLabel: string;
  serverId: string;
  title: string;
}) {
  const [, action] = useFeedback();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive">{label}</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <form action={action}>
          <input name="intent" type="hidden" value={intent} />
          <input name="serverId" type="hidden" value={serverId} />
          <AlertDialogHeader>
            <AlertDialogMedia>
              <WarningIcon aria-hidden="true" />
            </AlertDialogMedia>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-6">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <SubmitButton pendingLabel={pendingLabel} variant="destructive">
              {label}
            </SubmitButton>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function DisconnectAccountDialog({ serverId }: { serverId: string }) {
  return (
    <DestructiveMutationDialog
      description="This server will stop using your upstream identity. Workspace configuration and other members remain unchanged."
      intent="disconnect"
      label="Disconnect my account"
      pendingLabel="Disconnecting…"
      serverId={serverId}
      title="Disconnect your Custom MCP account?"
    />
  );
}

export function ArchiveServerDialog({
  name,
  serverId,
}: {
  name: string;
  serverId: string;
}) {
  return (
    <DestructiveMutationDialog
      description="Archiving immediately removes this server from every bundle and permanently clears all member credentials. It cannot be restored."
      intent="archive"
      label="Archive server"
      pendingLabel="Archiving…"
      serverId={serverId}
      title={`Archive ${name}?`}
    />
  );
}

export function ToolApprovalForm({
  serverId,
  tools,
}: {
  serverId: string;
  tools: readonly CustomMcpTool[];
}) {
  const [, action] = useFeedback();
  const serverSelected = useMemo(
    () => new Set(tools.filter((tool) => tool.enabled).map((tool) => tool.id)),
    [tools],
  );
  const [selected, setOptimisticSelected] = useOptimistic(
    serverSelected,
    (_current, next: ReadonlySet<string>) => new Set(next),
  );
  const [pending, startTransition] = useTransition();
  const availableTools = tools.filter((tool) => tool.available);
  const selectedAvailableCount = availableTools.filter((tool) =>
    selected.has(tool.id),
  ).length;
  const allSelected =
    availableTools.length > 0 &&
    selectedAvailableCount === availableTools.length;
  const noneSelected = selectedAvailableCount === 0;

  function saveTools(next: ReadonlySet<string>) {
    const formData = new FormData();
    formData.set("intent", "save-tools");
    formData.set("serverId", serverId);
    next.forEach((id) => {
      formData.append("toolIds", id);
    });
    startTransition(() => {
      setOptimisticSelected(next);
      action(formData);
    });
  }

  return (
    <div aria-busy={pending} className="space-y-6">
      <FieldSet disabled={pending}>
        <FieldLegend>Available MCP tools</FieldLegend>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {selectedAvailableCount} of {availableTools.length} enabled
          </p>
          <div className="flex gap-2">
            <Button
              disabled={pending || allSelected}
              onClick={() => {
                saveTools(new Set(availableTools.map((tool) => tool.id)));
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              Select all
            </Button>
            <Button
              disabled={pending || noneSelected}
              onClick={() => {
                saveTools(new Set());
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
            const id = `custom-tool-${tool.id}`;
            return (
              <Field
                className="py-4"
                data-disabled={!tool.available}
                key={tool.id}
                orientation="horizontal"
              >
                <Checkbox
                  checked={selected.has(tool.id)}
                  disabled={pending || !tool.available}
                  id={id}
                  onCheckedChange={(checked) => {
                    const next = new Set(selected);
                    if (checked === true) next.add(tool.id);
                    else next.delete(tool.id);
                    saveTools(next);
                  }}
                />
                <FieldContent>
                  <FieldLabel htmlFor={id}>
                    <FieldTitle>
                      {tool.title}
                      <Badge variant="secondary">
                        {tool.kind === "read" ? "Read-only" : "May write"}
                      </Badge>
                      {tool.available ? null : (
                        <Badge variant="outline">Unavailable</Badge>
                      )}
                    </FieldTitle>
                  </FieldLabel>
                  <FieldDescription>{tool.description}</FieldDescription>
                  <p className="font-mono text-xs text-muted-foreground">
                    {tool.exposedName}
                  </p>
                </FieldContent>
              </Field>
            );
          })}
        </div>
      </FieldSet>
    </div>
  );
}

"use client";

import { WarningIcon } from "@phosphor-icons/react";
import { useActionState, useEffect, useOptimistic, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

import {
  revokeMcpConnectionAction,
  updateMcpConnectionBundleAction,
  type RevokeMcpConnectionState,
  type UpdateMcpConnectionBundleState,
} from "@/app/(workspace)/agent-setup/connection-actions";
import { McpClientMark } from "@/components/mcp/client-mark";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { McpOAuthConnection } from "@/lib/validation/mcp-connection";

const initialRevokeState: RevokeMcpConnectionState = {
  message: null,
  status: "idle",
};

const initialBundleState: UpdateMcpConnectionBundleState = {
  message: null,
  status: "idle",
};

function RevokeButton() {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending} size="sm" type="submit" variant="destructive">
      {pending ? "Revoking…" : "Revoke"}
    </Button>
  );
}

function ConnectionBundleForm({
  bundles,
  connection,
}: {
  bundles: readonly { id: string; name: string }[];
  connection: McpOAuthConnection;
}) {
  const [state, action] = useActionState(
    updateMcpConnectionBundleAction,
    initialBundleState,
  );
  const initialValue = connection.bundleId ?? "none";
  const [selectedValue, setOptimisticValue] = useOptimistic(
    initialValue,
    (_current, next: string) => next,
  );
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (state.message === null) return;
    if (state.status === "success") toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  function saveBundle(bundleId: string) {
    const formData = new FormData();
    formData.set("clientId", connection.clientId);
    formData.set("bundleId", bundleId);

    startTransition(() => {
      setOptimisticValue(bundleId);
      action(formData);
    });
  }

  return (
    <Select disabled={pending} onValueChange={saveBundle} value={selectedValue}>
      <SelectTrigger className="w-full min-w-0 sm:w-56" size="sm">
        <SelectValue placeholder="All connected providers" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">All connected providers</SelectItem>
        {bundles.map((bundle) => (
          <SelectItem key={bundle.id} value={bundle.id}>
            {bundle.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ConnectionRow({
  bundles,
  connection,
}: {
  bundles: readonly { id: string; name: string }[];
  connection: McpOAuthConnection;
}) {
  const [state, action] = useActionState(
    revokeMcpConnectionAction,
    initialRevokeState,
  );

  useEffect(() => {
    if (state.message === null) return;
    if (state.status === "success") toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  return (
    <li className="flex flex-col gap-4 border-b p-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="flex min-w-0 items-center gap-3 sm:flex-1">
        <McpClientMark clientName={connection.clientName} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {connection.clientName}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {connection.workspaceName} · Authorized{" "}
            {new Intl.DateTimeFormat("en", {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(connection.authorizedAt)}
          </p>
        </div>
      </div>
      <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
        {bundles.length === 0 ? null : (
          <ConnectionBundleForm bundles={bundles} connection={connection} />
        )}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              className="w-full sm:w-auto"
              size="sm"
              variant="destructive"
            >
              Revoke
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <form action={action}>
              <input
                name="consentId"
                type="hidden"
                value={connection.consentId}
              />
              <AlertDialogHeader>
                <AlertDialogMedia>
                  <WarningIcon aria-hidden="true" />
                </AlertDialogMedia>
                <AlertDialogTitle>
                  Revoke {connection.clientName}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This client will immediately lose access to the workspace. You
                  will need to authorize it again to reconnect.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="mt-6">
                <AlertDialogCancel>Keep connected</AlertDialogCancel>
                <RevokeButton />
              </AlertDialogFooter>
            </form>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </li>
  );
}

export function McpConnectionList({
  bundles = [],
  connections,
}: {
  bundles?: readonly { id: string; name: string }[];
  connections: McpOAuthConnection[];
}) {
  if (connections.length === 0) {
    return (
      <div className="border border-dashed p-8 text-center">
        <p className="text-sm font-medium">No connected MCP clients</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Register Context Layer in Codex or Claude Code to connect one.
        </p>
      </div>
    );
  }

  return (
    <ul className="border bg-background">
      {connections.map((connection) => (
        <ConnectionRow
          bundles={bundles}
          connection={connection}
          key={connection.consentId}
        />
      ))}
    </ul>
  );
}

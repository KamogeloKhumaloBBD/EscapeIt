"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

import {
  revokeMcpConnectionAction,
  updateMcpConnectionBundleAction,
  type RevokeMcpConnectionState,
  type UpdateMcpConnectionBundleState,
} from "@/app/(workspace)/account/actions";
import { McpClientMark } from "@/components/mcp/client-mark";
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

function BundleSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending} size="sm" type="submit" variant="outline">
      {pending ? "Saving…" : "Save"}
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

  useEffect(() => {
    if (state.message === null) return;
    if (state.status === "success") toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  return (
    <form action={action} className="flex items-center gap-2">
      <input name="clientId" type="hidden" value={connection.clientId} />
      <Select defaultValue={connection.bundleId ?? "none"} name="bundleId">
        <SelectTrigger className="w-44" size="sm">
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
      <BundleSubmitButton />
    </form>
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
    <li className="flex flex-col gap-4 border-b p-5 last:border-b-0 sm:flex-row sm:items-center">
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
      {bundles.length === 0 ? null : (
        <ConnectionBundleForm bundles={bundles} connection={connection} />
      )}
      <form action={action}>
        <input name="consentId" type="hidden" value={connection.consentId} />
        <RevokeButton />
      </form>
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

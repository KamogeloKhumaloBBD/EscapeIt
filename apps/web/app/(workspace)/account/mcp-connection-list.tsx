"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

import {
  revokeMcpConnectionAction,
  type RevokeMcpConnectionState,
} from "@/app/(workspace)/account/actions";
import { McpClientMark } from "@/components/mcp/client-mark";
import { Button } from "@/components/ui/button";
import type { McpOAuthConnection } from "@/lib/validation/mcp-connection";

const initialState: RevokeMcpConnectionState = {
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

function ConnectionRow({ connection }: { connection: McpOAuthConnection }) {
  const [state, action] = useActionState(
    revokeMcpConnectionAction,
    initialState,
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
      <form action={action}>
        <input name="consentId" type="hidden" value={connection.consentId} />
        <RevokeButton />
      </form>
    </li>
  );
}

export function McpConnectionList({
  connections,
}: {
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
        <ConnectionRow connection={connection} key={connection.consentId} />
      ))}
    </ul>
  );
}

"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

import { initialReplaceBundleCustomMcpServersState } from "../action-state";
import { replaceBundleCustomMcpServersAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button disabled={pending}>
      {pending ? "Saving…" : "Save Custom MCP selection"}
    </Button>
  );
}

export function CustomMcpSelector({
  bundleId,
  servers,
  selectedIds,
}: {
  bundleId: string;
  servers: readonly { id: string; name: string; status: string }[];
  selectedIds: readonly string[];
}) {
  const [state, action] = useActionState(
    replaceBundleCustomMcpServersAction,
    initialReplaceBundleCustomMcpServersState,
  );
  useEffect(() => {
    if (state.status === "success" && state.message !== null)
      toast.success(state.message);
    if (state.status === "error" && state.message !== null)
      toast.error(state.message);
  }, [state]);
  const selected = new Set(selectedIds);
  return (
    <form action={action}>
      <input name="bundleId" type="hidden" value={bundleId} />
      <div className="divide-y divide-border border-y border-border">
        {servers.map((server) => {
          const id = `bundle-custom-mcp-${server.id}`;
          return (
            <Field className="py-4" key={server.id} orientation="horizontal">
              <Checkbox
                defaultChecked={selected.has(server.id)}
                id={id}
                name="serverIds"
                value={server.id}
              />
              <FieldContent>
                <FieldLabel htmlFor={id}>
                  <FieldTitle>{server.name}</FieldTitle>
                </FieldLabel>
                <p className="text-xs text-muted-foreground">{server.status}</p>
              </FieldContent>
            </Field>
          );
        })}
      </div>
      <div className="mt-4">
        <SaveButton />
      </div>
    </form>
  );
}

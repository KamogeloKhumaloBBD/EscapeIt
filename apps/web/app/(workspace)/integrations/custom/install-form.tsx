"use client";

import { PlusIcon } from "@phosphor-icons/react";
import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

import { initialCustomMcpActionState } from "./action-state";
import { createCustomMcpAction } from "./actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button disabled={pending} type="submit">
      {pending ? <Spinner data-icon="inline-start" /> : null}
      {pending ? "Checking server…" : "Install server"}
    </Button>
  );
}

export function CustomMcpInstallDialog() {
  const [state, action] = useActionState(
    createCustomMcpAction,
    initialCustomMcpActionState,
  );
  useEffect(() => {
    if (state.status === "error" && state.message !== null)
      toast.error(state.message);
  }, [state]);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon aria-hidden="true" data-icon="inline-start" />
          Add server
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Install a Custom MCP server</DialogTitle>
          <DialogDescription>
            Add a public Streamable HTTP endpoint. We validate its network
            safety and negotiate MCP before saving it.
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-5">
          <Field data-invalid={state.fieldErrors?.name !== undefined}>
            <FieldLabel htmlFor="custom-mcp-name">Server name</FieldLabel>
            <Input
              aria-describedby="custom-mcp-name-description"
              id="custom-mcp-name"
              maxLength={120}
              name="name"
              placeholder="Internal knowledge"
              required
            />
            {state.fieldErrors?.name === undefined ? (
              <FieldDescription id="custom-mcp-name-description">
                Use a recognizable name for everyone in this workspace.
              </FieldDescription>
            ) : (
              <p className="text-xs text-destructive" role="alert">
                {state.fieldErrors.name}
              </p>
            )}
          </Field>
          <Field data-invalid={state.fieldErrors?.endpointUrl !== undefined}>
            <FieldLabel htmlFor="custom-mcp-endpoint">
              Streamable HTTP endpoint
            </FieldLabel>
            <Input
              aria-describedby="custom-mcp-endpoint-description"
              id="custom-mcp-endpoint"
              name="endpointUrl"
              placeholder="https://mcp.example.com/mcp"
              required
              type="url"
            />
            {state.fieldErrors?.endpointUrl === undefined ? (
              <FieldDescription id="custom-mcp-endpoint-description">
                Public HTTPS only. Do not include credentials in the URL.
              </FieldDescription>
            ) : (
              <p className="text-xs text-destructive" role="alert">
                {state.fieldErrors.endpointUrl}
              </p>
            )}
          </Field>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <SubmitButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

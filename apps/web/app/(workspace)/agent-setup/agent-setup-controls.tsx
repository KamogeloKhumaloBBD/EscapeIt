"use client";

import {
  CheckIcon,
  CopyIcon,
  KeyIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

import {
  createMcpTokenAction,
  revokeMcpTokenAction,
} from "@/app/(workspace)/agent-setup/actions";
import {
  initialCreateMcpTokenState,
  initialRevokeMcpTokenState,
} from "@/app/(workspace)/agent-setup/action-state";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function CopyButton({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${label} copied.`);
      window.setTimeout(() => {
        setCopied(false);
      }, 2_000);
    } catch {
      toast.error(`Couldn't copy ${label.toLowerCase()}.`);
    }
  }

  return (
    <Button onClick={() => void copy()} size="sm" type="button" variant="ghost">
      {copied ? (
        <CheckIcon aria-hidden="true" />
      ) : (
        <CopyIcon aria-hidden="true" />
      )}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

export function EndpointField({ endpoint }: { endpoint: string }) {
  return (
    <InputGroup>
      <InputGroupInput
        aria-label="MCP endpoint"
        className="font-mono text-xs"
        readOnly
        value={endpoint}
      />
      <InputGroupAddon align="inline-end">
        <CopyButton label="Endpoint" value={endpoint} />
      </InputGroupAddon>
    </InputGroup>
  );
}

function CreateTokenSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending} type="submit">
      {pending ? (
        <Spinner aria-hidden="true" />
      ) : (
        <PlusIcon aria-hidden="true" />
      )}
      {pending ? "Creating..." : "Create token"}
    </Button>
  );
}

export function CreateTokenForm() {
  const [state, formAction, pending] = useActionState(
    createMcpTokenAction,
    initialCreateMcpTokenState,
  );
  const formReference = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success" && state.rawToken !== null) {
      formReference.current?.reset();
    } else if (state.status === "error" && state.message !== null) {
      toast.error(state.message);
    }
  }, [state]);

  return (
    <>
      <form
        ref={formReference}
        action={formAction}
        aria-busy={pending}
        className="flex flex-col gap-4 sm:flex-row sm:items-center justify-items-center"
      >
        <Field className="flex-1" data-invalid={state.fieldError !== undefined}>
          <FieldLabel htmlFor="mcp-token-name">Token name</FieldLabel>
          <Input
            aria-describedby={
              state.fieldError === undefined
                ? "mcp-token-name-description"
                : "mcp-token-name-error"
            }
            aria-invalid={state.fieldError === undefined ? undefined : true}
            autoComplete="off"
            defaultValue={state.name}
            disabled={pending}
            id="mcp-token-name"
            maxLength={120}
            name="name"
            placeholder="My coding agent"
            required
          />
          {state.fieldError === undefined ? (
            <FieldDescription id="mcp-token-name-description">
              Use a name that identifies the client or machine.
            </FieldDescription>
          ) : (
            <FieldError id="mcp-token-name-error">
              {state.fieldError}
            </FieldError>
          )}
        </Field>
        <CreateTokenSubmitButton />
      </form>

      {state.rawToken === null ? null : (
        <TokenRevealDialog key={state.rawToken} rawToken={state.rawToken} />
      )}
    </>
  );
}

function TokenRevealDialog({ rawToken }: { rawToken: string }) {
  const [open, setOpen] = useState(true);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Your MCP token</DialogTitle>
          <DialogDescription>
            Copy this token now. It cannot be displayed again after you close
            this window.
          </DialogDescription>
        </DialogHeader>
        <InputGroup>
          <InputGroupInput
            aria-label="New MCP token"
            className="font-mono text-xs"
            readOnly
            value={rawToken}
          />
          <InputGroupAddon align="inline-end">
            <CopyButton label="Token" value={rawToken} />
          </InputGroupAddon>
        </InputGroup>
        <div className="flex gap-3 bg-muted/55 p-4 text-sm text-muted-foreground">
          <KeyIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <p>
            Store it in your client&apos;s environment or secure credential
            store. Never commit it to the repository.
          </p>
        </div>
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}

function RevokeTokenSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending} type="submit" variant="destructive">
      {pending ? (
        <Spinner aria-hidden="true" />
      ) : (
        <TrashIcon aria-hidden="true" />
      )}
      {pending ? "Revoking..." : "Revoke token"}
    </Button>
  );
}

export function RevokeTokenButton({
  name,
  tokenId,
}: {
  name: string;
  tokenId: string;
}) {
  const [state, formAction] = useActionState(
    revokeMcpTokenAction,
    initialRevokeMcpTokenState,
  );

  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message ?? "Token revoked.");
    } else if (state.status === "error" && state.message !== null) {
      toast.error(state.message);
    }
  }, [state]);

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="ghost">
          Revoke
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Any client using this token will lose access immediately. This
            action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep token</AlertDialogCancel>
          <form action={formAction}>
            <input name="tokenId" type="hidden" value={tokenId} />
            <RevokeTokenSubmitButton />
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function CodeExample({ code }: { code: string }) {
  return (
    <div className="relative bg-foreground text-background">
      <div className="absolute right-2 top-2">
        <CopyButton label="Configuration" value={code} />
      </div>
      <pre className="overflow-x-auto p-5 pr-24 font-mono text-xs leading-6">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function ClientSetupTabs({ endpoint }: { endpoint: string }) {
  const examples = {
    claude: JSON.stringify(
      {
        mcpServers: {
          "context-layer": {
            headers: {
              Authorization: "Bearer ${CONTEXT_LAYER_TOKEN}",
            },
            type: "http",
            url: endpoint,
          },
        },
      },
      null,
      2,
    ),
    codex: `[mcp_servers.context_layer]\nurl = "${endpoint}"\nbearer_token_env_var = "CONTEXT_LAYER_TOKEN"`,
    generic: `curl --request POST "${endpoint}" \\\n  --header "Authorization: Bearer $CONTEXT_LAYER_TOKEN" \\\n  --header "Content-Type: application/json" \\\n  --header "Accept: application/json, text/event-stream" \\\n  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"context-layer-check","version":"1.0.0"}}}'`,
    vscode: JSON.stringify(
      {
        inputs: [
          {
            description: "Context Layer MCP token",
            id: "context-layer-token",
            password: true,
            type: "promptString",
          },
        ],
        servers: {
          "context-layer": {
            headers: {
              Authorization: "Bearer ${input:context-layer-token}",
            },
            type: "http",
            url: endpoint,
          },
        },
      },
      null,
      2,
    ),
  };

  return (
    <Tabs defaultValue="codex">
      <TabsList className="max-w-full overflow-x-auto" variant="line">
        <TabsTrigger value="codex">Codex</TabsTrigger>
        <TabsTrigger value="claude">Claude</TabsTrigger>
        <TabsTrigger value="vscode">VS Code</TabsTrigger>
        <TabsTrigger value="generic">Generic</TabsTrigger>
      </TabsList>
      <TabsContent value="codex">
        <CodeExample code={examples.codex} />
      </TabsContent>
      <TabsContent value="claude">
        <CodeExample code={examples.claude} />
      </TabsContent>
      <TabsContent value="vscode">
        <CodeExample code={examples.vscode} />
      </TabsContent>
      <TabsContent value="generic">
        <CodeExample code={examples.generic} />
      </TabsContent>
    </Tabs>
  );
}

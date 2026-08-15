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
  initialCreateMcpTokenState,
  initialRevokeMcpTokenState,
} from "@/app/(workspace)/agent-setup/action-state";
import {
  createMcpTokenAction,
  revokeMcpTokenAction,
} from "@/app/(workspace)/agent-setup/actions";
import { McpClientMark } from "@/components/mcp/client-mark";
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
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
      {pending ? "Creating…" : "Create token"}
    </Button>
  );
}

export function CreateTokenForm({
  bundles = [],
}: {
  bundles?: readonly { id: string; name: string }[];
}) {
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
        className="flex flex-col gap-4 sm:flex-row sm:items-end justify-items-center"
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
          {state.fieldError !== undefined ? (
            <FieldError id="mcp-token-name-error">
              {state.fieldError}
            </FieldError>
          ) : null}
        </Field>
        {bundles.length === 0 ? null : (
          <Field className="flex-1">
            <FieldLabel htmlFor="mcp-token-bundle">Bundle</FieldLabel>
            <Select defaultValue="none" disabled={pending} name="bundleId">
              <SelectTrigger id="mcp-token-bundle">
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
          </Field>
        )}
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
            Store it in a secure credential store. Never commit it to the
            repository or share it with another person.
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
      {pending ? "Revoking…" : "Revoke token"}
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
        <Button size="sm" variant="destructive">
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

function CodeExample({
  code,
  label = "Configuration",
}: {
  code: string;
  label?: string;
}) {
  return (
    <div className="relative bg-foreground text-background">
      <div className="absolute right-2 top-2">
        <CopyButton label={label} value={code} />
      </div>
      <pre className="overflow-x-auto p-5 pr-24 font-mono text-xs leading-6">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function TokenEnvironmentSetup() {
  const commands = {
    powershell:
      '$env:CONTEXT_LAYER_TOKEN = Read-Host "Context Layer token" -MaskInput',
    unix: [
      'printf "Context Layer token: "',
      "IFS= read -rs CONTEXT_LAYER_TOKEN",
      "printf '\\n'",
      "export CONTEXT_LAYER_TOKEN",
    ].join("\n"),
  };

  return (
    <div className="space-y-3">
      <Tabs defaultValue="unix">
        <TabsList variant="line">
          <TabsTrigger value="unix">macOS / Linux</TabsTrigger>
          <TabsTrigger value="powershell">PowerShell</TabsTrigger>
        </TabsList>
        <TabsContent value="unix">
          <CodeExample code={commands.unix} label="Shell command" />
        </TabsContent>
        <TabsContent value="powershell">
          <CodeExample code={commands.powershell} label="PowerShell command" />
        </TabsContent>
      </Tabs>
      <p className="text-xs leading-5 text-muted-foreground">
        Paste the token when prompted. The value is available only to this shell
        session. Start or restart Kiro and Cursor from an environment that can
        read it. VS Code prompts for the token itself, so you can skip this step
        for that client.
      </p>
    </div>
  );
}

export function TokenClientSetupGuide({ endpoint }: { endpoint: string }) {
  const examples = {
    cursor: JSON.stringify(
      {
        mcpServers: {
          "context-layer": {
            headers: {
              Authorization: "Bearer ${env:CONTEXT_LAYER_TOKEN}",
            },
            url: endpoint,
          },
        },
      },
      null,
      2,
    ),
    kiro: JSON.stringify(
      {
        mcpServers: {
          "context-layer": {
            headers: {
              Authorization: "Bearer ${CONTEXT_LAYER_TOKEN}",
            },
            url: endpoint,
          },
        },
      },
      null,
      2,
    ),
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
    genericUnix: `curl --request POST "${endpoint}" \\\n  --header "Authorization: Bearer $CONTEXT_LAYER_TOKEN" \\\n  --header "Content-Type: application/json" \\\n  --header "Accept: application/json, text/event-stream" \\\n  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"context-layer-check","version":"1.0.0"}}}'`,
    genericPowerShell: [
      "$headers = @{",
      '  Authorization = "Bearer $env:CONTEXT_LAYER_TOKEN"',
      '  Accept = "application/json, text/event-stream"',
      "}",
      '$body = \'{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"context-layer-check","version":"1.0.0"}}}\'',
      'Invoke-WebRequest -Uri "' +
        endpoint +
        '" -Method Post -Headers $headers -ContentType "application/json" -Body $body',
    ].join("\n"),
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
    <div className="space-y-7">
      <section aria-labelledby="token-environment-heading">
        <div className="mb-4 flex items-start gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center bg-primary text-xs font-semibold text-primary-foreground">
            1
          </span>
          <div>
            <h3
              className="text-sm font-semibold"
              id="token-environment-heading"
            >
              Set the token for your client
            </h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Use the token from the one-time reveal as an environment variable
              instead of saving it in a configuration file.
            </p>
          </div>
        </div>
        <TokenEnvironmentSetup />
      </section>

      <section aria-labelledby="token-client-heading" className="border-t pt-7">
        <div className="mb-4 flex items-start gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center bg-primary text-xs font-semibold text-primary-foreground">
            2
          </span>
          <div>
            <h3 className="text-sm font-semibold" id="token-client-heading">
              Configure your client
            </h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Choose a client and copy the configuration for this workspace
              endpoint.
            </p>
          </div>
        </div>

        <Tabs defaultValue="codex">
          <TabsList className="max-w-full overflow-x-auto" variant="line">
            <TabsTrigger value="codex">
              <McpClientMark clientName="Codex" size="sm" />
              Codex
            </TabsTrigger>
            <TabsTrigger value="claude">
              <McpClientMark clientName="Claude Code" size="sm" />
              Claude Code
            </TabsTrigger>
            <TabsTrigger value="kiro">
              <McpClientMark clientName="Kiro" size="sm" />
              Kiro
            </TabsTrigger>
            <TabsTrigger value="cursor">
              <McpClientMark clientName="Cursor" size="sm" />
              Cursor
            </TabsTrigger>
            <TabsTrigger value="vscode">
              <McpClientMark clientName="VS Code" size="sm" />
              VS Code
            </TabsTrigger>
            <TabsTrigger value="generic">
              <McpClientMark clientName="Generic HTTP" size="sm" />
              Generic HTTP
            </TabsTrigger>
          </TabsList>
          <TabsContent className="space-y-3" value="codex">
            <CodeExample code={examples.codex} />
            <p className="text-xs leading-5 text-muted-foreground">
              Add this to <code>~/.codex/config.toml</code>, or to a trusted
              project&apos;s <code>.codex/config.toml</code>, then restart
              Codex.
            </p>
          </TabsContent>
          <TabsContent className="space-y-3" value="claude">
            <CodeExample code={examples.claude} />
            <p className="text-xs leading-5 text-muted-foreground">
              Add this server to <code>.mcp.json</code>, then run{" "}
              <code>claude mcp list</code> to confirm it loaded.
            </p>
          </TabsContent>
          <TabsContent className="space-y-3" value="kiro">
            <CodeExample code={examples.kiro} />
            <p className="text-xs leading-5 text-muted-foreground">
              Paste this into <code>.kiro/settings/mcp.json</code> for the
              project, or <code>~/.kiro/settings/mcp.json</code> globally.
            </p>
          </TabsContent>
          <TabsContent className="space-y-3" value="cursor">
            <CodeExample code={examples.cursor} />
            <p className="text-xs leading-5 text-muted-foreground">
              Paste this into <code>.cursor/mcp.json</code> for the project, or{" "}
              <code>~/.cursor/mcp.json</code> globally.
            </p>
          </TabsContent>
          <TabsContent className="space-y-3" value="vscode">
            <CodeExample code={examples.vscode} />
            <p className="text-xs leading-5 text-muted-foreground">
              Paste this into <code>.vscode/mcp.json</code>. VS Code asks for
              the token once and stores the masked input securely.
            </p>
          </TabsContent>
          <TabsContent className="space-y-3" value="generic">
            <Tabs defaultValue="unix">
              <TabsList variant="line">
                <TabsTrigger value="unix">macOS / Linux</TabsTrigger>
                <TabsTrigger value="powershell">PowerShell</TabsTrigger>
              </TabsList>
              <TabsContent value="unix">
                <CodeExample code={examples.genericUnix} label="Request" />
              </TabsContent>
              <TabsContent value="powershell">
                <CodeExample
                  code={examples.genericPowerShell}
                  label="Request"
                />
              </TabsContent>
            </Tabs>
            <p className="text-xs leading-5 text-muted-foreground">
              Generic clients must send the token as an{" "}
              <code>Authorization: Bearer</code> header on every MCP request.
            </p>
          </TabsContent>
        </Tabs>
      </section>
    </div>
  );
}

export function OAuthClientSetupTabs({ endpoint }: { endpoint: string }) {
  const commands = {
    claude: `claude mcp add --transport http --scope local context-layer "${endpoint}"`,
    codex: `codex mcp add context-layer --url "${endpoint}"`,
    cursor: JSON.stringify(
      {
        mcpServers: {
          "context-layer": {
            url: endpoint,
          },
        },
      },
      null,
      2,
    ),
    generic: endpoint,
    kiro: JSON.stringify(
      {
        mcpServers: {
          "context-layer": {
            url: endpoint,
          },
        },
      },
      null,
      2,
    ),
    vscode: JSON.stringify(
      {
        servers: {
          contextLayer: {
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
        <TabsTrigger value="codex">
          <McpClientMark clientName="Codex" size="sm" />
          Codex
        </TabsTrigger>
        <TabsTrigger value="claude">
          <McpClientMark clientName="Claude Code" size="sm" />
          Claude Code
        </TabsTrigger>
        <TabsTrigger value="kiro">
          <McpClientMark clientName="Kiro" size="sm" />
          Kiro
        </TabsTrigger>
        <TabsTrigger value="cursor">
          <McpClientMark clientName="Cursor" size="sm" />
          Cursor
        </TabsTrigger>
        <TabsTrigger value="vscode">
          <McpClientMark clientName="VS Code" size="sm" />
          VS Code
        </TabsTrigger>
        <TabsTrigger value="generic">
          <McpClientMark clientName="Generic HTTP" size="sm" />
          Generic HTTP
        </TabsTrigger>
      </TabsList>
      <TabsContent className="space-y-4" value="codex">
        <CodeExample code={commands.codex} />
        <p className="text-xs leading-5 text-muted-foreground">
          If the browser does not open, run{" "}
          <code>codex mcp login context-layer</code>. Verify with{" "}
          <code>codex mcp list</code>.
        </p>
      </TabsContent>
      <TabsContent className="space-y-4" value="claude">
        <CodeExample code={commands.claude} />
        <p className="text-xs leading-5 text-muted-foreground">
          If authentication does not start, run{" "}
          <code>claude mcp login context-layer</code> or open <code>/mcp</code>.
          Verify with <code>claude mcp list</code>.
        </p>
      </TabsContent>
      <TabsContent className="space-y-4" value="kiro">
        <CodeExample code={commands.kiro} />
        <p className="text-xs leading-5 text-muted-foreground">
          Paste this into <code>.kiro/settings/mcp.json</code> for this project,
          or <code>~/.kiro/settings/mcp.json</code> for all projects. Save the
          file, then complete the browser authorization prompt in Kiro.
        </p>
      </TabsContent>
      <TabsContent className="space-y-4" value="cursor">
        <CodeExample code={commands.cursor} />
        <p className="text-xs leading-5 text-muted-foreground">
          Paste this into <code>.cursor/mcp.json</code> for this project, or{" "}
          <code>~/.cursor/mcp.json</code> for all projects. Open Customize →
          MCP, start Context Layer, and complete authorization in your browser.
        </p>
      </TabsContent>
      <TabsContent className="space-y-4" value="vscode">
        <CodeExample code={commands.vscode} />
        <p className="text-xs leading-5 text-muted-foreground">
          Paste this into <code>.vscode/mcp.json</code>, or run{" "}
          <strong>MCP: Open User Configuration</strong> for a global setup.
          Start Context Layer and complete authorization in your browser.
        </p>
      </TabsContent>
      <TabsContent className="space-y-4" value="generic">
        <CodeExample code={commands.generic} />
        <p className="text-xs text-muted-foreground">
          Use a Streamable HTTP client with OAuth 2.1 discovery support.
          Required scope: <code>mcp:access</code>. Resource audience:{" "}
          <code>{endpoint}</code>.
        </p>
      </TabsContent>
      <div className="mt-5 border-t pt-4 text-xs text-muted-foreground">
        Try: “Use Context Layer to show the workspace sources and tools I can
        access.”
      </div>
    </Tabs>
  );
}

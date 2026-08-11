"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

import { initialIntegrationActionState } from "@/app/(workspace)/integrations/[provider]/action-state";
import { integrationAction } from "@/app/(workspace)/integrations/[provider]/actions";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import {
  scopeDiscoverySchema,
  type IntegrationScope,
} from "@/lib/validation/integration";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button disabled={pending} type="submit">
      {pending ? <Spinner data-icon="inline-start" /> : null}
      {pending ? "Saving access..." : "Save project access"}
    </Button>
  );
}

function parseResponse(value: unknown) {
  if (typeof value !== "object" || value === null || !("data" in value)) {
    return null;
  }

  const parsed = scopeDiscoverySchema.safeParse(Reflect.get(value, "data"));
  return parsed.success ? parsed.data : null;
}

export function ProjectSelector({
  initialItems,
  initialSelected,
  initialNextCursor,
  provider,
}: {
  initialItems: readonly IntegrationScope[];
  initialNextCursor: string | null;
  initialSelected: readonly IntegrationScope[];
  provider: string;
}) {
  const [state, formAction] = useActionState(
    integrationAction,
    initialIntegrationActionState,
  );
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<readonly IntegrationScope[]>(initialItems);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(
    () => new Map(initialSelected.map((scope) => [scope.externalId, scope])),
  );
  const firstRender = useRef(true);

  const visibleItems = useMemo(() => {
    const combined = new Map(selected);

    for (const item of items) {
      combined.set(item.externalId, item);
    }

    return [...combined.values()];
  }, [items, selected]);

  useEffect(() => {
    if (state.status === "success" && state.message !== null) {
      toast.success(state.message);
    } else if (state.status === "error" && state.message !== null) {
      toast.error(state.message);
    }
  }, [state]);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setLoading(true);
      const parameters = new URLSearchParams({ query });
      void fetch(
        `/api/integrations/${encodeURIComponent(provider)}/scopes?${parameters.toString()}`,
        { headers: { accept: "application/json" }, signal: controller.signal },
      )
        .then(async (response) => {
          if (!response.ok) {
            throw new Error("Scope discovery failed.");
          }

          const discovered = parseResponse((await response.json()) as unknown);

          if (discovered === null) {
            throw new Error("Scope discovery failed.");
          }

          setItems(discovered.items);
          setNextCursor(discovered.nextCursor);
        })
        .catch((error: unknown) => {
          if (!(error instanceof DOMException && error.name === "AbortError")) {
            toast.error("We couldn't load Jira projects.");
          }
        })
        .finally(() => {
          setLoading(false);
        });
    }, 300);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [provider, query]);

  async function loadMore() {
    if (nextCursor === null) {
      return;
    }

    setLoading(true);
    const parameters = new URLSearchParams({ cursor: nextCursor, query });

    try {
      const response = await fetch(
        `/api/integrations/${encodeURIComponent(provider)}/scopes?${parameters.toString()}`,
        { headers: { accept: "application/json" } },
      );

      if (!response.ok) {
        throw new Error("Scope discovery failed.");
      }

      const discovered = parseResponse((await response.json()) as unknown);

      if (discovered === null) {
        throw new Error("Scope discovery failed.");
      }

      setItems((current) => [...current, ...discovered.items]);
      setNextCursor(discovered.nextCursor);
    } catch {
      toast.error("We couldn't load more Jira projects.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form action={formAction}>
      <input name="intent" type="hidden" value="save-scopes" />
      <input name="provider" type="hidden" value={provider} />
      {[...selected.keys()].map((externalId) => (
        <input
          key={externalId}
          name="externalIds"
          type="hidden"
          value={externalId}
        />
      ))}

      <Command
        aria-busy={loading}
        className="overflow-hidden rounded-none border border-border bg-card"
        shouldFilter={false}
      >
        <div className="relative">
          <CommandInput
            aria-label="Search Jira projects"
            onValueChange={setQuery}
            placeholder="Search projects"
            value={query}
          />
          {loading ? (
            <Spinner className="absolute right-4 top-1/2 -translate-y-1/2" />
          ) : null}
        </div>
        <ScrollArea className="max-h-72">
          <CommandList className="max-h-none">
            <CommandEmpty>No Jira projects found.</CommandEmpty>
            <CommandGroup heading="Projects">
              {visibleItems.map((scope) => {
                const checked = selected.has(scope.externalId);
                return (
                  <CommandItem
                    aria-selected={checked}
                    className="rounded-none data-[checked=true]:bg-primary/7 data-[checked=true]:text-foreground"
                    data-checked={checked}
                    key={scope.externalId}
                    onSelect={() => {
                      setSelected((current) => {
                        const next = new Map(current);

                        if (checked) {
                          next.delete(scope.externalId);
                        } else {
                          next.set(scope.externalId, scope);
                        }

                        return next;
                      });
                    }}
                    value={scope.externalId}
                  >
                    <Checkbox
                      aria-label={`Allow ${scope.displayName}`}
                      checked={checked}
                      tabIndex={-1}
                    />
                    <span>{scope.displayName}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </ScrollArea>
      </Command>

      {nextCursor !== null ? (
        <ButtonGroup className="mt-3">
          <Button
            disabled={loading}
            onClick={() => void loadMore()}
            type="button"
            variant="outline"
          >
            {loading ? <Spinner data-icon="inline-start" /> : null}
            {loading ? "Loading..." : "Load more"}
          </Button>
        </ButtonGroup>
      ) : null}

      <div className="mt-5 flex flex-col gap-3 border border-border bg-muted/35 p-3 sm:flex-row sm:items-center sm:justify-between sm:pl-4">
        <p className="text-sm font-medium text-muted-foreground">
          {selected.size === 0
            ? "No projects selected. Jira access is denied by default."
            : `${String(selected.size)} project${selected.size === 1 ? "" : "s"} selected`}
        </p>
        <SaveButton />
      </div>
    </form>
  );
}

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

function SaveButton({ scopePlural }: { scopePlural: string }) {
  const { pending } = useFormStatus();
  return (
    <Button disabled={pending} type="submit">
      {pending ? <Spinner data-icon="inline-start" /> : null}
      {pending ? "Saving access..." : `Save ${scopePlural} access`}
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

export function ScopeSelector({
  initialItems,
  initialSelected,
  initialNextCursor,
  provider,
  providerDisplayName,
  scopeLabels,
}: {
  initialItems: readonly IntegrationScope[];
  initialNextCursor: string | null;
  initialSelected: readonly IntegrationScope[];
  provider: string;
  providerDisplayName: string;
  scopeLabels: { plural: string; singular: string };
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
            toast.error(
              `We couldn't load ${providerDisplayName} ${scopeLabels.plural}.`,
            );
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
  }, [provider, providerDisplayName, query, scopeLabels.plural]);

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
      toast.error(
        `We couldn't load more ${providerDisplayName} ${scopeLabels.plural}.`,
      );
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
            aria-label={`Search ${providerDisplayName} ${scopeLabels.plural}`}
            onValueChange={setQuery}
            placeholder={`Search ${scopeLabels.plural}`}
            value={query}
          />
          {loading ? (
            <Spinner className="absolute right-4 top-1/2 -translate-y-1/2" />
          ) : null}
        </div>
        <ScrollArea className="max-h-72">
          <CommandList className="max-h-none">
            <CommandEmpty>
              No {providerDisplayName} {scopeLabels.plural} found.
            </CommandEmpty>
            <CommandGroup
              heading={`${scopeLabels.plural.charAt(0).toUpperCase()}${scopeLabels.plural.slice(1)}`}
            >
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
            ? `No ${scopeLabels.plural} selected. ${providerDisplayName} access is denied by default.`
            : `${String(selected.size)} ${
                selected.size === 1 ? scopeLabels.singular : scopeLabels.plural
              } selected`}
        </p>
        <SaveButton scopePlural={scopeLabels.plural} />
      </div>
    </form>
  );
}

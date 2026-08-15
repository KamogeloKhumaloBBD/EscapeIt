"use client";

import {
  useActionState,
  useEffect,
  useMemo,
  useOptimistic,
  useTransition,
} from "react";
import { toast } from "sonner";

import { initialReplaceBundleProvidersState } from "@/app/(workspace)/bundles/action-state";
import { replaceBundleProvidersAction } from "@/app/(workspace)/bundles/actions";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";

export interface SelectableProvider {
  displayName: string;
  installed: boolean;
  provider: string;
}

export function ProviderSelector({
  availableProviders,
  bundleId,
  selectedProviders,
}: {
  availableProviders: readonly SelectableProvider[];
  bundleId: string;
  selectedProviders: readonly string[];
}) {
  const serverSelected = useMemo(
    () => new Set(selectedProviders),
    [selectedProviders],
  );
  const [selected, setOptimisticSelected] = useOptimistic(
    serverSelected,
    (_current, next: ReadonlySet<string>) => new Set(next),
  );
  const [state, formAction] = useActionState(
    replaceBundleProvidersAction,
    initialReplaceBundleProvidersState,
  );
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (state.status === "success" && state.message !== null) {
      toast.success(state.message);
    } else if (state.status === "error" && state.message !== null) {
      toast.error(state.message);
    }
  }, [state]);

  function saveProviders(next: ReadonlySet<string>) {
    const formData = new FormData();
    formData.set("bundleId", bundleId);
    next.forEach((provider) => {
      formData.append("providers", provider);
    });

    startTransition(() => {
      setOptimisticSelected(next);
      formAction(formData);
    });
  }

  return (
    <div aria-busy={pending} className="space-y-4">
      <div className="text-xs text-muted-foreground">
        <span>
          {selected.size} {selected.size === 1 ? "provider" : "providers"}{" "}
          selected
        </span>
      </div>

      <div className="divide-y divide-border border-y border-border">
        {availableProviders.map((provider) => {
          const checked = selected.has(provider.provider);
          const id = `bundle-provider-${provider.provider}`;

          return (
            <Field
              className="py-4"
              data-disabled={!provider.installed}
              key={provider.provider}
              orientation="horizontal"
            >
              <Checkbox
                checked={checked}
                disabled={pending || !provider.installed}
                id={id}
                onCheckedChange={(nextChecked) => {
                  const next = new Set(selected);

                  if (nextChecked === true) {
                    next.add(provider.provider);
                  } else {
                    next.delete(provider.provider);
                  }

                  saveProviders(next);
                }}
              />
              <FieldContent>
                <FieldLabel htmlFor={id}>
                  <FieldTitle>{provider.displayName}</FieldTitle>
                </FieldLabel>
                {provider.installed ? null : (
                  <p className="text-xs text-muted-foreground">
                    Not yet installed for this workspace.
                  </p>
                )}
              </FieldContent>
            </Field>
          );
        })}
      </div>
    </div>
  );
}

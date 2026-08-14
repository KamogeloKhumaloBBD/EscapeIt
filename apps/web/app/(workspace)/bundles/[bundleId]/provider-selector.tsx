"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

import { initialReplaceBundleProvidersState } from "@/app/(workspace)/bundles/action-state";
import { replaceBundleProvidersAction } from "@/app/(workspace)/bundles/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";

export interface SelectableProvider {
  displayName: string;
  installed: boolean;
  provider: string;
}

function SaveSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending} type="submit">
      {pending ? <Spinner aria-hidden="true" /> : null}
      {pending ? "Saving..." : "Save providers"}
    </Button>
  );
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
  const [selected, setSelected] = useState(() => new Set(selectedProviders));
  const [state, formAction, pending] = useActionState(
    replaceBundleProvidersAction,
    initialReplaceBundleProvidersState,
  );

  useEffect(() => {
    if (state.status === "success" && state.message !== null) {
      toast.success(state.message);
    } else if (state.status === "error" && state.message !== null) {
      toast.error(state.message);
    }
  }, [state]);

  return (
    <form action={formAction} aria-busy={pending} className="space-y-4">
      <input name="bundleId" type="hidden" value={bundleId} />
      {[...selected].map((provider) => (
        <input key={provider} name="providers" type="hidden" value={provider} />
      ))}

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
                  setSelected((current) => {
                    const next = new Set(current);

                    if (nextChecked === true) {
                      next.add(provider.provider);
                    } else {
                      next.delete(provider.provider);
                    }

                    return next;
                  });
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

      <SaveSubmitButton />
    </form>
  );
}

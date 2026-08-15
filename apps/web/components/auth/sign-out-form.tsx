"use client";

import { SignOutIcon } from "@phosphor-icons/react";
import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

import { signOutAction } from "@/app/auth-actions";
import { initialSignOutState } from "@/components/auth/sign-out-state";
import { Button } from "@/components/ui/button";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";

function SignOutButton({ appearance }: { appearance: "default" | "sidebar" }) {
  const { pending } = useFormStatus();

  if (appearance === "sidebar") {
    return (
      <SidebarMenuButton
        className="h-10 px-3 text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
        disabled={pending}
        tooltip="Log out"
        type="submit"
      >
        {pending ? <Spinner /> : <SignOutIcon aria-hidden="true" />}
        <span>{pending ? "Signing out..." : "Log out"}</span>
      </SidebarMenuButton>
    );
  }

  return (
    <Button
      className="w-full justify-start"
      disabled={pending}
      size="sm"
      type="submit"
      variant="ghost"
    >
      {pending ? <Spinner data-icon="inline-start" /> : null}
      {pending ? "Signing out..." : "Log out"}
    </Button>
  );
}

export function SignOutForm({
  appearance = "default",
}: {
  appearance?: "default" | "sidebar";
}) {
  const [state, formAction, isPending] = useActionState(
    signOutAction,
    initialSignOutState,
  );

  useEffect(() => {
    if (state.error !== null) {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <form action={formAction} aria-busy={isPending}>
      <SignOutButton appearance={appearance} />
    </form>
  );
}

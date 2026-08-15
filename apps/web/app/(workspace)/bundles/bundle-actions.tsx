"use client";

import { DotsThreeIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

import {
  initialCreateBundleState,
  initialDeleteBundleState,
  initialUpdateBundleState,
} from "@/app/(workspace)/bundles/action-state";
import {
  createBundleAction,
  deleteBundleAction,
  updateBundleAction,
} from "@/app/(workspace)/bundles/actions";
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

function SubmitButton({
  children,
  pendingLabel,
  variant = "default",
}: {
  children: React.ReactNode;
  pendingLabel: string;
  variant?: "default" | "destructive" | "outline";
}) {
  const { pending } = useFormStatus();
  return (
    <Button disabled={pending} type="submit" variant={variant}>
      {pending ? <Spinner aria-hidden="true" /> : null}
      {pending ? pendingLabel : children}
    </Button>
  );
}

export function CreateBundleForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    createBundleAction,
    initialCreateBundleState,
  );

  useEffect(() => {
    if (state.status === "success") {
      if (state.bundleId !== null) {
        toast.success("Bundle created.");
        router.push(`/bundles/${state.bundleId}`);
      }
    } else if (state.status === "error" && state.message !== null) {
      toast.error(state.message);
    }
  }, [router, state]);

  return (
    <form action={formAction} aria-busy={pending} className="space-y-4">
      <Field className="flex-1" data-invalid={state.fieldError !== undefined}>
        <FieldLabel htmlFor="bundle-name">Name</FieldLabel>
        <Input
          aria-describedby={
            state.fieldError === undefined ? undefined : "bundle-name-error"
          }
          aria-invalid={state.fieldError === undefined ? undefined : true}
          autoComplete="off"
          defaultValue={state.name}
          disabled={pending}
          id="bundle-name"
          maxLength={120}
          name="name"
          placeholder="Engineering"
          required
        />
        {state.fieldError === undefined ? null : (
          <FieldError id="bundle-name-error">{state.fieldError}</FieldError>
        )}
      </Field>
      <Field
        className="flex-1"
        data-invalid={state.descriptionFieldError !== undefined}
      >
        <FieldLabel htmlFor="bundle-description">
          Description (optional)
        </FieldLabel>
        <Input
          aria-describedby={
            state.descriptionFieldError === undefined
              ? undefined
              : "bundle-description-error"
          }
          aria-invalid={
            state.descriptionFieldError === undefined ? undefined : true
          }
          defaultValue={state.description}
          disabled={pending}
          id="bundle-description"
          maxLength={500}
          name="description"
          placeholder="GitHub and Jira for the platform team"
        />
        {state.descriptionFieldError === undefined ? null : (
          <FieldError id="bundle-description-error">
            {state.descriptionFieldError}
          </FieldError>
        )}
      </Field>
      <SubmitButton pendingLabel="Creating…">Create bundle</SubmitButton>
    </form>
  );
}

export function CreateBundleDialog({
  triggerLabel = "Create bundle",
}: {
  triggerLabel?: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon aria-hidden="true" data-icon="inline-start" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a bundle</DialogTitle>
          <DialogDescription>
            Name this access boundary now, then choose its connected providers
            on the next screen.
          </DialogDescription>
        </DialogHeader>
        <CreateBundleForm />
      </DialogContent>
    </Dialog>
  );
}

export function UpdateBundleForm({
  bundleId,
  description,
  name,
}: {
  bundleId: string;
  description: string | null;
  name: string;
}) {
  const [state, formAction, pending] = useActionState(
    updateBundleAction,
    initialUpdateBundleState,
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
      <Field data-invalid={state.fieldError !== undefined}>
        <FieldLabel htmlFor="bundle-edit-name">Name</FieldLabel>
        <Input
          aria-describedby={
            state.fieldError === undefined
              ? undefined
              : "bundle-edit-name-error"
          }
          aria-invalid={state.fieldError === undefined ? undefined : true}
          autoComplete="off"
          defaultValue={state.name || name}
          disabled={pending}
          id="bundle-edit-name"
          maxLength={120}
          name="name"
          required
        />
        {state.fieldError === undefined ? null : (
          <FieldError id="bundle-edit-name-error">
            {state.fieldError}
          </FieldError>
        )}
      </Field>
      <Field data-invalid={state.descriptionFieldError !== undefined}>
        <FieldLabel htmlFor="bundle-edit-description">
          Description (optional)
        </FieldLabel>
        <Input
          aria-describedby={
            state.descriptionFieldError === undefined
              ? undefined
              : "bundle-edit-description-error"
          }
          aria-invalid={
            state.descriptionFieldError === undefined ? undefined : true
          }
          defaultValue={state.description || (description ?? "")}
          disabled={pending}
          id="bundle-edit-description"
          maxLength={500}
          name="description"
        />
        {state.descriptionFieldError === undefined ? null : (
          <FieldError id="bundle-edit-description-error">
            {state.descriptionFieldError}
          </FieldError>
        )}
      </Field>
      <SubmitButton pendingLabel="Saving…">Save details</SubmitButton>
    </form>
  );
}

export function DeleteBundleButton({
  bundleId,
  menu = false,
  name,
  redirectTo,
}: {
  bundleId: string;
  menu?: boolean;
  name: string;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(
    deleteBundleAction,
    initialDeleteBundleState,
  );

  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message ?? "Bundle deleted.");

      if (redirectTo !== undefined) {
        router.push(redirectTo);
      }
    } else if (state.status === "error" && state.message !== null) {
      toast.error(state.message);
    }
  }, [redirectTo, router, state]);

  const content = (
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
        <AlertDialogDescription>
          Any personal access token still scoped to this bundle must be revoked
          or reassigned first. This action cannot be undone.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Keep bundle</AlertDialogCancel>
        <form action={formAction}>
          <input name="bundleId" type="hidden" value={bundleId} />
          <SubmitButton pendingLabel="Deleting…" variant="destructive">
            Delete bundle
          </SubmitButton>
        </form>
      </AlertDialogFooter>
    </AlertDialogContent>
  );

  if (menu) {
    return (
      <>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={`Actions for ${name}`}
              size="icon-sm"
              variant="ghost"
            >
              <DotsThreeIcon aria-hidden="true" weight="bold" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => {
                setOpen(true);
              }}
              variant="destructive"
            >
              <TrashIcon aria-hidden="true" />
              Delete bundle
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <AlertDialog onOpenChange={setOpen} open={open}>
          {content}
        </AlertDialog>
      </>
    );
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="ghost">
          <TrashIcon aria-hidden="true" />
          Delete
        </Button>
      </AlertDialogTrigger>
      {content}
    </AlertDialog>
  );
}

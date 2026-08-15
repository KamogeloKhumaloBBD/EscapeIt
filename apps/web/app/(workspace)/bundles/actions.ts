"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type {
  CreateBundleActionState,
  DeleteBundleActionState,
  ReplaceBundleProvidersActionState,
  UpdateBundleActionState,
} from "@/app/(workspace)/bundles/action-state";
import { requestApi } from "@/lib/server/api-client";
import { apiErrorMessage } from "@/lib/server/api-error";
import {
  bundleDescriptionSchema,
  bundleNameSchema,
} from "@/lib/validation/integration-bundle";

function readString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function readStrings(formData: FormData, name: string): string[] {
  return formData
    .getAll(name)
    .filter((value): value is string => typeof value === "string");
}

function responseData(data: unknown): unknown {
  if (typeof data !== "object" || data === null || !("data" in data)) {
    return null;
  }

  return Reflect.get(data, "data");
}

function responseBundleId(data: unknown): string | null {
  const value = responseData(data);

  if (typeof value !== "object" || value === null || !("id" in value)) {
    return null;
  }

  const id = Reflect.get(value, "id");
  return typeof id === "string" ? id : null;
}

export async function createBundleAction(
  _previousState: CreateBundleActionState,
  formData: FormData,
): Promise<CreateBundleActionState> {
  const name = readString(formData, "name");
  const description = readString(formData, "description");
  const parsedName = bundleNameSchema.safeParse(name);

  if (!parsedName.success) {
    return {
      bundleId: null,
      description,
      fieldError: parsedName.error.issues[0]?.message ?? "Enter a valid name.",
      message: null,
      name,
      status: "error",
    };
  }

  const parsedDescription = bundleDescriptionSchema.safeParse(description);

  if (!parsedDescription.success) {
    return {
      bundleId: null,
      description,
      descriptionFieldError:
        parsedDescription.error.issues[0]?.message ??
        "Enter a valid description.",
      message: null,
      name: parsedName.data,
      status: "error",
    };
  }

  const submittedDescription =
    parsedDescription.data.length > 0 ? parsedDescription.data : undefined;

  const result = await requestApi("/api/integration-bundles", {
    body: { description: submittedDescription, name: parsedName.data },
    method: "POST",
  });

  if (result.status === 401) redirect("/sign-in");

  if (!result.ok) {
    return {
      bundleId: null,
      description,
      message: apiErrorMessage(
        result,
        "We couldn't create the bundle. Review its details and try again.",
      ),
      name: parsedName.data,
      status: "error",
    };
  }

  revalidatePath("/bundles");
  return {
    bundleId: responseBundleId(result.data),
    description: "",
    message: "Bundle created.",
    name: "",
    status: "success",
  };
}

export async function updateBundleAction(
  _previousState: UpdateBundleActionState,
  formData: FormData,
): Promise<UpdateBundleActionState> {
  const bundleId = readString(formData, "bundleId");
  const name = readString(formData, "name");
  const description = readString(formData, "description");
  const parsedName = bundleNameSchema.safeParse(name);

  if (!parsedName.success) {
    return {
      description,
      fieldError: parsedName.error.issues[0]?.message ?? "Enter a valid name.",
      message: null,
      name,
      status: "error",
    };
  }

  const parsedDescription = bundleDescriptionSchema.safeParse(description);

  if (!parsedDescription.success) {
    return {
      description,
      descriptionFieldError:
        parsedDescription.error.issues[0]?.message ??
        "Enter a valid description.",
      message: null,
      name: parsedName.data,
      status: "error",
    };
  }

  const submittedDescription =
    parsedDescription.data.length > 0 ? parsedDescription.data : null;

  const result = await requestApi(
    `/api/integration-bundles/${encodeURIComponent(bundleId)}`,
    {
      body: { description: submittedDescription, name: parsedName.data },
      method: "PUT",
    },
  );

  if (result.status === 401) redirect("/sign-in");

  if (!result.ok) {
    return {
      description,
      message: apiErrorMessage(
        result,
        "We couldn't update the bundle. Review its details and try again.",
      ),
      name: parsedName.data,
      status: "error",
    };
  }

  revalidatePath(`/bundles/${bundleId}`);
  revalidatePath("/bundles");
  return {
    description: submittedDescription ?? "",
    message: "Bundle updated.",
    name: parsedName.data,
    status: "success",
  };
}

export async function deleteBundleAction(
  _previousState: DeleteBundleActionState,
  formData: FormData,
): Promise<DeleteBundleActionState> {
  const bundleId = readString(formData, "bundleId");
  const result = await requestApi(
    `/api/integration-bundles/${encodeURIComponent(bundleId)}`,
    { method: "DELETE" },
  );

  if (result.status === 401) redirect("/sign-in");

  if (!result.ok) {
    return {
      message: apiErrorMessage(
        result,
        "The bundle could not be deleted. Refresh the page and try again.",
      ),
      status: "error",
    };
  }

  revalidatePath("/bundles");
  revalidatePath("/agent-setup");
  return { message: "Bundle deleted.", status: "success" };
}

export async function replaceBundleProvidersAction(
  _previousState: ReplaceBundleProvidersActionState,
  formData: FormData,
): Promise<ReplaceBundleProvidersActionState> {
  const bundleId = readString(formData, "bundleId");
  const providers = readStrings(formData, "providers");

  const result = await requestApi(
    `/api/integration-bundles/${encodeURIComponent(bundleId)}/providers`,
    { body: { providers }, method: "PUT" },
  );

  if (result.status === 401) redirect("/sign-in");

  if (!result.ok) {
    return {
      message: apiErrorMessage(
        result,
        "We couldn't update the bundle's providers. Review the selection and try again.",
      ),
      status: "error",
    };
  }

  revalidatePath(`/bundles/${bundleId}`);
  revalidatePath("/bundles");
  return { message: "Providers updated.", status: "success" };
}

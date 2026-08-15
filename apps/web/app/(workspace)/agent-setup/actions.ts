"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type {
  CreateMcpTokenActionState,
  RevokeMcpTokenActionState,
} from "@/app/(workspace)/agent-setup/action-state";
import { requestApi } from "@/lib/server/api-client";
import { apiErrorMessage } from "@/lib/server/api-error";
import {
  createdMcpTokenSchema,
  mcpTokenIdSchema,
  mcpTokenNameSchema,
} from "@/lib/validation/mcp-access";

function readString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function responseData(data: unknown): unknown {
  if (typeof data !== "object" || data === null || !("data" in data)) {
    return null;
  }

  return Reflect.get(data, "data");
}

export async function createMcpTokenAction(
  _previousState: CreateMcpTokenActionState,
  formData: FormData,
): Promise<CreateMcpTokenActionState> {
  const name = readString(formData, "name");
  const parsed = mcpTokenNameSchema.safeParse(name);

  if (!parsed.success) {
    return {
      fieldError:
        parsed.error.issues[0]?.message ?? "Enter a valid token name.",
      message: null,
      name,
      rawToken: null,
      status: "error",
    };
  }

  const bundleId = readString(formData, "bundleId");

  const result = await requestApi("/api/mcp-tokens", {
    body: {
      ...(bundleId === "" || bundleId === "none" ? {} : { bundleId }),
      name: parsed.data,
    },
    method: "POST",
  });

  if (result.status === 401) redirect("/sign-in");

  if (!result.ok) {
    return {
      message: apiErrorMessage(
        result,
        "We couldn't create the token. Review its name and bundle, then try again.",
      ),
      name: parsed.data,
      rawToken: null,
      status: "error",
    };
  }

  const created = createdMcpTokenSchema.safeParse(responseData(result.data));

  if (!created.success) {
    return {
      message: "The token was created but could not be displayed safely.",
      name: parsed.data,
      rawToken: null,
      status: "error",
    };
  }

  revalidatePath("/agent-setup");
  revalidatePath("/dashboard");
  return {
    message: "Token created.",
    name: "",
    rawToken: created.data.rawToken,
    status: "success",
  };
}

export async function revokeMcpTokenAction(
  _previousState: RevokeMcpTokenActionState,
  formData: FormData,
): Promise<RevokeMcpTokenActionState> {
  const parsed = mcpTokenIdSchema.safeParse(readString(formData, "tokenId"));

  if (!parsed.success) {
    return { message: "The token could not be revoked.", status: "error" };
  }

  const result = await requestApi(`/api/mcp-tokens/${parsed.data}`, {
    method: "DELETE",
  });

  if (result.status === 401) redirect("/sign-in");

  if (!result.ok) {
    return {
      message: apiErrorMessage(
        result,
        "The token could not be revoked. Refresh the page and try again.",
      ),
      status: "error",
    };
  }

  revalidatePath("/agent-setup");
  revalidatePath("/dashboard");
  return { message: "Token revoked.", status: "success" };
}

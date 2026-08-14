"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requestApi } from "@/lib/server/api-client";

export interface RevokeMcpConnectionState {
  message: string | null;
  status: "idle" | "error" | "success";
}

export interface UpdateMcpConnectionBundleState {
  message: string | null;
  status: "idle" | "error" | "success";
}

const consentIdSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z0-9_-]+$/);

const clientIdSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z0-9_-]+$/);

export async function revokeMcpConnectionAction(
  _previousState: RevokeMcpConnectionState,
  formData: FormData,
): Promise<RevokeMcpConnectionState> {
  const value = formData.get("consentId");
  const consentId = consentIdSchema.safeParse(
    typeof value === "string" ? value : "",
  );

  if (!consentId.success) {
    return { message: "This connection is invalid.", status: "error" };
  }

  const result = await requestApi(`/api/mcp-connections/${consentId.data}`, {
    method: "DELETE",
  });

  if (result.status === 401) {
    redirect("/sign-in");
  }

  if (!result.ok) {
    return {
      message: "We couldn't revoke this connection. Try again.",
      status: "error",
    };
  }

  revalidatePath("/account");
  revalidatePath("/agent-setup");
  return { message: "MCP client disconnected.", status: "success" };
}

export async function updateMcpConnectionBundleAction(
  _previousState: UpdateMcpConnectionBundleState,
  formData: FormData,
): Promise<UpdateMcpConnectionBundleState> {
  const clientIdValue = formData.get("clientId");
  const clientId = clientIdSchema.safeParse(
    typeof clientIdValue === "string" ? clientIdValue : "",
  );

  if (!clientId.success) {
    return { message: "This connection is invalid.", status: "error" };
  }

  const bundleIdValue = formData.get("bundleId");
  const bundleId =
    typeof bundleIdValue === "string" &&
    bundleIdValue !== "" &&
    bundleIdValue !== "none"
      ? bundleIdValue
      : null;

  const result = await requestApi(
    `/api/mcp-connections/${clientId.data}/bundle`,
    { body: { bundleId }, method: "PUT" },
  );

  if (result.status === 401) {
    redirect("/sign-in");
  }

  if (!result.ok) {
    return {
      message: "We couldn't update this connection's bundle. Try again.",
      status: "error",
    };
  }

  revalidatePath("/account");
  revalidatePath("/agent-setup");
  return { message: "Connection bundle updated.", status: "success" };
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { CustomMcpActionState } from "./action-state";
import { requestApi } from "@/lib/server/api-client";
import { apiErrorMessage } from "@/lib/server/api-error";
import {
  customMcpEndpointSchema,
  customMcpNameSchema,
} from "@/lib/validation/custom-mcp";

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function dataId(value: unknown): string | null {
  if (typeof value !== "object" || value === null || !("data" in value))
    return null;
  const data = Reflect.get(value, "data");
  if (typeof data !== "object" || data === null) return null;
  const id: unknown = (data as { id?: unknown }).id;
  return typeof id === "string" ? id : null;
}

export async function createCustomMcpAction(
  _state: CustomMcpActionState,
  formData: FormData,
): Promise<CustomMcpActionState> {
  const name = customMcpNameSchema.safeParse(text(formData, "name"));
  const endpointUrl = customMcpEndpointSchema.safeParse(
    text(formData, "endpointUrl"),
  );
  if (!name.success || !endpointUrl.success) {
    return {
      fieldErrors: {
        ...(name.success
          ? {}
          : { name: name.error.issues[0]?.message ?? "Enter a valid name." }),
        ...(endpointUrl.success
          ? {}
          : {
              endpointUrl:
                endpointUrl.error.issues[0]?.message ??
                "Enter a valid HTTPS endpoint.",
            }),
      },
      message: "Review the server details and try again.",
      status: "error",
    };
  }
  const result = await requestApi("/api/custom-mcp-servers", {
    body: { endpointUrl: endpointUrl.data, name: name.data },
    method: "POST",
  });
  if (result.status === 401) redirect("/sign-in");
  if (!result.ok) {
    return {
      message: apiErrorMessage(
        result,
        "We couldn't install this Custom MCP server.",
      ),
      status: "error",
    };
  }
  const id = dataId(result.data);
  revalidatePath("/integrations");
  if (id !== null) redirect(`/integrations/custom/${id}`);
  return { message: "Custom MCP server installed.", status: "success" };
}

const mutationSchema = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("rename"), name: customMcpNameSchema }),
  z.object({
    intent: z.literal("connect-bearer"),
    token: z
      .string()
      .min(1, "Enter your personal bearer token.")
      .max(8192, "Bearer tokens must be 8,192 characters or fewer."),
  }),
  z.object({ intent: z.literal("disconnect") }),
  z.object({ intent: z.literal("validate") }),
  z.object({ intent: z.literal("refresh") }),
  z.object({
    intent: z.literal("save-tools"),
    toolIds: z.array(z.uuid()).max(100),
  }),
  z.object({ intent: z.literal("archive") }),
]);

export async function customMcpAction(
  _state: CustomMcpActionState,
  formData: FormData,
): Promise<CustomMcpActionState> {
  const serverId = text(formData, "serverId");
  const intent = text(formData, "intent");
  const raw =
    intent === "rename"
      ? { intent, name: text(formData, "name") }
      : intent === "connect-bearer"
        ? { intent, token: text(formData, "token") }
        : intent === "save-tools"
          ? { intent, toolIds: formData.getAll("toolIds") }
          : { intent };
  const parsed = z.uuid().safeParse(serverId);
  const mutation = mutationSchema.safeParse(raw);
  if (!parsed.success) {
    return { message: "Review the form and try again.", status: "error" };
  }
  if (!mutation.success) {
    const issue = mutation.error.issues[0];
    const field = issue?.path[0];
    return {
      ...(field === "name" || field === "token"
        ? {
            fieldErrors: {
              [field]: issue?.message ?? "Review this field and try again.",
            },
          }
        : {}),
      message: "Review the form and try again.",
      status: "error",
    };
  }
  const base =
    `/api/custom-mcp-servers/${encodeURIComponent(serverId)}` as const;
  let result;
  switch (mutation.data.intent) {
    case "rename":
      result = await requestApi(base, {
        body: { name: mutation.data.name },
        method: "PATCH",
      });
      break;
    case "connect-bearer":
      result = await requestApi(`${base}/account/bearer`, {
        body: { token: mutation.data.token },
        method: "PUT",
      });
      break;
    case "disconnect":
      result = await requestApi(`${base}/account`, { method: "DELETE" });
      break;
    case "validate":
      result = await requestApi(`${base}/validate`, { method: "POST" });
      break;
    case "refresh":
      result = await requestApi(`${base}/tools/refresh`, { method: "POST" });
      break;
    case "save-tools":
      result = await requestApi(`${base}/tools`, {
        body: { toolIds: mutation.data.toolIds },
        method: "PUT",
      });
      break;
    case "archive":
      result = await requestApi(base, { method: "DELETE" });
      break;
  }
  if (result.status === 401) redirect("/sign-in");
  if (!result.ok) {
    return {
      message: apiErrorMessage(
        result,
        "We couldn't update this Custom MCP server.",
      ),
      status: "error",
    };
  }
  if (mutation.data.intent !== "save-tools") {
    revalidatePath("/integrations");
    revalidatePath(`/integrations/custom/${serverId}`);
    revalidatePath("/bundles");
  }
  if (mutation.data.intent === "archive") redirect("/integrations?tab=custom");
  const messages: Record<(typeof mutation.data)["intent"], string> = {
    "connect-bearer": "Your bearer credential is connected.",
    disconnect: "Your Custom MCP account was disconnected.",
    refresh:
      "Tool catalogue refreshed. Review changed tools before enabling them.",
    rename: "Server renamed.",
    "save-tools": "Approved tools updated.",
    validate: "The connection is healthy.",
  };
  return { message: messages[mutation.data.intent], status: "success" };
}

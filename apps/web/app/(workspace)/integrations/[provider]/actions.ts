"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { IntegrationActionState } from "@/app/(workspace)/integrations/[provider]/action-state";
import { requestApi } from "@/lib/server/api-client";

const actionSchema = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("disconnect-account"), provider: z.string() }),
  z.object({
    intent: z.literal("disconnect-installation"),
    provider: z.string(),
  }),
  z.object({ intent: z.literal("validate"), provider: z.string() }),
  z.object({
    externalId: z.string().min(1),
    intent: z.literal("select-resource"),
    provider: z.string(),
  }),
  z.object({
    externalIds: z.array(z.string().min(1)).max(100),
    intent: z.literal("save-scopes"),
    provider: z.string(),
  }),
  z.object({
    intent: z.literal("save-mcp-tools"),
    provider: z.string(),
    toolNames: z.array(z.string().min(3).max(128)).max(100),
  }),
]);

function safeProvider(value: FormDataEntryValue | null): string {
  return typeof value === "string" && /^[a-z][a-z0-9-]{0,62}$/.test(value)
    ? value
    : "";
}

export async function integrationAction(
  _previousState: IntegrationActionState,
  formData: FormData,
): Promise<IntegrationActionState> {
  const intent = formData.get("intent");
  const provider = safeProvider(formData.get("provider"));
  const raw =
    intent === "save-scopes"
      ? { externalIds: formData.getAll("externalIds"), intent, provider }
      : intent === "save-mcp-tools"
        ? { intent, provider, toolNames: formData.getAll("toolNames") }
        : intent === "select-resource"
          ? { externalId: formData.get("externalId"), intent, provider }
          : { intent, provider };
  const parsed = actionSchema.safeParse(raw);

  if (!parsed.success) {
    return {
      message: "Review the form and try again.",
      status: "error",
    };
  }

  const encodedProvider = encodeURIComponent(parsed.data.provider);
  let result;

  switch (parsed.data.intent) {
    case "disconnect-account":
      result = await requestApi(
        `/api/integrations/${encodedProvider}/account`,
        { method: "DELETE" },
      );
      break;
    case "disconnect-installation":
      result = await requestApi(`/api/integrations/${encodedProvider}`, {
        method: "DELETE",
      });
      break;
    case "save-scopes":
      result = await requestApi(`/api/integrations/${encodedProvider}/scopes`, {
        body: { externalIds: parsed.data.externalIds },
        method: "PUT",
      });
      break;
    case "save-mcp-tools":
      result = await requestApi(
        `/api/integrations/${encodedProvider}/mcp-tools`,
        {
          body: { toolNames: parsed.data.toolNames },
          method: "PUT",
        },
      );
      break;
    case "select-resource":
      result = await requestApi(
        `/api/integrations/${encodedProvider}/installation`,
        {
          body: { externalId: parsed.data.externalId },
          method: "PUT",
        },
      );
      break;
    case "validate":
      result = await requestApi(
        `/api/integrations/${encodedProvider}/validate`,
        { method: "POST" },
      );
      break;
  }

  if (result.status === 401) {
    redirect("/sign-in");
  }

  if (!result.ok) {
    return {
      message:
        result.status === 403
          ? "You don't have permission to make this change."
          : "We couldn't update the integration. Please try again.",
      status: "error",
    };
  }

  revalidatePath("/dashboard");
  revalidatePath("/integrations");
  revalidatePath(`/integrations/${parsed.data.provider}`);

  const messages: Record<(typeof parsed.data)["intent"], string> = {
    "disconnect-account": "Your provider account was disconnected.",
    "disconnect-installation": "The workspace integration was disconnected.",
    "save-scopes": "Workspace access was updated.",
    "save-mcp-tools": "MCP tool access was updated.",
    "select-resource": "The workspace resource was selected.",
    validate: "The connection is healthy.",
  };

  return { message: messages[parsed.data.intent], status: "success" };
}

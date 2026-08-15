"use server";

import { redirect } from "next/navigation";

import type { OnboardingActionState } from "@/app/onboarding/onboarding-state";
import { requestApi } from "@/lib/server/api-client";
import { apiErrorMessage } from "@/lib/server/api-error";
import { workspaceNameSchema } from "@/lib/validation/workspace";

const unavailableMessage =
  "We couldn't create your workspace right now. Please try again.";

export async function createWorkspaceAction(
  _previousState: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  const rawName = formData.get("name");
  const name = typeof rawName === "string" ? rawName : "";
  const parsed = workspaceNameSchema.safeParse(name);

  if (!parsed.success) {
    return {
      fieldErrors: {
        name: parsed.error.issues[0]?.message ?? "Enter a workspace name.",
      },
      message: null,
      name,
      status: "error",
    };
  }

  const result = await requestApi("/api/workspaces", {
    body: { name: parsed.data },
    method: "POST",
  });

  if (result.status === 401) {
    redirect("/sign-in");
  }

  if (result.ok || result.status === 409) {
    redirect("/dashboard");
  }

  return {
    fieldErrors: {},
    message: apiErrorMessage(result, unavailableMessage),
    name: parsed.data,
    status: "error",
  };
}

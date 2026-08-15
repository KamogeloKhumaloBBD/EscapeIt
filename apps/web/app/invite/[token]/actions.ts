"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { AcceptInvitationActionState } from "@/app/invite/[token]/action-state";
import { requestApi } from "@/lib/server/api-client";
import { apiErrorMessage } from "@/lib/server/api-error";
import { invitationTokenSchema } from "@/lib/validation/member";

export async function acceptInvitationAction(
  _previousState: AcceptInvitationActionState,
  formData: FormData,
): Promise<AcceptInvitationActionState> {
  const value = formData.get("token");
  const parsed = invitationTokenSchema.safeParse(
    typeof value === "string" ? value : "",
  );

  if (!parsed.success) {
    return {
      message: "This invitation is no longer available.",
      status: "error",
    };
  }

  const result = await requestApi("/api/invitations/accept", {
    body: { token: parsed.data },
    method: "POST",
  });

  if (result.status === 401) {
    redirect(
      `/sign-in?returnTo=${encodeURIComponent(`/invite/${parsed.data}`)}`,
    );
  }

  if (!result.ok) {
    return {
      message: apiErrorMessage(
        result,
        "This invitation is invalid or has expired. Ask the workspace owner for a new invitation.",
      ),
      status: "error",
    };
  }

  revalidatePath("/dashboard");
  revalidatePath("/members");
  redirect("/dashboard");
}

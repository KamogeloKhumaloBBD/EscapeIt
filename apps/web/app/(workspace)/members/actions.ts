"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import type {
  InviteMemberActionState,
  RevokeInvitationActionState,
} from "@/app/(workspace)/members/action-state";
import { requestApi } from "@/lib/server/api-client";
import { invitationEmailSchema } from "@/lib/validation/member";

const invitationIdSchema = z.uuid();

function readString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function apiErrorCode(data: unknown): string | null {
  if (typeof data !== "object" || data === null || !("error" in data)) {
    return null;
  }

  const error = Reflect.get(data, "error");
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return null;
  }

  const code = Reflect.get(error, "code");
  return typeof code === "string" ? code : null;
}

export async function inviteMemberAction(
  _previousState: InviteMemberActionState,
  formData: FormData,
): Promise<InviteMemberActionState> {
  const email = readString(formData, "email");
  const parsed = invitationEmailSchema.safeParse(email);

  if (!parsed.success) {
    return {
      email,
      fieldError:
        parsed.error.issues[0]?.message ?? "Enter a valid email address.",
      message: null,
      status: "error",
    };
  }

  const result = await requestApi("/api/invitations", {
    body: { email: parsed.data },
    method: "POST",
  });

  if (result.status === 401) redirect("/sign-in");

  if (!result.ok) {
    const code = apiErrorCode(result.data);
    return {
      email: parsed.data,
      ...(result.status === 409
        ? {
            fieldError:
              code === "CONFLICT"
                ? "That address is already a member or has a pending invitation."
                : "That address cannot be invited.",
          }
        : {}),
      message:
        result.status === 409
          ? null
          : "We couldn't send the invitation. Please try again.",
      status: "error",
    };
  }

  revalidatePath("/members");
  revalidatePath("/dashboard");
  return {
    email: "",
    message: `Invitation sent to ${parsed.data}.`,
    status: "success",
  };
}

export async function revokeInvitationAction(
  _previousState: RevokeInvitationActionState,
  formData: FormData,
): Promise<RevokeInvitationActionState> {
  const parsed = invitationIdSchema.safeParse(
    readString(formData, "invitationId"),
  );

  if (!parsed.success) {
    return {
      message: "The invitation could not be revoked.",
      status: "error",
    };
  }

  const result = await requestApi(`/api/invitations/${parsed.data}`, {
    method: "DELETE",
  });

  if (result.status === 401) redirect("/sign-in");

  if (!result.ok) {
    return {
      message: "The invitation could not be revoked. Refresh and try again.",
      status: "error",
    };
  }

  revalidatePath("/members");
  return { message: "Invitation revoked.", status: "success" };
}

import "server-only";

import { cache } from "react";

import { requestApi } from "@/lib/server/api-client";
import { extractDataField } from "@/lib/server/api-state";
import { apiErrorMessage, readPublicApiError } from "@/lib/server/api-error";
import {
  invitationPreviewSchema,
  memberListSchema,
  type InvitationPreview,
  type MemberList,
} from "@/lib/validation/member";

type InvitationFailure = "already-member" | "email-mismatch" | "unavailable";

export type MemberListState =
  | { data: MemberList; status: "available" }
  | { status: "anonymous" }
  | { message: string; status: "unavailable" }
  | { status: "without-workspace" };

export type InvitationState =
  | { data: InvitationPreview; status: "available" }
  | { reason: InvitationFailure; status: "blocked" }
  | { status: "anonymous" };

export const getMemberListState = cache(async (): Promise<MemberListState> => {
  const result = await requestApi("/api/members");

  if (result.status === 401) return { status: "anonymous" };
  if (result.status === 404) return { status: "without-workspace" };
  if (!result.ok) {
    return {
      message: apiErrorMessage(
        result,
        "We couldn't load workspace members. Refresh the page to try again.",
      ),
      status: "unavailable",
    };
  }

  const parsed = memberListSchema.safeParse(extractDataField(result.data));
  return parsed.success
    ? { data: parsed.data, status: "available" }
    : {
        message:
          "The member list response was invalid. Refresh the page to try again.",
        status: "unavailable",
      };
});

export async function getInvitationState(
  token: string,
): Promise<InvitationState> {
  const result = await requestApi("/api/invitations/preview", {
    body: { token },
    method: "POST",
  });

  if (result.status === 401) return { status: "anonymous" };

  if (!result.ok) {
    const code = readPublicApiError(result.data)?.code ?? null;
    const reason: InvitationFailure =
      code === "INVITATION_EMAIL_MISMATCH"
        ? "email-mismatch"
        : code === "WORKSPACE_MEMBERSHIP_EXISTS"
          ? "already-member"
          : "unavailable";
    return { reason, status: "blocked" };
  }

  const parsed = invitationPreviewSchema.safeParse(
    extractDataField(result.data),
  );
  return parsed.success
    ? { data: parsed.data, status: "available" }
    : { reason: "unavailable", status: "blocked" };
}

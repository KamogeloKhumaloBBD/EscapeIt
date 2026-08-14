import "server-only";

import { cache } from "react";

import { requestApi } from "@/lib/server/api-client";
import { extractDataField } from "@/lib/server/api-state";
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
  | { status: "unavailable" }
  | { status: "without-workspace" };

export type InvitationState =
  | { data: InvitationPreview; status: "available" }
  | { reason: InvitationFailure; status: "blocked" }
  | { status: "anonymous" };

function errorCode(data: unknown): string | null {
  if (typeof data !== "object" || data === null || !("error" in data)) {
    return null;
  }

  const error = Reflect.get(data, "error");
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof Reflect.get(error, "code") === "string"
    ? (Reflect.get(error, "code") as string)
    : null;
}

export const getMemberListState = cache(async (): Promise<MemberListState> => {
  const result = await requestApi("/api/members");

  if (result.status === 401) return { status: "anonymous" };
  if (result.status === 404) return { status: "without-workspace" };
  if (!result.ok) return { status: "unavailable" };

  const parsed = memberListSchema.safeParse(extractDataField(result.data));
  return parsed.success
    ? { data: parsed.data, status: "available" }
    : { status: "unavailable" };
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
    const code = errorCode(result.data);
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

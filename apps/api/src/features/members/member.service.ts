import { createHash, randomBytes } from "node:crypto";

import {
  normalizeEmail,
  RepositoryError,
  type AcceptInvitationInput,
  type CreateInvitationInput,
  type CurrentWorkspace,
  type WorkspaceInvitation,
  type WorkspaceInvitationPreview,
  type WorkspaceMemberSummary,
  type WorkspaceMembership,
} from "@context-layer/db";

import { HttpError } from "../../errors";
import type {
  InvitationPreviewContract,
  MembersContract,
} from "./member.contracts";
import type { InvitationEmailSender } from "./invitation-email";

const invitationLifetimeMs = 7 * 24 * 60 * 60 * 1_000;

interface MemberRepository {
  acceptInvitation(input: AcceptInvitationInput): Promise<WorkspaceMembership>;
  createInvitation(input: CreateInvitationInput): Promise<WorkspaceInvitation>;
  findCurrentWorkspace(userId: string): Promise<CurrentWorkspace | null>;
  findInvitation(
    tokenHash: Uint8Array,
  ): Promise<WorkspaceInvitationPreview | null>;
  listMembers(
    workspaceId: string,
    membershipId: string,
  ): Promise<WorkspaceMemberSummary[]>;
  listPendingInvitations(
    workspaceId: string,
    ownerMembershipId: string,
  ): Promise<WorkspaceInvitation[]>;
  markDeliveryFailed(
    workspaceId: string,
    invitationId: string,
    ownerMembershipId: string,
    correlationId: string,
  ): Promise<void>;
  revokeInvitation(
    workspaceId: string,
    invitationId: string,
    ownerMembershipId: string,
    correlationId: string,
  ): Promise<boolean>;
}

export interface MemberServiceDependencies {
  emailSender: InvitationEmailSender;
  publicAppUrl: string;
  repository: MemberRepository;
}

function requireWorkspace(current: CurrentWorkspace | null): CurrentWorkspace {
  if (current === null) {
    throw new HttpError(
      404,
      "WORKSPACE_NOT_FOUND",
      "The user does not belong to a workspace.",
    );
  }

  return current;
}

function requireActiveInvitation(
  invitation: WorkspaceInvitationPreview | null,
): WorkspaceInvitationPreview {
  if (invitation === null) {
    throw new HttpError(
      410,
      "INVITATION_UNAVAILABLE",
      "This invitation is no longer available.",
    );
  }

  if (
    invitation.acceptedAt !== null ||
    invitation.revokedAt !== null ||
    invitation.expiresAt.getTime() <= Date.now()
  ) {
    throw new HttpError(
      410,
      "INVITATION_UNAVAILABLE",
      "This invitation is no longer available.",
    );
  }

  return invitation;
}

function tokenHash(token: string): Buffer {
  return createHash("sha256").update(token, "utf8").digest();
}

export function createMemberService({
  emailSender,
  publicAppUrl,
  repository,
}: MemberServiceDependencies) {
  async function invitationForUser(
    userId: string,
    userEmail: string,
    token: string,
  ): Promise<WorkspaceInvitationPreview> {
    const invitation = requireActiveInvitation(
      await repository.findInvitation(tokenHash(token)),
    );

    if (normalizeEmail(userEmail) !== invitation.normalizedEmail) {
      throw new HttpError(
        403,
        "INVITATION_EMAIL_MISMATCH",
        "Sign in with the email address that received this invitation.",
      );
    }

    if ((await repository.findCurrentWorkspace(userId)) !== null) {
      throw new HttpError(
        409,
        "WORKSPACE_MEMBERSHIP_EXISTS",
        "This account already belongs to a workspace.",
      );
    }

    return invitation;
  }

  return {
    async acceptInvitation(
      userId: string,
      userEmail: string,
      token: string,
      correlationId: string,
    ): Promise<void> {
      await invitationForUser(userId, userEmail, token);

      try {
        await repository.acceptInvitation({
          correlationId,
          tokenHash: tokenHash(token),
          userId,
        });
      } catch (error) {
        if (error instanceof RepositoryError) {
          if (error.code === "forbidden") {
            throw new HttpError(
              403,
              "INVITATION_EMAIL_MISMATCH",
              "Sign in with the email address that received this invitation.",
            );
          }

          if (error.code === "conflict" || error.code === "not_found") {
            throw new HttpError(
              410,
              "INVITATION_UNAVAILABLE",
              "This invitation is no longer available.",
            );
          }
        }

        throw error;
      }
    },

    async createInvitation(
      userId: string,
      email: string,
      correlationId: string,
    ): Promise<void> {
      const current = requireWorkspace(
        await repository.findCurrentWorkspace(userId),
      );

      if (current.membership.role !== "owner") {
        throw new HttpError(
          403,
          "FORBIDDEN",
          "Workspace owner access is required.",
        );
      }

      const token = randomBytes(32).toString("base64url");
      const invitation = await repository.createInvitation({
        correlationId,
        email,
        expiresAt: new Date(Date.now() + invitationLifetimeMs),
        invitedByMembershipId: current.membership.id,
        tokenHash: tokenHash(token),
        workspaceId: current.workspace.id,
      });
      const invitationUrl = new URL(
        `/invite/${encodeURIComponent(token)}`,
        publicAppUrl,
      ).toString();
      const delivered = await emailSender.sendInvitation({
        invitationUrl,
        recipientEmail: invitation.normalizedEmail,
        workspaceName: current.workspace.name,
      });

      if (!delivered) {
        await repository.markDeliveryFailed(
          current.workspace.id,
          invitation.id,
          current.membership.id,
          correlationId,
        );
        throw new HttpError(
          503,
          "INVITATION_DELIVERY_FAILED",
          "The invitation could not be delivered. Please try again.",
        );
      }
    },

    async getInvitation(
      userId: string,
      userEmail: string,
      token: string,
    ): Promise<InvitationPreviewContract> {
      const invitation = await invitationForUser(userId, userEmail, token);
      return {
        expiresAt: invitation.expiresAt.toISOString(),
        inviterName: invitation.inviterName,
        workspaceName: invitation.workspaceName,
      };
    },

    async listMembers(userId: string): Promise<MembersContract> {
      const current = requireWorkspace(
        await repository.findCurrentWorkspace(userId),
      );
      const members = await repository.listMembers(
        current.workspace.id,
        current.membership.id,
      );
      const pendingInvitations =
        current.membership.role === "owner"
          ? await repository.listPendingInvitations(
              current.workspace.id,
              current.membership.id,
            )
          : null;

      return {
        members: members.map((member) => ({
          ...member,
          joinedAt: member.joinedAt.toISOString(),
        })),
        pendingInvitations:
          pendingInvitations?.map((invitation) => ({
            createdAt: invitation.createdAt.toISOString(),
            email: invitation.normalizedEmail,
            expiresAt: invitation.expiresAt.toISOString(),
            id: invitation.id,
          })) ?? null,
        permissions: { canInvite: current.membership.role === "owner" },
        role: current.membership.role,
        workspaceName: current.workspace.name,
      };
    },

    async revokeInvitation(
      userId: string,
      invitationId: string,
      correlationId: string,
    ): Promise<void> {
      const current = requireWorkspace(
        await repository.findCurrentWorkspace(userId),
      );

      if (current.membership.role !== "owner") {
        throw new HttpError(
          403,
          "FORBIDDEN",
          "Workspace owner access is required.",
        );
      }

      const revoked = await repository.revokeInvitation(
        current.workspace.id,
        invitationId,
        current.membership.id,
        correlationId,
      );

      if (!revoked) {
        throw new HttpError(
          404,
          "INVITATION_NOT_FOUND",
          "The invitation was not found.",
        );
      }
    },
  };
}

export interface MemberContract {
  email: string;
  joinedAt: string;
  membershipId: string;
  name: string;
  role: "member" | "owner";
}

export interface PendingInvitationContract {
  createdAt: string;
  email: string;
  expiresAt: string;
  id: string;
}

export interface MembersContract {
  members: readonly MemberContract[];
  pendingInvitations: readonly PendingInvitationContract[] | null;
  permissions: {
    canInvite: boolean;
  };
  role: "member" | "owner";
  workspaceName: string;
}

export interface InvitationPreviewContract {
  expiresAt: string;
  inviterName: string;
  workspaceName: string;
}

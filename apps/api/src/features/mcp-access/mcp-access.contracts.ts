export interface McpTokenContract {
  bundle: { id: string; name: string } | null;
  createdAt: string;
  creator: {
    email: string;
    membershipId: string;
    name: string;
  };
  id: string;
  isCurrentMember: boolean;
  lastUsedAt: string | null;
  name: string;
  permissions: {
    canRevoke: boolean;
  };
  prefix: string;
  revokedAt: string | null;
  status: "active" | "revoked";
}

export interface McpTokenListContract {
  currentMembershipId: string;
  role: "member" | "owner";
  tokens: readonly McpTokenContract[];
}

export interface CreatedMcpTokenContract {
  rawToken: string;
  token: McpTokenContract;
}

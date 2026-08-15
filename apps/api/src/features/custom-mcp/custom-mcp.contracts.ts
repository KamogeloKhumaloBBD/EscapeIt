export interface CustomMcpAccountContract {
  authMethod: "bearer" | "oauth";
  lastValidatedAt: string | null;
  status: "connected" | "disconnected" | "error";
}

export interface CustomMcpToolContract {
  available: boolean;
  description: string;
  enabled: boolean;
  exposedName: string;
  id: string;
  kind: "read" | "write";
  title: string;
  upstreamName: string;
}

export interface CustomMcpServerContract {
  authenticationKind: "bearer" | "none" | "oauth";
  currentAccount: CustomMcpAccountContract | null;
  endpointUrl: string;
  id: string;
  lastValidatedAt: string | null;
  name: string;
  nextStep: "connect_account" | "ready" | "select_tools" | "wait_for_owner";
  permissions: {
    canConnectAccount: boolean;
    canManageServer: boolean;
    canManageTools: boolean;
  };
  slug: string;
  status: "connected" | "disconnected" | "error";
  tools: readonly CustomMcpToolContract[];
}

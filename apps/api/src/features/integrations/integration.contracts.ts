export interface IntegrationResourceContract {
  externalId: string;
  name: string;
  url: string;
}

export interface IntegrationAccountContract {
  displayName: string | null;
  lastValidatedAt: string | null;
  status: "connected" | "disconnected" | "error";
}

export interface IntegrationInstallationContract {
  lastValidatedAt: string | null;
  resource: IntegrationResourceContract | null;
  selectedScopeCount: number;
  status: "connected" | "disconnected" | "error";
}

export interface IntegrationPermissionsContract {
  canConnectAccount: boolean;
  canManageInstallation: boolean;
  canManageScopes: boolean;
}

export interface IntegrationSummaryContract {
  attention: string | null;
  capabilities: readonly string[];
  currentAccount: IntegrationAccountContract | null;
  description: string;
  displayName: string;
  installation: IntegrationInstallationContract | null;
  nextStep:
    | "connect_account"
    | "connect_provider"
    | "ready"
    | "select_scopes"
    | "select_site"
    | "wait_for_owner";
  permissions: IntegrationPermissionsContract;
  provider: string;
}

export interface IntegrationDetailContract extends IntegrationSummaryContract {
  selectedScopes: readonly IntegrationScopeContract[];
}

export interface IntegrationScopeContract {
  displayName: string;
  externalId: string;
  scopeKey: string;
}

export interface ScopeDiscoveryContract {
  items: readonly IntegrationScopeContract[];
  nextCursor: string | null;
}

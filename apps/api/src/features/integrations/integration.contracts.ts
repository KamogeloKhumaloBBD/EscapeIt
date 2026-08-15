export interface IntegrationResourceContract {
  externalId: string;
  name: string;
  url: string;
}

export interface IntegrationAccountContract {
  grantedScopes: readonly string[] | null;
  lastValidatedAt: string | null;
  status: "connected" | "disconnected" | "error";
}

export interface IntegrationInstallationContract {
  enabledMcpToolCount: number;
  lastValidatedAt: string | null;
  resource: IntegrationResourceContract | null;
  selectedScopeCount: number;
  status: "connected" | "disconnected" | "error";
}

export interface IntegrationPermissionsContract {
  canConnectAccount: boolean;
  canManageInstallation: boolean;
  canManageNotifications: boolean;
  canManageNotificationChannels: boolean;
  canManageScopes: boolean;
  canManageMcpTools: boolean;
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
    | "select_tools"
    | "select_scopes"
    | "select_resource"
    | "wait_for_owner";
  permissions: IntegrationPermissionsContract;
  presentation: {
    accountLabel?: string;
    resourceLabel?: string;
    scopeLabels?: { plural: string; singular: string };
  };
  provider: string;
  resourceSelection?: "application" | "authorization";
}

export interface IntegrationNotificationEventContract {
  displayName: string;
  enabled: boolean;
  key: string;
}

export interface IntegrationDetailContract extends IntegrationSummaryContract {
  mcpTools: readonly IntegrationMcpToolContract[];
  notificationEvents: readonly IntegrationNotificationEventContract[];
  /**
   * Where the member goes to authorise event delivery, for providers that
   * cannot be set up through OAuth alone. Confluence Cloud has no way for an
   * OAuth app to subscribe to events, so its events arrive through a separate
   * Forge app the site admin approves once. Null when nothing extra is needed.
   */
  notificationSetupUrl: string | null;
  selectedScopes: readonly IntegrationScopeContract[];
}

export interface IntegrationMcpToolContract {
  description: string;
  displayName: string;
  enabled: boolean;
  kind: "read" | "write";
  name: string;
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

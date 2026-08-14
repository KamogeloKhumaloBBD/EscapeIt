export interface IntegrationBundleProviderContract {
  displayName: string;
  provider: string;
  status: "connected" | "disconnected" | "error";
}

export interface IntegrationBundleContract {
  createdAt: string;
  description: string | null;
  id: string;
  name: string;
  permissions: {
    canManage: boolean;
  };
  providers: readonly IntegrationBundleProviderContract[];
  updatedAt: string;
}

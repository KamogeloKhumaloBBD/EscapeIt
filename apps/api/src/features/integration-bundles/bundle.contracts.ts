export interface IntegrationBundleProviderContract {
  displayName: string;
  provider: string;
  status: "connected" | "disconnected" | "error";
}

export interface IntegrationBundleContract {
  createdAt: string;
  creator: {
    email: string;
    membershipId: string;
    name: string;
  };
  description: string | null;
  id: string;
  name: string;
  permissions: {
    canDelete: boolean;
    canEdit: boolean;
  };
  providers: readonly IntegrationBundleProviderContract[];
  updatedAt: string;
}

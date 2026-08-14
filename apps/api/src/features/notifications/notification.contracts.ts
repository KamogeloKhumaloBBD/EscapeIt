export interface NotificationChannelContract {
  id: string;
  lastErrorCode: string | null;
  lastValidatedAt: string | null;
  name: string;
  provider: string;
  sourceProviders: readonly string[];
  status: "connected" | "disconnected" | "error";
}

export interface NotificationPreferenceContract {
  defaultEnabled: boolean;
  displayName: string;
  enabled: boolean;
  eventKey: string;
}

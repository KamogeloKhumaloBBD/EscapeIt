import type { JsonObject, ProviderKey, ScopeKey } from "@context-layer/db";

export interface OAuthCredentials extends JsonObject {
  accessToken: string;
  expiresAt: string;
  refreshToken: string;
  scopes: readonly string[];
}

export interface ProviderIdentity {
  displayName: string;
  externalAccountId: string;
}

export interface ProviderResource {
  externalId: string;
  name: string;
  url: string;
}

export interface DiscoveredScope {
  displayName: string;
  externalId: string;
  externalKey: string | null;
  scopeKey: ScopeKey;
}

export interface ScopeDiscoveryPage {
  items: readonly DiscoveredScope[];
  nextCursor: string | null;
}

export interface IntegrationAdapter {
  buildAuthorizationUrl(state: string): string;
  buildInstallationAuthorizationUrl?(state: string): string;
  discoverResources(
    credentials: OAuthCredentials,
  ): Promise<readonly ProviderResource[]>;
  discoverScopes(
    credentials: OAuthCredentials,
    resource: ProviderResource,
    query: string,
    cursor: string | null,
  ): Promise<ScopeDiscoveryPage>;
  exchangeAuthorizationCode(code: string): Promise<OAuthCredentials>;
  getIdentity(credentials: OAuthCredentials): Promise<ProviderIdentity>;
  provider: ProviderKey;
  refreshCredentials(credentials: OAuthCredentials): Promise<OAuthCredentials>;
  registerWebhooks?(
    credentials: OAuthCredentials,
    resource: ProviderResource,
    callbackUrl: string,
    selectedScopes: readonly DiscoveredScope[],
  ): Promise<string | null>;
  resolveScopes(
    credentials: OAuthCredentials,
    resource: ProviderResource,
    externalIds: readonly string[],
  ): Promise<readonly DiscoveredScope[]>;
  /**
   * Removes webhooks previously created by `registerWebhooks`, given the
   * registration id it returned. Called before re-registering and on
   * disconnect, so that deselecting a scope stops its deliveries rather than
   * leaving a webhook posting to a token that still resolves.
   *
   * Cleanup is best effort: a webhook already deleted at the provider, or one
   * the member can no longer administer, must not prevent the disconnect.
   */
  unregisterWebhooks?(
    credentials: OAuthCredentials,
    resource: ProviderResource,
    registrationId: string,
  ): Promise<void>;
}

export class ProviderAdapterError extends Error {
  readonly code:
    | "authorization_expired"
    | "content_too_large"
    | "forbidden"
    | "inaccessible_resource"
    | "invalid_request"
    | "invalid_response"
    | "not_found"
    | "temporarily_unavailable"
    | "unsupported_content";

  constructor(
    code: ProviderAdapterError["code"],
    message = "The provider request could not be completed.",
    readonly providerStatus?: number,
  ) {
    super(message);
    this.name = "ProviderAdapterError";
    this.code = code;
  }
}

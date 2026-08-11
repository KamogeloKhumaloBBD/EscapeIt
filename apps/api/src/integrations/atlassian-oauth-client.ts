import { z } from "zod";

import {
  ProviderAdapterError,
  type OAuthCredentials,
  type ProviderIdentity,
  type ProviderResource,
} from "./integration-adapter";

const tokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  refresh_token: z.string().min(1),
  scope: z.string().default(""),
});

const identitySchema = z.object({
  account_id: z.string().min(1),
  name: z.string().min(1),
});

const resourceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  scopes: z.array(z.string()),
  url: z.url(),
});

export interface AtlassianOAuthClientConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: readonly string[];
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new ProviderAdapterError("invalid_response");
  }
}

function toCredentials(value: z.infer<typeof tokenSchema>): OAuthCredentials {
  return {
    accessToken: value.access_token,
    expiresAt: new Date(Date.now() + value.expires_in * 1_000).toISOString(),
    refreshToken: value.refresh_token,
    scopes: value.scope.split(" ").filter((scope) => scope.length > 0),
  };
}

export function createAtlassianOAuthClient(config: AtlassianOAuthClientConfig) {
  async function requestToken(body: Record<string, string>) {
    let response: Response;

    try {
      response = await fetch("https://auth.atlassian.com/oauth/token", {
        body: JSON.stringify({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          ...body,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new ProviderAdapterError("temporarily_unavailable");
    }

    if (!response.ok) {
      throw new ProviderAdapterError(
        response.status === 401 || response.status === 403
          ? "authorization_expired"
          : "temporarily_unavailable",
      );
    }

    const parsed = tokenSchema.safeParse(await readJson(response));

    if (!parsed.success) {
      throw new ProviderAdapterError("invalid_response");
    }

    return toCredentials(parsed.data);
  }

  async function authenticatedRequest(
    url: string,
    accessToken: string,
    init: { body?: unknown; method?: "GET" | "POST" } = {},
  ) {
    let response: Response;

    try {
      response = await fetch(url, {
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
        headers: {
          accept: "application/json",
          authorization: `Bearer ${accessToken}`,
          ...(init.body === undefined
            ? {}
            : { "content-type": "application/json" }),
        },
        method: init.method ?? "GET",
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new ProviderAdapterError("temporarily_unavailable");
    }

    if (!response.ok) {
      throw new ProviderAdapterError(
        response.status === 401 || response.status === 403
          ? "authorization_expired"
          : "temporarily_unavailable",
      );
    }

    return readJson(response);
  }

  return {
    buildAuthorizationUrl(state: string): string {
      const url = new URL("https://auth.atlassian.com/authorize");
      url.search = new URLSearchParams({
        audience: "api.atlassian.com",
        client_id: config.clientId,
        prompt: "consent",
        redirect_uri: config.redirectUri,
        response_type: "code",
        scope: config.scopes.join(" "),
        state,
      }).toString();
      return url.toString();
    },
    async discoverResources(
      credentials: OAuthCredentials,
    ): Promise<readonly ProviderResource[]> {
      const parsed = z
        .array(resourceSchema)
        .safeParse(
          await authenticatedRequest(
            "https://api.atlassian.com/oauth/token/accessible-resources",
            credentials.accessToken,
          ),
        );

      if (!parsed.success) {
        throw new ProviderAdapterError("invalid_response");
      }

      return parsed.data
        .filter((resource) =>
          resource.scopes.some((scope) => scope.includes("jira")),
        )
        .map((resource) => ({
          externalId: resource.id,
          name: resource.name,
          url: resource.url,
        }));
    },
    async exchangeAuthorizationCode(code: string) {
      return requestToken({
        code,
        grant_type: "authorization_code",
        redirect_uri: config.redirectUri,
      });
    },
    async getIdentity(
      credentials: OAuthCredentials,
    ): Promise<ProviderIdentity> {
      const parsed = identitySchema.safeParse(
        await authenticatedRequest(
          "https://api.atlassian.com/me",
          credentials.accessToken,
        ),
      );

      if (!parsed.success) {
        throw new ProviderAdapterError("invalid_response");
      }

      return {
        displayName: parsed.data.name,
        externalAccountId: parsed.data.account_id,
      };
    },
    async getJson(url: string, accessToken: string): Promise<unknown> {
      return authenticatedRequest(url, accessToken);
    },
    async postJson(
      url: string,
      accessToken: string,
      body: unknown,
    ): Promise<unknown> {
      return authenticatedRequest(url, accessToken, { body, method: "POST" });
    },
    async refreshCredentials(credentials: OAuthCredentials) {
      return requestToken({
        grant_type: "refresh_token",
        refresh_token: credentials.refreshToken,
      });
    },
  };
}

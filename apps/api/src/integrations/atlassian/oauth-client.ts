import { z } from "zod";

import {
  ProviderAdapterError,
  type OAuthCredentials,
  type ProviderIdentity,
  type ProviderResource,
} from "../integration-adapter";

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
  resourceScopeMarker: string;
  scopes: readonly string[];
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new ProviderAdapterError("invalid_response");
  }
}

function responseError(status: number): ProviderAdapterError {
  if (status === 401) {
    return new ProviderAdapterError("authorization_expired", undefined, status);
  }
  if (status === 403) {
    return new ProviderAdapterError("forbidden", undefined, status);
  }
  if (status === 404) {
    return new ProviderAdapterError("not_found", undefined, status);
  }
  if (status === 400 || status === 409 || status === 422) {
    return new ProviderAdapterError("invalid_request", undefined, status);
  }
  if (status === 413) {
    return new ProviderAdapterError("content_too_large", undefined, status);
  }
  return new ProviderAdapterError("temporarily_unavailable", undefined, status);
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
    init: { body?: unknown; method?: "GET" | "POST" | "PUT" } = {},
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
      throw responseError(response.status);
    }

    return readJson(response);
  }

  async function readBoundedBinaryResponse(
    response: Response,
    maximumBytes: number,
  ): Promise<{ bytes: Uint8Array; contentType: string }> {
    if (!response.ok) throw responseError(response.status);

    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
      throw new ProviderAdapterError("content_too_large");
    }

    if (response.body === null) {
      throw new ProviderAdapterError("invalid_response");
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;

    try {
      for (;;) {
        const result = await reader.read();
        if (result.done) break;
        received += result.value.byteLength;
        if (received > maximumBytes) {
          await reader.cancel();
          throw new ProviderAdapterError("content_too_large");
        }
        chunks.push(result.value);
      }
    } finally {
      reader.releaseLock();
    }

    const bytes = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return {
      bytes,
      contentType: response.headers.get("content-type")?.split(";", 1)[0] ?? "",
    };
  }

  async function authenticatedBinaryRequest(
    url: string,
    accessToken: string,
    maximumBytes: number,
    followAtlassianRedirect = false,
  ): Promise<{ bytes: Uint8Array; contentType: string }> {
    let response: Response;

    try {
      response = await fetch(url, {
        headers: {
          accept: "*/*",
          authorization: `Bearer ${accessToken}`,
        },
        redirect: followAtlassianRedirect ? "manual" : "error",
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new ProviderAdapterError("temporarily_unavailable");
    }

    if (response.status >= 300 && response.status < 400) {
      if (!followAtlassianRedirect) {
        throw new ProviderAdapterError("invalid_response");
      }
      const location = response.headers.get("location");
      let redirectUrl: URL;
      try {
        redirectUrl = new URL(location ?? "");
      } catch {
        throw new ProviderAdapterError("invalid_response");
      }
      if (
        redirectUrl.protocol !== "https:" ||
        !(
          redirectUrl.hostname === "atlassian.com" ||
          redirectUrl.hostname.endsWith(".atlassian.com") ||
          redirectUrl.hostname.endsWith(".atlassian.net") ||
          redirectUrl.hostname.endsWith(".atlassianusercontent.com")
        )
      ) {
        throw new ProviderAdapterError("invalid_response");
      }
      try {
        response = await fetch(redirectUrl, {
          headers: { accept: "*/*" },
          redirect: "error",
          signal: AbortSignal.timeout(15_000),
        });
      } catch {
        throw new ProviderAdapterError("temporarily_unavailable");
      }
    }

    return readBoundedBinaryResponse(response, maximumBytes);
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
          resource.scopes.some((scope) =>
            scope.includes(config.resourceScopeMarker),
          ),
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
    getBytes(
      url: string,
      accessToken: string,
      maximumBytes: number,
    ): Promise<{ bytes: Uint8Array; contentType: string }> {
      return authenticatedBinaryRequest(url, accessToken, maximumBytes);
    },
    getBytesFromAtlassianRedirect(
      url: string,
      accessToken: string,
      maximumBytes: number,
    ): Promise<{ bytes: Uint8Array; contentType: string }> {
      return authenticatedBinaryRequest(url, accessToken, maximumBytes, true);
    },
    async postJson(
      url: string,
      accessToken: string,
      body: unknown,
    ): Promise<unknown> {
      return authenticatedRequest(url, accessToken, { body, method: "POST" });
    },
    async putJson(
      url: string,
      accessToken: string,
      body: unknown,
    ): Promise<unknown> {
      return authenticatedRequest(url, accessToken, { body, method: "PUT" });
    },
    async postWithoutResponse(
      url: string,
      accessToken: string,
      body: unknown,
    ): Promise<void> {
      let response: Response;

      try {
        response = await fetch(url, {
          body: JSON.stringify(body),
          headers: {
            accept: "application/json",
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json",
          },
          method: "POST",
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        throw new ProviderAdapterError("temporarily_unavailable");
      }

      if (!response.ok) throw responseError(response.status);
    },
    async deleteWithoutResponse(
      url: string,
      accessToken: string,
      body: unknown,
    ): Promise<void> {
      let response: Response;

      try {
        response = await fetch(url, {
          body: JSON.stringify(body),
          headers: {
            accept: "application/json",
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json",
          },
          method: "DELETE",
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        throw new ProviderAdapterError("temporarily_unavailable");
      }

      if (!response.ok) throw responseError(response.status);
    },
    async refreshCredentials(credentials: OAuthCredentials) {
      return requestToken({
        grant_type: "refresh_token",
        refresh_token: credentials.refreshToken,
      });
    },
  };
}

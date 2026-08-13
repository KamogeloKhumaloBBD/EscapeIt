import { z } from "zod";

import {
  ProviderAdapterError,
  type OAuthCredentials,
} from "../integration-adapter";

const apiVersion = "2026-03-10";
const maximumJsonBytes = 5 * 1_024 * 1_024;
const tokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  refresh_token: z.string().min(1),
  scope: z.string().default(""),
});

export interface GitHubOAuthClientConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  slug: string;
}

async function readJson(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumJsonBytes) {
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
      if (received > maximumJsonBytes) {
        await reader.cancel();
        throw new ProviderAdapterError("content_too_large");
      }
      chunks.push(result.value);
    }
    const bytes = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ) as unknown;
  } catch (error) {
    if (error instanceof ProviderAdapterError) throw error;
    throw new ProviderAdapterError("invalid_response");
  } finally {
    reader.releaseLock();
  }
}

function responseError(response: Response): ProviderAdapterError {
  const status = response.status;
  if (status === 401) {
    return new ProviderAdapterError("authorization_expired", undefined, status);
  }
  if (status === 403) {
    return new ProviderAdapterError(
      response.headers.get("x-ratelimit-remaining") === "0"
        ? "temporarily_unavailable"
        : "forbidden",
      undefined,
      status,
    );
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
    scopes: value.scope.split(/[ ,]+/).filter((scope) => scope.length > 0),
  };
}

export function createGitHubOAuthClient(config: GitHubOAuthClientConfig) {
  async function requestToken(parameters: Record<string, string>) {
    let response: Response;
    try {
      response = await fetch("https://github.com/login/oauth/access_token", {
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          ...parameters,
        }),
        headers: { accept: "application/json" },
        method: "POST",
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new ProviderAdapterError("temporarily_unavailable");
    }
    if (!response.ok) throw responseError(response);
    const value = await readJson(response);
    const parsed = tokenSchema.safeParse(value);
    if (!parsed.success) {
      const providerError = z.object({ error: z.string() }).safeParse(value);
      if (providerError.success) {
        throw new ProviderAdapterError(
          parameters.grant_type === "refresh_token"
            ? "authorization_expired"
            : "invalid_request",
        );
      }
      throw new ProviderAdapterError("invalid_response");
    }
    return toCredentials(parsed.data);
  }

  async function request(
    path: string,
    accessToken: string,
    init: { body?: unknown; method?: "DELETE" | "GET" | "PATCH" | "POST" } = {},
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(
        new URL(path, "https://api.github.com").toString(),
        {
          ...(init.body === undefined
            ? {}
            : { body: JSON.stringify(init.body) }),
          headers: {
            accept: "application/vnd.github+json",
            authorization: `Bearer ${accessToken}`,
            ...(init.body === undefined
              ? {}
              : { "content-type": "application/json" }),
            "x-github-api-version": apiVersion,
          },
          method: init.method ?? "GET",
          signal: AbortSignal.timeout(15_000),
        },
      );
    } catch {
      throw new ProviderAdapterError("temporarily_unavailable");
    }
    if (!response.ok) throw responseError(response);
    if (response.status === 204) return null;
    return readJson(response);
  }

  return {
    buildAuthorizationUrl(state: string) {
      const url = new URL("https://github.com/login/oauth/authorize");
      url.search = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        state,
      }).toString();
      return url.toString();
    },
    buildInstallationAuthorizationUrl(state: string) {
      const url = new URL(
        `https://github.com/apps/${encodeURIComponent(config.slug)}/installations/new`,
      );
      url.searchParams.set("state", state);
      return url.toString();
    },
    exchangeAuthorizationCode: (code: string) =>
      requestToken({
        code,
        redirect_uri: config.redirectUri,
      }),
    refreshCredentials: (credentials: OAuthCredentials) =>
      requestToken({
        grant_type: "refresh_token",
        refresh_token: credentials.refreshToken,
      }),
    request,
  };
}

export type GitHubOAuthClient = ReturnType<typeof createGitHubOAuthClient>;

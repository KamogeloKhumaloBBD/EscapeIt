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
  display_name: z.string().min(1),
});

const workspaceSchema = z.object({
  links: z.object({ html: z.object({ href: z.url() }).optional() }).optional(),
  name: z.string().min(1).optional(),
  slug: z.string().min(1),
  uuid: z.string().min(1),
});

// GET /2.0/workspaces (bare workspace list) was permanently removed by
// Bitbucket (CHANGE-2770). The replacement, GET /2.0/user/workspaces, returns
// workspace *membership* entries ({administrator, type, workspace}) with the
// workspace nested inside, rather than bare workspace objects.
const workspaceMembershipPageSchema = z.object({
  next: z.url().optional(),
  values: z.array(z.object({ workspace: workspaceSchema })),
});

export interface BitbucketOAuthClientConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
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

export function createBitbucketOAuthClient(config: BitbucketOAuthClientConfig) {
  async function requestToken(body: Record<string, string>) {
    let response: Response;

    // Bitbucket's /authorize entry point now redirects through Atlassian's
    // shared identity platform and returns a code issued (and signed) by
    // auth.atlassian.com, not by Bitbucket's own legacy OAuth server — so the
    // exchange must happen at the same token endpoint Jira uses, with
    // credentials in the JSON body rather than Basic auth.
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
      throw responseError(response.status);
    }

    let json: unknown;

    try {
      json = await response.json();
    } catch {
      throw new ProviderAdapterError("invalid_response");
    }

    const parsed = tokenSchema.safeParse(json);

    if (!parsed.success) {
      throw new ProviderAdapterError("invalid_response");
    }

    return toCredentials(parsed.data);
  }

  async function authenticatedGet(url: string, accessToken: string) {
    let response: Response;

    try {
      response = await fetch(url, {
        headers: {
          accept: "application/json",
          authorization: `Bearer ${accessToken}`,
        },
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new ProviderAdapterError("temporarily_unavailable");
    }

    if (!response.ok) {
      throw responseError(response.status);
    }

    try {
      return (await response.json()) as unknown;
    } catch {
      throw new ProviderAdapterError("invalid_response");
    }
  }

  async function authenticatedBinaryGet(
    url: string,
    accessToken: string,
    maximumBytes: number,
  ): Promise<{ bytes: Uint8Array; contentType: string }> {
    let response: Response;

    try {
      response = await fetch(url, {
        headers: {
          accept: "text/plain, application/octet-stream, */*",
          authorization: `Bearer ${accessToken}`,
        },
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new ProviderAdapterError("temporarily_unavailable");
    }

    if (!response.ok) {
      throw responseError(response.status);
    }

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

  return {
    buildAuthorizationUrl(state: string): string {
      // Bitbucket Cloud OAuth consumers have their granted scopes fixed at
      // consumer-registration time in Bitbucket workspace settings; unlike
      // the Atlassian 3LO apps used for Jira/Confluence, this endpoint does
      // not accept a `scope` parameter to request a narrower subset per
      // authorization. Whatever the consumer was registered with is what
      // gets granted, in full, every time.
      const url = new URL("https://bitbucket.org/site/oauth2/authorize");
      url.search = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        response_type: "code",
        state,
      }).toString();
      return url.toString();
    },
    async discoverResources(
      credentials: OAuthCredentials,
    ): Promise<readonly ProviderResource[]> {
      const resources: ProviderResource[] = [];
      let url: string | undefined =
        "https://api.bitbucket.org/2.0/user/workspaces?pagelen=100";
      let pages = 0;

      while (url !== undefined && pages < 40) {
        const parsed = workspaceMembershipPageSchema.safeParse(
          await authenticatedGet(url, credentials.accessToken),
        );

        if (!parsed.success) {
          throw new ProviderAdapterError("invalid_response");
        }

        for (const { workspace } of parsed.data.values) {
          resources.push({
            externalId: workspace.uuid,
            name: workspace.name ?? workspace.slug,
            url:
              workspace.links?.html?.href ??
              `https://bitbucket.org/${workspace.slug}/`,
          });
        }

        url = parsed.data.next;
        pages += 1;
      }

      return resources;
    },
    async exchangeAuthorizationCode(code: string) {
      return requestToken({
        code,
        grant_type: "authorization_code",
        redirect_uri: config.redirectUri,
      });
    },
    getBytes(
      url: string,
      accessToken: string,
      maximumBytes: number,
    ): Promise<{ bytes: Uint8Array; contentType: string }> {
      return authenticatedBinaryGet(url, accessToken, maximumBytes);
    },
    async getIdentity(
      credentials: OAuthCredentials,
    ): Promise<ProviderIdentity> {
      const parsed = identitySchema.safeParse(
        await authenticatedGet(
          "https://api.bitbucket.org/2.0/user",
          credentials.accessToken,
        ),
      );

      if (!parsed.success) {
        throw new ProviderAdapterError("invalid_response");
      }

      return {
        displayName: parsed.data.display_name,
        externalAccountId: parsed.data.account_id,
      };
    },
    async getJson(url: string, accessToken: string): Promise<unknown> {
      return authenticatedGet(url, accessToken);
    },
    async refreshCredentials(credentials: OAuthCredentials) {
      return requestToken({
        grant_type: "refresh_token",
        refresh_token: credentials.refreshToken,
      });
    },
  };
}

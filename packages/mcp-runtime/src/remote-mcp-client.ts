import { createHash } from "node:crypto";

import {
  Client,
  SdkErrorCode,
  SdkHttpError,
  StreamableHTTPClientTransport,
  UnauthorizedError,
  type AuthProvider,
  type CallToolResult,
  type OAuthClientInformationContext,
  type OAuthClientMetadata,
  type OAuthClientProvider,
  type OAuthDiscoveryState,
  type StoredOAuthClientInformation,
  type StoredOAuthTokens,
  type Tool,
} from "@modelcontextprotocol/client";
import type {
  CustomMcpAuthenticationKind,
  DiscoveredCustomMcpToolInput,
  JsonObject,
} from "@context-layer/db";

import {
  canonicalizeRemoteMcpUrl,
  createSafeFetchPolicy,
  SafeFetchError,
} from "./safe-fetch";

const discoveryTimeoutMs = 15_000;
const invocationTimeoutMs = 30_000;
const maximumTools = 100;
const maximumSchemaBytes = 64 * 1024;
const maximumCatalogBytes = 512 * 1024;
const maximumResultBytes = 256 * 1024;

export interface PersistedOAuthState extends JsonObject {
  clientInformationByIssuer: JsonObject;
  codeVerifier: string | null;
  discoveryState: JsonObject | null;
  state: string;
  tokensByIssuer: JsonObject;
}

export type RemoteMcpCredential =
  | { authMethod: "bearer"; token: string }
  | { authMethod: "oauth"; oauth: PersistedOAuthState };

export interface OAuthStartResult {
  authorizationUrl: string;
  state: PersistedOAuthState;
}

export interface RemoteMcpProbeResult {
  authenticationKind: CustomMcpAuthenticationKind;
  tools: DiscoveredCustomMcpToolInput[];
}

export class RemoteMcpError extends Error {
  readonly code:
    | "authorization_required"
    | "catalog_invalid"
    | "oauth_unavailable"
    | "result_too_large"
    | "temporarily_unavailable";

  constructor(code: RemoteMcpError["code"]) {
    super("The remote MCP request could not be completed.");
    this.name = "RemoteMcpError";
    this.code = code;
  }
}

/**
 * The 2.0 client performs HTTP version negotiation before opening the MCP
 * transport. A protected server can therefore surface its initial 401 as an
 * SdkHttpError instead of the transport's UnauthorizedError.
 */
export function isRemoteAuthenticationError(error: unknown): boolean {
  return (
    UnauthorizedError.isInstance(error) ||
    (SdkHttpError.isInstance(error) &&
      (error.code === SdkErrorCode.ClientHttpAuthentication ||
        error.status === 401))
  );
}

export function validateRemoteMcpResult(
  result: CallToolResult,
): CallToolResult {
  if (Buffer.byteLength(JSON.stringify(result), "utf8") > maximumResultBytes) {
    throw new RemoteMcpError("result_too_large");
  }
  return result;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function requireJsonObject(value: unknown): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new RemoteMcpError("catalog_invalid");
  }
  const encoded = JSON.stringify(value);
  if (Buffer.byteLength(encoded, "utf8") > maximumSchemaBytes) {
    throw new RemoteMcpError("catalog_invalid");
  }
  return value as JsonObject;
}

function requireToolSchema(value: unknown): JsonObject {
  const schema = requireJsonObject(value);
  if (schema.type !== "object") {
    throw new RemoteMcpError("catalog_invalid");
  }
  return schema;
}

function sanitizedToolSegment(value: string): string {
  const segment = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
  return /^[a-z]/.test(segment) ? segment : `tool_${segment || "unnamed"}`;
}

function exposedName(
  slug: string,
  upstreamName: string,
  used: Set<string>,
  collision: boolean,
): string {
  const prefix = `custom_${slug.replaceAll("-", "_")}_`;
  const hash = createHash("sha256")
    .update(upstreamName)
    .digest("hex")
    .slice(0, 8);
  const maximumSegment = 128 - prefix.length;
  let segment = sanitizedToolSegment(upstreamName).slice(0, maximumSegment);
  let candidate = `${prefix}${segment}`;
  if (collision) {
    segment = segment.slice(0, Math.max(1, maximumSegment - 9));
    candidate = `${prefix}${segment}_${hash}`;
  }
  if (candidate.length > 128 || used.has(candidate)) {
    throw new RemoteMcpError("catalog_invalid");
  }
  used.add(candidate);
  return candidate;
}

export function normalizeRemoteMcpTools(
  slug: string,
  tools: readonly Tool[],
): DiscoveredCustomMcpToolInput[] {
  if (tools.length > maximumTools) throw new RemoteMcpError("catalog_invalid");
  const used = new Set<string>();
  const prefix = `custom_${slug.replaceAll("-", "_")}_`;
  const maximumSegment = 128 - prefix.length;
  const segments = tools.map((tool) =>
    sanitizedToolSegment(tool.name).slice(0, maximumSegment),
  );
  const segmentCounts = new Map<string, number>();
  for (const segment of segments) {
    segmentCounts.set(segment, (segmentCounts.get(segment) ?? 0) + 1);
  }
  const normalized = tools.map((tool) => {
    if (tool.name.length < 1 || tool.name.length > 128) {
      throw new RemoteMcpError("catalog_invalid");
    }
    const inputSchema = requireToolSchema(tool.inputSchema);
    const outputSchema =
      tool.outputSchema === undefined
        ? null
        : requireToolSchema(tool.outputSchema);
    const annotations = requireJsonObject(tool.annotations ?? {});
    const trimmedTitle = tool.title?.trim().slice(0, 120);
    const title =
      trimmedTitle === undefined || trimmedTitle.length === 0
        ? null
        : trimmedTitle;
    const trimmedDescription = tool.description?.trim().slice(0, 1000);
    const description =
      trimmedDescription === undefined || trimmedDescription.length === 0
        ? "Custom MCP tool."
        : trimmedDescription;
    const normalizedExposedName = exposedName(
      slug,
      tool.name,
      used,
      (segmentCounts.get(
        sanitizedToolSegment(tool.name).slice(0, maximumSegment),
      ) ?? 0) > 1,
    );
    const fingerprint = canonicalJson({
      annotations,
      description,
      exposedName: normalizedExposedName,
      inputSchema,
      name: tool.name,
      outputSchema,
      title,
    });
    return {
      annotations,
      catalogHash: createHash("sha256").update(fingerprint).digest(),
      description,
      exposedName: normalizedExposedName,
      inputSchema,
      outputSchema,
      title,
      upstreamName: tool.name,
    };
  });
  const catalogBytes = normalized.reduce(
    (total, item) =>
      total +
      Buffer.byteLength(
        JSON.stringify({
          annotations: item.annotations,
          description: item.description,
          exposedName: item.exposedName,
          inputSchema: item.inputSchema,
          outputSchema: item.outputSchema,
          title: item.title,
          upstreamName: item.upstreamName,
        }),
        "utf8",
      ),
    0,
  );
  if (catalogBytes > maximumCatalogBytes) {
    throw new RemoteMcpError("catalog_invalid");
  }
  return normalized;
}

function emptyOAuthState(state: string): PersistedOAuthState {
  return {
    clientInformationByIssuer: {},
    codeVerifier: null,
    discoveryState: null,
    state,
    tokensByIssuer: {},
  };
}

class StoredOAuthProvider implements OAuthClientProvider {
  authorizationUrl: URL | null = null;
  readonly clientMetadataUrl?: string;
  readonly stateValue: PersistedOAuthState;

  constructor(
    state: PersistedOAuthState,
    readonly redirectUrl: string,
    clientMetadataUrl?: string,
  ) {
    this.stateValue = state;
    if (clientMetadataUrl !== undefined) {
      this.clientMetadataUrl = clientMetadataUrl;
    }
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      application_type: "web",
      client_name: "Context Layer Custom MCP",
      grant_types: ["authorization_code", "refresh_token"],
      redirect_uris: [this.redirectUrl],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    };
  }

  state(): string {
    return this.stateValue.state;
  }

  clientInformation(
    context?: OAuthClientInformationContext,
  ): StoredOAuthClientInformation | undefined {
    if (context === undefined) return undefined;
    return this.stateValue.clientInformationByIssuer[context.issuer] as
      StoredOAuthClientInformation | undefined;
  }

  saveClientInformation(
    information: StoredOAuthClientInformation,
    context?: OAuthClientInformationContext,
  ): void {
    if (context !== undefined) {
      (this.stateValue.clientInformationByIssuer as Record<string, unknown>)[
        context.issuer
      ] = information;
    }
  }

  tokens(
    context?: OAuthClientInformationContext,
  ): StoredOAuthTokens | undefined {
    if (context === undefined) {
      return Object.values(this.stateValue.tokensByIssuer).at(-1) as
        StoredOAuthTokens | undefined;
    }
    return this.stateValue.tokensByIssuer[context.issuer] as
      StoredOAuthTokens | undefined;
  }

  saveTokens(
    tokens: StoredOAuthTokens,
    context?: OAuthClientInformationContext,
  ): void {
    const issuer = context?.issuer ?? "default";
    (this.stateValue.tokensByIssuer as Record<string, unknown>)[issuer] =
      tokens;
  }

  redirectToAuthorization(url: URL): void {
    this.authorizationUrl = url;
  }

  saveCodeVerifier(value: string): void {
    this.stateValue.codeVerifier = value;
  }

  codeVerifier(): string {
    if (this.stateValue.codeVerifier === null) {
      throw new RemoteMcpError("oauth_unavailable");
    }
    return this.stateValue.codeVerifier;
  }

  saveDiscoveryState(value: OAuthDiscoveryState): void {
    this.stateValue.discoveryState = value as unknown as JsonObject;
  }

  discoveryState(): OAuthDiscoveryState | undefined {
    return (this.stateValue.discoveryState ?? undefined) as
      OAuthDiscoveryState | undefined;
  }
}

async function withinDeadline<T>(promise: Promise<T>, milliseconds: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new RemoteMcpError("temporarily_unavailable"));
        }, milliseconds);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function withClient<T>(
  endpointUrl: string,
  authProvider: AuthProvider | OAuthClientProvider | undefined,
  operation: (
    client: Client,
    transport: StreamableHTTPClientTransport,
  ) => Promise<T>,
  deadlineMs = discoveryTimeoutMs,
): Promise<T> {
  const endpoint = canonicalizeRemoteMcpUrl(endpointUrl);
  const policy = createSafeFetchPolicy();
  const client = new Client(
    { name: "context-layer", version: "0.1.0" },
    { listMaxPages: 10, versionNegotiation: { mode: "auto" } },
  );
  const transport = new StreamableHTTPClientTransport(endpoint, {
    ...(authProvider === undefined ? {} : { authProvider }),
    fetch: policy.fetch,
  });
  try {
    return await withinDeadline(
      (async () => {
        await client.connect(transport, {
          timeout: Math.min(discoveryTimeoutMs, deadlineMs),
        });
        return await operation(client, transport);
      })(),
      deadlineMs,
    );
  } finally {
    await Promise.allSettled([client.close(), policy.close()]);
  }
}

async function discover(
  endpointUrl: string,
  slug: string,
  authProvider?: AuthProvider | OAuthClientProvider,
): Promise<DiscoveredCustomMcpToolInput[]> {
  return withClient(endpointUrl, authProvider, async (client) => {
    const result = await client.listTools(undefined, {
      cacheMode: "refresh",
      timeout: discoveryTimeoutMs,
    });
    return normalizeRemoteMcpTools(slug, result.tools);
  });
}

async function authenticationChallenge(
  endpointUrl: string,
): Promise<CustomMcpAuthenticationKind> {
  const policy = createSafeFetchPolicy();
  try {
    const response = await policy.fetch(canonicalizeRemoteMcpUrl(endpointUrl), {
      body: JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "server/discover",
        params: {},
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
      signal: AbortSignal.timeout(discoveryTimeoutMs),
    });
    const challenge = response.headers.get("www-authenticate") ?? "";
    await response.body?.cancel();
    return /resource_metadata\s*=/i.test(challenge) ? "oauth" : "bearer";
  } finally {
    await policy.close();
  }
}

export async function probeRemoteMcpServer(
  endpointUrl: string,
  slug: string,
): Promise<RemoteMcpProbeResult> {
  try {
    return {
      authenticationKind: "none",
      tools: await discover(endpointUrl, slug),
    };
  } catch (error) {
    if (error instanceof SafeFetchError) throw error;
    if (!isRemoteAuthenticationError(error)) {
      throw new RemoteMcpError("temporarily_unavailable");
    }
    return {
      authenticationKind: await authenticationChallenge(endpointUrl),
      tools: [],
    };
  }
}

export async function discoverWithBearer(
  endpointUrl: string,
  slug: string,
  token: string,
): Promise<DiscoveredCustomMcpToolInput[]> {
  if (token.length < 1 || token.length > 8192) {
    throw new RemoteMcpError("authorization_required");
  }
  try {
    return await discover(endpointUrl, slug, {
      token: () => Promise.resolve(token),
    });
  } catch (error) {
    if (error instanceof SafeFetchError || error instanceof RemoteMcpError) {
      throw error;
    }
    if (isRemoteAuthenticationError(error)) {
      throw new RemoteMcpError("authorization_required");
    }
    throw new RemoteMcpError("temporarily_unavailable");
  }
}

export async function discoverRemoteMcpTools(
  endpointUrl: string,
  slug: string,
  credential: RemoteMcpCredential | null,
): Promise<DiscoveredCustomMcpToolInput[]> {
  if (credential === null) {
    try {
      return await discover(endpointUrl, slug);
    } catch (error) {
      if (error instanceof SafeFetchError || error instanceof RemoteMcpError) {
        throw error;
      }
      if (isRemoteAuthenticationError(error)) {
        throw new RemoteMcpError("authorization_required");
      }
      throw new RemoteMcpError("temporarily_unavailable");
    }
  }
  if (credential.authMethod === "bearer") {
    return discoverWithBearer(endpointUrl, slug, credential.token);
  }
  const provider = new StoredOAuthProvider(
    credential.oauth,
    "https://invalid.example/callback",
    "https://invalid.example/client.json",
  );
  try {
    return await discover(endpointUrl, slug, provider);
  } catch (error) {
    if (error instanceof SafeFetchError || error instanceof RemoteMcpError) {
      throw error;
    }
    if (isRemoteAuthenticationError(error)) {
      throw new RemoteMcpError("authorization_required");
    }
    throw new RemoteMcpError("temporarily_unavailable");
  }
}

export async function beginRemoteMcpOAuth(input: {
  clientMetadataUrl?: string;
  endpointUrl: string;
  redirectUrl: string;
  state: string;
}): Promise<OAuthStartResult> {
  const state = emptyOAuthState(input.state);
  const provider = new StoredOAuthProvider(
    state,
    input.redirectUrl,
    input.clientMetadataUrl,
  );
  try {
    await withClient(input.endpointUrl, provider, () =>
      Promise.resolve(undefined),
    );
  } catch (error) {
    if (
      !isRemoteAuthenticationError(error) ||
      provider.authorizationUrl === null
    ) {
      throw new RemoteMcpError("oauth_unavailable");
    }
    return { authorizationUrl: provider.authorizationUrl.toString(), state };
  }
  throw new RemoteMcpError("oauth_unavailable");
}

export async function finishRemoteMcpOAuth(input: {
  callbackParameters: URLSearchParams;
  clientMetadataUrl?: string;
  endpointUrl: string;
  persistedState: PersistedOAuthState;
  redirectUrl: string;
  slug: string;
}): Promise<{
  credential: RemoteMcpCredential;
  tools: DiscoveredCustomMcpToolInput[];
}> {
  const provider = new StoredOAuthProvider(
    input.persistedState,
    input.redirectUrl,
    input.clientMetadataUrl,
  );
  const policy = createSafeFetchPolicy();
  const transport = new StreamableHTTPClientTransport(
    canonicalizeRemoteMcpUrl(input.endpointUrl),
    { authProvider: provider, fetch: policy.fetch },
  );
  try {
    await withinDeadline(
      transport.finishAuth(input.callbackParameters),
      discoveryTimeoutMs,
    );
  } catch (error) {
    if (error instanceof SafeFetchError || error instanceof RemoteMcpError) {
      throw error;
    }
    if (isRemoteAuthenticationError(error)) {
      throw new RemoteMcpError("authorization_required");
    }
    throw new RemoteMcpError("oauth_unavailable");
  } finally {
    await Promise.allSettled([transport.close(), policy.close()]);
  }
  const tools = await discover(input.endpointUrl, input.slug, provider);
  return {
    credential: { authMethod: "oauth", oauth: provider.stateValue },
    tools,
  };
}

export async function invokeRemoteMcpTool(input: {
  arguments: Record<string, unknown>;
  credential: RemoteMcpCredential | null;
  endpointUrl: string;
  tool: Tool;
}): Promise<{
  credential: RemoteMcpCredential | null;
  result: CallToolResult;
}> {
  let provider: AuthProvider | OAuthClientProvider | undefined;
  let oauthProvider: StoredOAuthProvider | null = null;
  if (input.credential?.authMethod === "bearer") {
    const bearerToken = input.credential.token;
    provider = {
      token: () => Promise.resolve(bearerToken),
    };
  } else if (input.credential?.authMethod === "oauth") {
    oauthProvider = new StoredOAuthProvider(
      input.credential.oauth,
      "https://invalid.example/callback",
      "https://invalid.example/client.json",
    );
    provider = oauthProvider;
  }
  let result: CallToolResult;
  try {
    result = await withClient(
      input.endpointUrl,
      provider,
      (client) =>
        client.callTool(
          { arguments: input.arguments, name: input.tool.name },
          { timeout: invocationTimeoutMs, toolDefinition: input.tool },
        ),
      invocationTimeoutMs,
    );
  } catch (error) {
    if (error instanceof SafeFetchError || error instanceof RemoteMcpError) {
      throw error;
    }
    if (isRemoteAuthenticationError(error)) {
      throw new RemoteMcpError("authorization_required");
    }
    throw new RemoteMcpError("temporarily_unavailable");
  }
  return {
    credential:
      oauthProvider === null
        ? input.credential
        : { authMethod: "oauth", oauth: oauthProvider.stateValue },
    result: validateRemoteMcpResult(result),
  };
}

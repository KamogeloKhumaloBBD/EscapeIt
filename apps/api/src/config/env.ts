import { parseDatabaseConfig, type DatabaseConfig } from "@context-layer/db";
import type {
  AtlassianOAuthConfig,
  BitbucketOAuthConfig,
  GitHubAppConfig,
} from "@context-layer/integrations";
import { z } from "zod";

const optionalCredential = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

const emailSender = z.string().trim().refine(isEmailSender, {
  message:
    "AUTH_EMAIL_FROM must be an email address or a name followed by an email address in angle brackets.",
});

const apiEnvironmentSchema = z.object({
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(4_000),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  CREDENTIAL_ENCRYPTION_KEY: z.string().refine(isThirtyTwoByteBase64, {
    message: "CREDENTIAL_ENCRYPTION_KEY must be base64-encoded 32-byte data.",
  }),
  NODE_ENV: z.enum(["development", "production"]).default("development"),
  PUBLIC_APP_URL: z.url(),
  PORT: z.coerce.number().int().min(1).max(65_535).optional(),
  WEBHOOK_PUBLIC_URL: z.url().optional(),
  AUTH_EMAIL_FROM: emailSender,
  RESEND_API_KEY: z.string().min(1),
  // The bearer token the scheduler presents to run digests. Leave it unset and
  // the scheduled route is never mounted, so nothing can trigger a run.
  DIGEST_RUN_SECRET: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(32).optional(),
  ),
  // The UTC hour the digest schedule fires. It defines the 24-hour window each
  // run covers, so it must match the cron expression on the scheduler.
  // 16 is 18:00 in South Africa, once the working day is over.
  DIGEST_SEND_HOUR_UTC: z.coerce.number().int().min(0).max(23).default(16),
  // A llama.cpp server on the private network that writes the digest prose.
  // Without it digests still send, rendered from the events themselves.
  SLM_BASE_URL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.url().optional(),
  ),
  SLM_API_KEY: optionalCredential,
  ATLASSIAN_OAUTH_CLIENT_ID: optionalCredential,
  ATLASSIAN_OAUTH_CLIENT_SECRET: optionalCredential,
  BITBUCKET_OAUTH_CLIENT_ID: optionalCredential,
  BITBUCKET_OAUTH_CLIENT_SECRET: optionalCredential,
  // The Forge app that relays Confluence events to us. Its app id is the
  // audience of the invocation tokens Forge signs, so without it we cannot
  // authenticate a delivery and Confluence notifications stay off.
  FORGE_APP_ID: optionalCredential,
  // Where a workspace owner sends their Confluence admin to approve that app.
  // Generated in the Atlassian developer console under Distribution.
  FORGE_APP_INSTALL_URL: optionalCredential,
  GITHUB_APP_CLIENT_ID: optionalCredential,
  GITHUB_APP_CLIENT_SECRET: optionalCredential,
  // Optional alongside the other three: without it the App still connects and
  // serves MCP tools, only its webhook deliveries cannot be authenticated.
  GITHUB_APP_WEBHOOK_SECRET: optionalCredential,
  GITHUB_APP_SLUG: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional(),
  ),
});

export interface ApiConfig {
  atlassianOAuth: AtlassianOAuthConfig | null;
  bitbucketOAuth: BitbucketOAuthConfig | null;
  authEmailFrom: string;
  betterAuthSecret: string;
  betterAuthUrl: string;
  credentialEncryptionKey: string;
  database: DatabaseConfig;
  digestRunSecret: string | null;
  digestSendHourUtc: number;
  forgeAppId: string | null;
  forgeAppInstallUrl: string | null;
  githubApp: GitHubAppConfig | null;
  nodeEnvironment: "development" | "production";
  port: number;
  publicAppUrl: string;
  resendApiKey: string;
  summarizerBaseUrl: string | null;
  summarizerApiKey: string | null;
  webhookPublicUrl: string;
}

function isThirtyTwoByteBase64(value: string): boolean {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) {
    return false;
  }

  const decoded = Buffer.from(value, "base64");
  const normalizedInput = value.replace(/=+$/, "");
  const normalizedOutput = decoded.toString("base64").replace(/=+$/, "");

  return decoded.byteLength === 32 && normalizedInput === normalizedOutput;
}

function isEmailSender(value: string): boolean {
  const namedAddress = /^[^<>\r\n]+\s+<([^<>\s]+)>$/.exec(value);
  const address = namedAddress?.[1] ?? value;

  return z.email().safeParse(address).success;
}

export function parseApiConfig(
  environment: Record<string, string | undefined>,
): ApiConfig {
  const parsed = apiEnvironmentSchema.parse(environment);

  if (
    (parsed.ATLASSIAN_OAUTH_CLIENT_ID === undefined) !==
    (parsed.ATLASSIAN_OAUTH_CLIENT_SECRET === undefined)
  ) {
    throw new Error(
      "ATLASSIAN_OAUTH_CLIENT_ID and ATLASSIAN_OAUTH_CLIENT_SECRET must be configured together.",
    );
  }

  if (
    (parsed.BITBUCKET_OAUTH_CLIENT_ID === undefined) !==
    (parsed.BITBUCKET_OAUTH_CLIENT_SECRET === undefined)
  ) {
    throw new Error(
      "BITBUCKET_OAUTH_CLIENT_ID and BITBUCKET_OAUTH_CLIENT_SECRET must be configured together.",
    );
  }

  const githubValues = [
    parsed.GITHUB_APP_CLIENT_ID,
    parsed.GITHUB_APP_CLIENT_SECRET,
    parsed.GITHUB_APP_SLUG,
  ];
  const configuredGitHubValues = githubValues.filter(
    (value) => value !== undefined,
  ).length;

  if (configuredGitHubValues !== 0 && configuredGitHubValues !== 3) {
    throw new Error(
      "GITHUB_APP_CLIENT_ID, GITHUB_APP_CLIENT_SECRET, and GITHUB_APP_SLUG must be configured together.",
    );
  }

  return {
    atlassianOAuth:
      parsed.ATLASSIAN_OAUTH_CLIENT_ID === undefined ||
      parsed.ATLASSIAN_OAUTH_CLIENT_SECRET === undefined
        ? null
        : {
            clientId: parsed.ATLASSIAN_OAUTH_CLIENT_ID,
            clientSecret: parsed.ATLASSIAN_OAUTH_CLIENT_SECRET,
          },
    bitbucketOAuth:
      parsed.BITBUCKET_OAUTH_CLIENT_ID === undefined ||
      parsed.BITBUCKET_OAUTH_CLIENT_SECRET === undefined
        ? null
        : {
            clientId: parsed.BITBUCKET_OAUTH_CLIENT_ID,
            clientSecret: parsed.BITBUCKET_OAUTH_CLIENT_SECRET,
          },
    authEmailFrom: parsed.AUTH_EMAIL_FROM,
    betterAuthSecret: parsed.BETTER_AUTH_SECRET,
    betterAuthUrl: parsed.BETTER_AUTH_URL,
    credentialEncryptionKey: parsed.CREDENTIAL_ENCRYPTION_KEY,
    database: parseDatabaseConfig(environment),
    digestRunSecret: parsed.DIGEST_RUN_SECRET ?? null,
    digestSendHourUtc: parsed.DIGEST_SEND_HOUR_UTC,
    forgeAppId: parsed.FORGE_APP_ID ?? null,
    forgeAppInstallUrl: parsed.FORGE_APP_INSTALL_URL ?? null,
    githubApp:
      parsed.GITHUB_APP_CLIENT_ID === undefined ||
      parsed.GITHUB_APP_CLIENT_SECRET === undefined ||
      parsed.GITHUB_APP_SLUG === undefined
        ? null
        : {
            clientId: parsed.GITHUB_APP_CLIENT_ID,
            clientSecret: parsed.GITHUB_APP_CLIENT_SECRET,
            slug: parsed.GITHUB_APP_SLUG,
            webhookSecret: parsed.GITHUB_APP_WEBHOOK_SECRET ?? null,
          },
    nodeEnvironment: parsed.NODE_ENV,
    port: parsed.PORT ?? parsed.API_PORT,
    publicAppUrl: parsed.PUBLIC_APP_URL,
    resendApiKey: parsed.RESEND_API_KEY,
    summarizerBaseUrl: parsed.SLM_BASE_URL ?? null,
    summarizerApiKey: parsed.SLM_API_KEY ?? null,
    webhookPublicUrl: parsed.WEBHOOK_PUBLIC_URL ?? parsed.PUBLIC_APP_URL,
  };
}

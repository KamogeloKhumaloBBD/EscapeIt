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

const environmentSchema = z.object({
  ATLASSIAN_OAUTH_CLIENT_ID: optionalCredential,
  ATLASSIAN_OAUTH_CLIENT_SECRET: optionalCredential,
  BITBUCKET_OAUTH_CLIENT_ID: optionalCredential,
  BITBUCKET_OAUTH_CLIENT_SECRET: optionalCredential,
  CREDENTIAL_ENCRYPTION_KEY: z.string().min(1),
  GITHUB_APP_CLIENT_ID: optionalCredential,
  GITHUB_APP_CLIENT_SECRET: optionalCredential,
  GITHUB_APP_SLUG: optionalCredential,
  MCP_PORT: z.coerce.number().int().min(1).max(65_535).default(4_100),
  PORT: z.coerce.number().int().min(1).max(65_535).optional(),
  PUBLIC_APP_URL: z.url(),
});

export interface McpConfig {
  atlassianOAuth: AtlassianOAuthConfig | null;
  bitbucketOAuth: BitbucketOAuthConfig | null;
  credentialEncryptionKey: string;
  database: DatabaseConfig;
  githubApp: GitHubAppConfig | null;
  port: number;
  publicAppUrl: string;
}

function pairedCredentials(
  first: string | undefined,
  second: string | undefined,
  names: string,
): void {
  if ((first === undefined) !== (second === undefined)) {
    throw new Error(`${names} must be configured together.`);
  }
}

export function parseMcpConfig(
  environment: Record<string, string | undefined>,
): McpConfig {
  const parsed = environmentSchema.parse(environment);

  pairedCredentials(
    parsed.ATLASSIAN_OAUTH_CLIENT_ID,
    parsed.ATLASSIAN_OAUTH_CLIENT_SECRET,
    "ATLASSIAN_OAUTH_CLIENT_ID and ATLASSIAN_OAUTH_CLIENT_SECRET",
  );
  pairedCredentials(
    parsed.BITBUCKET_OAUTH_CLIENT_ID,
    parsed.BITBUCKET_OAUTH_CLIENT_SECRET,
    "BITBUCKET_OAUTH_CLIENT_ID and BITBUCKET_OAUTH_CLIENT_SECRET",
  );

  const githubValues = [
    parsed.GITHUB_APP_CLIENT_ID,
    parsed.GITHUB_APP_CLIENT_SECRET,
    parsed.GITHUB_APP_SLUG,
  ];
  const githubConfigured = githubValues.filter(
    (value) => value !== undefined,
  ).length;

  if (githubConfigured !== 0 && githubConfigured !== githubValues.length) {
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
    credentialEncryptionKey: parsed.CREDENTIAL_ENCRYPTION_KEY,
    database: parseDatabaseConfig(environment),
    githubApp:
      parsed.GITHUB_APP_CLIENT_ID === undefined ||
      parsed.GITHUB_APP_CLIENT_SECRET === undefined ||
      parsed.GITHUB_APP_SLUG === undefined
        ? null
        : {
            clientId: parsed.GITHUB_APP_CLIENT_ID,
            clientSecret: parsed.GITHUB_APP_CLIENT_SECRET,
            slug: parsed.GITHUB_APP_SLUG,
            webhookSecret: null,
          },
    port: parsed.PORT ?? parsed.MCP_PORT,
    publicAppUrl: parsed.PUBLIC_APP_URL,
  };
}

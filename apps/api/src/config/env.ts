import { parseDatabaseConfig, type DatabaseConfig } from "@context-layer/db";
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
  ATLASSIAN_OAUTH_CLIENT_ID: optionalCredential,
  ATLASSIAN_OAUTH_CLIENT_SECRET: optionalCredential,
});

export interface AtlassianOAuthConfig {
  clientId: string;
  clientSecret: string;
}

export interface ApiConfig {
  atlassianOAuth: AtlassianOAuthConfig | null;
  authEmailFrom: string;
  betterAuthSecret: string;
  betterAuthUrl: string;
  credentialEncryptionKey: string;
  database: DatabaseConfig;
  nodeEnvironment: "development" | "production";
  port: number;
  publicAppUrl: string;
  resendApiKey: string;
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

  return {
    atlassianOAuth:
      parsed.ATLASSIAN_OAUTH_CLIENT_ID === undefined ||
      parsed.ATLASSIAN_OAUTH_CLIENT_SECRET === undefined
        ? null
        : {
            clientId: parsed.ATLASSIAN_OAUTH_CLIENT_ID,
            clientSecret: parsed.ATLASSIAN_OAUTH_CLIENT_SECRET,
          },
    authEmailFrom: parsed.AUTH_EMAIL_FROM,
    betterAuthSecret: parsed.BETTER_AUTH_SECRET,
    betterAuthUrl: parsed.BETTER_AUTH_URL,
    credentialEncryptionKey: parsed.CREDENTIAL_ENCRYPTION_KEY,
    database: parseDatabaseConfig(environment),
    nodeEnvironment: parsed.NODE_ENV,
    port: parsed.PORT ?? parsed.API_PORT,
    publicAppUrl: parsed.PUBLIC_APP_URL,
    resendApiKey: parsed.RESEND_API_KEY,
    webhookPublicUrl: parsed.WEBHOOK_PUBLIC_URL ?? parsed.PUBLIC_APP_URL,
  };
}

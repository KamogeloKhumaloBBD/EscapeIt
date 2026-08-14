import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { emailOTP } from "better-auth/plugins";
import { oauthProvider } from "@better-auth/oauth-provider";
import { Pool } from "pg";
import type { Logger } from "pino";
import { Resend } from "resend";
import { signInCodeEmail } from "@context-layer/email";

export interface AuthConfig {
  authEmailFrom: string;
  baseUrl: string;
  databaseUrl: string;
  logger: Pick<Logger, "warn">;
  mcpResourceUrl: string;
  resendApiKey: string;
  secret: string;
  trustedOrigins: string[];
  findWorkspaceIdForUser: (userId: string) => Promise<string | null>;
}

export function createAuth({
  authEmailFrom,
  baseUrl,
  databaseUrl,
  logger,
  mcpResourceUrl,
  resendApiKey,
  secret,
  trustedOrigins,
  findWorkspaceIdForUser,
}: AuthConfig) {
  const database = new Pool({
    connectionString: databaseUrl,
  });
  const resend = new Resend(resendApiKey);

  return {
    auth: betterAuth({
      baseURL: baseUrl,
      database,
      secret,
      emailAndPassword: {
        enabled: false,
      },
      hooks: {
        before: createAuthMiddleware(async (context) => {
          if (context.path !== "/oauth2/token") {
            return;
          }

          const body: unknown = await Promise.resolve(context.body);
          const resource =
            typeof body === "object" && body !== null && "resource" in body
              ? body.resource
              : undefined;
          if (resource !== mcpResourceUrl) {
            throw new APIError("BAD_REQUEST", {
              error: "invalid_target",
              error_description: "The MCP resource indicator is required.",
            });
          }
        }),
      },
      plugins: [
        emailOTP({
          otpLength: 6,
          sendVerificationOTP: async ({ email, otp, type }) => {
            if (type !== "sign-in") {
              return;
            }

            const { error } = await resend.emails.send({
              from: authEmailFrom,
              react: signInCodeEmail({ otp }),
              to: email,
              subject: "Your Context Layer sign-in code",
            });

            if (error !== null) {
              logger.warn(
                {
                  providerError: {
                    name: error.name,
                    statusCode: error.statusCode,
                  },
                },
                "Resend rejected a sign-in code email",
              );
              throw new Error("Unable to send sign-in code.");
            }
          },
          storeOTP: "hashed",
        }),
        oauthProvider({
          accessTokenExpiresIn: 3_600,
          allowDynamicClientRegistration: true,
          allowUnauthenticatedClientRegistration: true,
          clientRegistrationAllowedScopes: ["mcp:access", "offline_access"],
          clientRegistrationDefaultScopes: ["mcp:access", "offline_access"],
          consentPage: "/oauth/consent",
          customAccessTokenClaims: ({ referenceId }) => ({
            aud: mcpResourceUrl,
            workspace_id: referenceId,
          }),
          disableJwtPlugin: true,
          grantTypes: ["authorization_code", "refresh_token"],
          loginPage: "/sign-in",
          postLogin: {
            consentReferenceId: async ({ user }) => {
              const workspaceId = await findWorkspaceIdForUser(user.id);

              if (workspaceId === null) {
                throw new APIError("FORBIDDEN", {
                  error: "access_denied",
                  error_description:
                    "Finish workspace onboarding before connecting an MCP client.",
                });
              }

              return workspaceId;
            },
            page: "/oauth/consent",
            shouldRedirect: () => false,
          },
          prefix: {
            opaqueAccessToken: "ctx_oauth_at_",
            refreshToken: "ctx_oauth_rt_",
          },
          refreshTokenExpiresIn: 31_536_000,
          scopes: ["mcp:access", "offline_access"],
          storeTokens: "hashed",
          validAudiences: [mcpResourceUrl],
        }),
      ],
      user: {
        modelName: "users",
      },
      session: {
        modelName: "sessions",
      },
      account: {
        modelName: "accounts",
      },
      verification: {
        modelName: "verifications",
      },
      trustedOrigins,
    }),
    close: () => database.end(),
  };
}

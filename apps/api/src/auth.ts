import { betterAuth } from "better-auth";
import { emailOTP } from "better-auth/plugins";
import { Pool } from "pg";
import type { Logger } from "pino";
import { Resend } from "resend";
import { signInCodeEmail } from "@context-layer/email";

export interface AuthConfig {
  authEmailFrom: string;
  baseUrl: string;
  databaseUrl: string;
  logger: Pick<Logger, "warn">;
  resendApiKey: string;
  secret: string;
  trustedOrigins: string[];
}

export function createAuth({
  authEmailFrom,
  baseUrl,
  databaseUrl,
  logger,
  resendApiKey,
  secret,
  trustedOrigins,
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

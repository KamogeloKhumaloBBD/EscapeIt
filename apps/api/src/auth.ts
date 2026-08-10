import { betterAuth } from "better-auth";
import { emailOTP } from "better-auth/plugins";
import { Pool } from "pg";
import { Resend } from "resend";

export interface AuthConfig {
  authEmailFrom: string;
  baseUrl: string;
  databaseUrl: string;
  resendApiKey: string;
  secret: string;
  trustedOrigins: string[];
}

export function createAuth({
  authEmailFrom,
  baseUrl,
  databaseUrl,
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
              to: email,
              subject: "Your Context Layer sign-in code",
              text: `Your Context Layer sign-in code is ${otp}. This code expires in 5 minutes.`,
            });

            if (error !== null) {
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

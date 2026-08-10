import { z } from "zod";

const databaseEnvironmentSchema = z.object({
  DATABASE_SSL_MODE: z
    .enum(["disable", "require", "verify-full"])
    .default("disable"),
  DATABASE_URL: z.url().refine((value) => value.startsWith("postgres"), {
    message: "DATABASE_URL must use a PostgreSQL scheme.",
  }),
});

export interface DatabaseConfig {
  sslMode: "disable" | "require" | "verify-full";
  url: string;
}

export function parseDatabaseConfig(
  environment: Record<string, string | undefined>,
): DatabaseConfig {
  const parsed = databaseEnvironmentSchema.parse(environment);

  return {
    sslMode: parsed.DATABASE_SSL_MODE,
    url: parsed.DATABASE_URL,
  };
}

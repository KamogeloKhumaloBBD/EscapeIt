import postgres from "postgres";

import type { DatabaseConfig } from "./config";

function connectionUrl(config: DatabaseConfig): string {
  const url = new URL(config.url);
  url.searchParams.set("sslmode", config.sslMode);
  return url.toString();
}

export function createDatabaseConnection(config: DatabaseConfig) {
  const client = postgres(connectionUrl(config));

  return {
    client,
    close: () => client.end(),
  };
}

export type DatabaseConnection = ReturnType<typeof createDatabaseConnection>;
export type DatabaseClient = DatabaseConnection["client"];
export type DatabaseTransaction = postgres.TransactionSql;

export async function checkDatabaseReadiness(
  connection: Pick<DatabaseConnection, "client">,
): Promise<boolean> {
  try {
    await connection.client`select 1`;
    return true;
  } catch {
    return false;
  }
}

export function withTransaction<T>(
  database: DatabaseClient,
  operation: (transaction: DatabaseTransaction) => Promise<T>,
): Promise<T> {
  return database.begin(async (transaction) =>
    operation(transaction),
  ) as Promise<T>;
}

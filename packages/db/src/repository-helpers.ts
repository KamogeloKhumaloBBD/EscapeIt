import { v7 as uuidv7 } from "uuid";

import type { DatabaseClient, DatabaseTransaction } from "./client";
import { RepositoryError } from "./repository-errors";

export type QueryClient = DatabaseClient | DatabaseTransaction;

export function createProductId(): string {
  return uuidv7();
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function requireSha256Digest(digest: Uint8Array): Buffer {
  if (digest.byteLength !== 32) {
    throw new RepositoryError("invalid", "A SHA-256 digest must be 32 bytes.");
  }

  return Buffer.from(digest);
}

export function requireReturnedRow<T>(row: T | undefined): T {
  if (row === undefined) {
    throw new Error("The database operation did not return the expected row.");
  }

  return row;
}

export async function requireMembership(
  database: QueryClient,
  workspaceId: string,
  membershipId: string,
): Promise<{ role: "member" | "owner"; userId: string }> {
  const rows = await database<{ role: "member" | "owner"; userId: string }[]>`
    select role, "userId"
    from workspace_memberships
    where "workspaceId" = ${workspaceId} and id = ${membershipId}
  `;
  const membership = rows[0];

  if (membership === undefined) {
    throw new RepositoryError("not_found", "Workspace membership not found.");
  }

  return membership;
}

export async function requireOwner(
  database: QueryClient,
  workspaceId: string,
  membershipId: string,
): Promise<void> {
  const membership = await requireMembership(
    database,
    workspaceId,
    membershipId,
  );

  if (membership.role !== "owner") {
    throw new RepositoryError(
      "forbidden",
      "Workspace owner access is required.",
    );
  }
}

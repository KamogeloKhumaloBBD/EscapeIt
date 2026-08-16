import type {
  EncryptedCredentialEnvelope,
  Integration,
  IntegrationAccount,
  SaveIntegrationAccountInput,
} from "@context-layer/db";
import { z } from "zod";

import type { CredentialEncryption } from "@context-layer/security";
import {
  ProviderAdapterError,
  type IntegrationAdapter,
  type OAuthCredentials,
} from "./integration-adapter";

const credentialsSchema = z.object({
  accessToken: z.string().min(1),
  expiresAt: z.iso.datetime(),
  refreshToken: z.string().min(1),
  scopes: z.array(z.string()),
});

interface ProviderAccountRepository {
  findAccount(
    workspaceId: string,
    integrationId: string,
    membershipId: string,
  ): Promise<IntegrationAccount | null>;
  replaceAccountCredentials(
    input: SaveIntegrationAccountInput,
    expectedEnvelope: EncryptedCredentialEnvelope,
  ): Promise<IntegrationAccount | null>;
  markAccountAuthenticationError(input: {
    accountId: string;
    errorCode: "authorization_expired" | "credentials_unavailable";
    expectedEnvelope: EncryptedCredentialEnvelope;
    integrationId: string;
    membershipId: string;
    workspaceId: string;
  }): Promise<IntegrationAccount | null>;
}

export interface ProviderAccountExecutionContext {
  account: IntegrationAccount;
  integration: Integration;
  membershipId: string;
  workspaceId: string;
}

export class ProviderAccountRuntimeError extends Error {
  readonly code: "account_required" | "credentials_unavailable";

  constructor(code: ProviderAccountRuntimeError["code"]) {
    super("The provider account is unavailable.");
    this.name = "ProviderAccountRuntimeError";
    this.code = code;
  }
}

export interface ProviderAccountRuntime {
  withCredentials<T>(
    context: ProviderAccountExecutionContext,
    adapter: IntegrationAdapter,
    operation: (credentials: OAuthCredentials) => Promise<T>,
  ): Promise<T>;
}

function readCredentials(
  encryption: CredentialEncryption,
  account: IntegrationAccount,
): OAuthCredentials {
  if (account.credentialEnvelope === null) {
    throw new ProviderAccountRuntimeError("account_required");
  }

  try {
    const parsed = credentialsSchema.safeParse(
      encryption.decrypt(
        account.credentialEnvelope,
        "integration-account",
        account.id,
      ),
    );

    if (parsed.success) {
      return parsed.data;
    }
  } catch {
    // The caller receives one sanitized credential error below.
  }

  throw new ProviderAccountRuntimeError("credentials_unavailable");
}

export function createProviderAccountRuntime({
  credentialEncryption,
  repository,
}: {
  credentialEncryption: CredentialEncryption;
  repository: ProviderAccountRepository;
}): ProviderAccountRuntime {
  async function markAuthenticationError(
    context: ProviderAccountExecutionContext,
    errorCode: "authorization_expired" | "credentials_unavailable",
  ): Promise<void> {
    const expectedEnvelope = context.account.credentialEnvelope;

    if (expectedEnvelope === null) return;

    try {
      const updated = await repository.markAccountAuthenticationError({
        accountId: context.account.id,
        errorCode,
        expectedEnvelope,
        integrationId: context.integration.id,
        membershipId: context.membershipId,
        workspaceId: context.workspaceId,
      });

      if (updated !== null) context.account = updated;
    } catch {
      // The provider failure remains the useful result for the caller. A
      // database failure must not replace it with an internal persistence
      // detail or expose credential state.
    }
  }

  async function refreshCredentials(
    context: ProviderAccountExecutionContext,
    adapter: IntegrationAdapter,
    credentials: OAuthCredentials,
  ): Promise<OAuthCredentials> {
    const expectedEnvelope = context.account.credentialEnvelope;

    if (expectedEnvelope === null) {
      throw new ProviderAccountRuntimeError("account_required");
    }

    // If a concurrent request already refreshed and stored this account's
    // credentials, use them instead of failing. Returns null when there is
    // no evidence a concurrent refresh actually happened, so the caller can
    // fall back to its own error.
    async function concurrentlyRefreshedCredentials(): Promise<OAuthCredentials | null> {
      const currentAccount = await repository.findAccount(
        context.workspaceId,
        context.integration.id,
        context.membershipId,
      );

      if (
        currentAccount?.status !== "connected" ||
        currentAccount.credentialEnvelope === expectedEnvelope
      ) {
        return null;
      }

      context.account = currentAccount;
      return readCredentials(credentialEncryption, currentAccount);
    }

    let refreshed: OAuthCredentials;

    try {
      refreshed = await adapter.refreshCredentials(credentials);
    } catch (error) {
      // Providers that issue single-use, rotating refresh tokens (for
      // example Bitbucket, and Atlassian's own 3LO refresh tokens) invalidate
      // the old token as soon as a concurrent request redeems it, so the
      // refresh call itself can fail with authorization_expired even though
      // another request already stored fresh credentials for this account.
      // Check for those before giving up.
      if (
        error instanceof ProviderAdapterError &&
        error.code === "authorization_expired"
      ) {
        const concurrent = await concurrentlyRefreshedCredentials();

        if (concurrent !== null) {
          return concurrent;
        }
      }

      throw error;
    }

    const replacementEnvelope = credentialEncryption.encrypt(
      refreshed,
      "integration-account",
      context.account.id,
    );
    const updated = await repository.replaceAccountCredentials(
      {
        accountId: context.account.id,
        credentialEnvelope: replacementEnvelope,
        integrationId: context.integration.id,
        lastValidatedAt: new Date(),
        membershipId: context.membershipId,
        status: "connected",
        workspaceId: context.workspaceId,
      },
      expectedEnvelope,
    );

    if (updated !== null) {
      context.account = updated;
      return refreshed;
    }

    const concurrent = await concurrentlyRefreshedCredentials();

    if (concurrent === null) {
      throw new ProviderAccountRuntimeError("account_required");
    }

    return concurrent;
  }

  return {
    async withCredentials(context, adapter, operation) {
      try {
        let credentials = readCredentials(
          credentialEncryption,
          context.account,
        );
        let refreshedBeforeRequest = false;

        if (new Date(credentials.expiresAt).getTime() <= Date.now() + 60_000) {
          credentials = await refreshCredentials(context, adapter, credentials);
          refreshedBeforeRequest = true;
        }

        try {
          return await operation(credentials);
        } catch (error) {
          if (
            !(error instanceof ProviderAdapterError) ||
            error.code !== "authorization_expired" ||
            refreshedBeforeRequest
          ) {
            throw error;
          }

          const refreshed = await refreshCredentials(
            context,
            adapter,
            credentials,
          );
          return await operation(refreshed);
        }
      } catch (error) {
        if (
          error instanceof ProviderAdapterError &&
          error.code === "authorization_expired"
        ) {
          await markAuthenticationError(context, "authorization_expired");
        } else if (
          error instanceof ProviderAccountRuntimeError &&
          error.code === "credentials_unavailable"
        ) {
          await markAuthenticationError(context, "credentials_unavailable");
        }

        throw error;
      }
    },
  };
}

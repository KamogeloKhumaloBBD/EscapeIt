import type {
  EncryptedCredentialEnvelope,
  Integration,
  IntegrationAccount,
  SaveIntegrationAccountInput,
} from "@context-layer/db";
import { z } from "zod";

import type { CredentialEncryption } from "../security/credential-encryption";
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
  async function refreshCredentials(
    context: ProviderAccountExecutionContext,
    adapter: IntegrationAdapter,
    credentials: OAuthCredentials,
  ): Promise<OAuthCredentials> {
    const expectedEnvelope = context.account.credentialEnvelope;

    if (expectedEnvelope === null) {
      throw new ProviderAccountRuntimeError("account_required");
    }

    const refreshed = await adapter.refreshCredentials(credentials);
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

    const currentAccount = await repository.findAccount(
      context.workspaceId,
      context.integration.id,
      context.membershipId,
    );

    if (currentAccount?.status !== "connected") {
      throw new ProviderAccountRuntimeError("account_required");
    }

    context.account = currentAccount;
    return readCredentials(credentialEncryption, currentAccount);
  }

  return {
    async withCredentials(context, adapter, operation) {
      let credentials = readCredentials(credentialEncryption, context.account);
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
        return operation(refreshed);
      }
    },
  };
}

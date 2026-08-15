import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import type {
  EncryptedCredentialEnvelope,
  JsonObject,
} from "@context-layer/db";
import { z } from "zod";

const credentialEnvelopeSchema = z.object({
  ciphertext: z.string().min(1),
  iv: z.string().min(1),
  tag: z.string().min(1),
  version: z.literal(1),
});

export type CredentialPurpose = "integration-account" | "notification-channel";

export class CredentialEncryptionError extends Error {
  constructor(message = "Credential encryption operation failed.") {
    super(message);
    this.name = "CredentialEncryptionError";
  }
}

export interface CredentialEncryption {
  decrypt(
    envelope: EncryptedCredentialEnvelope,
    purpose: CredentialPurpose,
    recordId: string,
  ): unknown;
  encrypt(
    value: JsonObject,
    purpose: CredentialPurpose,
    recordId: string,
  ): EncryptedCredentialEnvelope;
}

function authenticatedData(purpose: CredentialPurpose, recordId: string) {
  return Buffer.from(`context-layer:${purpose}:${recordId}`, "utf8");
}

function decodeEncryptionKey(encodedKey: string): Buffer {
  if (
    !/^[A-Za-z0-9+/]+={0,2}$/.test(encodedKey) ||
    encodedKey.length % 4 !== 0
  ) {
    throw new CredentialEncryptionError(
      "The credential encryption key is invalid.",
    );
  }

  const key = Buffer.from(encodedKey, "base64");
  const normalizedInput = encodedKey.replace(/=+$/, "");
  const normalizedOutput = key.toString("base64").replace(/=+$/, "");

  if (key.byteLength !== 32 || normalizedInput !== normalizedOutput) {
    throw new CredentialEncryptionError(
      "The credential encryption key is invalid.",
    );
  }

  return key;
}

function decodeBase64Url(value: string): Buffer {
  const decoded = Buffer.from(value, "base64url");

  if (decoded.toString("base64url") !== value) {
    throw new CredentialEncryptionError();
  }

  return decoded;
}

export function createCredentialEncryption(
  encodedKey: string,
): CredentialEncryption {
  const key = decodeEncryptionKey(encodedKey);

  return {
    decrypt(envelope, purpose, recordId) {
      try {
        const parsed = credentialEnvelopeSchema.parse(JSON.parse(envelope));
        const iv = decodeBase64Url(parsed.iv);
        const tag = decodeBase64Url(parsed.tag);
        const ciphertext = decodeBase64Url(parsed.ciphertext);

        if (iv.byteLength !== 12 || tag.byteLength !== 16) {
          throw new CredentialEncryptionError();
        }

        const decipher = createDecipheriv("aes-256-gcm", key, iv, {
          authTagLength: 16,
        });
        decipher.setAAD(authenticatedData(purpose, recordId));
        decipher.setAuthTag(tag);
        const plaintext = Buffer.concat([
          decipher.update(ciphertext),
          decipher.final(),
        ]);

        return JSON.parse(plaintext.toString("utf8")) as unknown;
      } catch {
        throw new CredentialEncryptionError();
      }
    },
    encrypt(value, purpose, recordId) {
      try {
        const iv = randomBytes(12);
        const cipher = createCipheriv("aes-256-gcm", key, iv, {
          authTagLength: 16,
        });
        cipher.setAAD(authenticatedData(purpose, recordId));
        const ciphertext = Buffer.concat([
          cipher.update(JSON.stringify(value), "utf8"),
          cipher.final(),
        ]);
        const envelope = JSON.stringify({
          ciphertext: ciphertext.toString("base64url"),
          iv: iv.toString("base64url"),
          tag: cipher.getAuthTag().toString("base64url"),
          version: 1,
        });

        return envelope as EncryptedCredentialEnvelope;
      } catch {
        throw new CredentialEncryptionError();
      }
    },
  };
}

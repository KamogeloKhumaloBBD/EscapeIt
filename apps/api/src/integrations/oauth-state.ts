import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import type { ProviderKey } from "@context-layer/db";
import { z } from "zod";

const payloadSchema = z.object({
  expiresAt: z.number().int().positive(),
  membershipId: z.string().min(1),
  nonce: z.string().min(32),
  provider: z.string().min(1),
});

export interface OAuthState {
  expiresAt: number;
  membershipId: string;
  nonce: string;
  provider: ProviderKey;
}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function createOAuthState(
  secret: string,
  membershipId: string,
  provider: ProviderKey,
): string {
  const payload = Buffer.from(
    JSON.stringify({
      expiresAt: Date.now() + 10 * 60 * 1_000,
      membershipId,
      nonce: randomBytes(24).toString("base64url"),
      provider,
    }),
    "utf8",
  ).toString("base64url");

  return `${payload}.${sign(payload, secret)}`;
}

export function verifyOAuthState(
  value: string,
  secret: string,
): OAuthState | null {
  const [payload, signature, extra] = value.split(".");

  if (payload === undefined || signature === undefined || extra !== undefined) {
    return null;
  }

  const expected = Buffer.from(sign(payload, secret), "utf8");
  const actual = Buffer.from(signature, "utf8");

  if (
    expected.byteLength !== actual.byteLength ||
    !timingSafeEqual(expected, actual)
  ) {
    return null;
  }

  try {
    const parsed = payloadSchema.safeParse(
      JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
    );

    if (!parsed.success || parsed.data.expiresAt <= Date.now()) {
      return null;
    }

    return parsed.data as OAuthState;
  } catch {
    return null;
  }
}

export function oauthStatesMatch(first: string, second: string): boolean {
  const firstValue = Buffer.from(first, "utf8");
  const secondValue = Buffer.from(second, "utf8");

  return (
    firstValue.byteLength === secondValue.byteLength &&
    timingSafeEqual(firstValue, secondValue)
  );
}

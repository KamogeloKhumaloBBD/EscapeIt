import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const schema = z.object({
  attemptId: z.uuid(),
  expiresAt: z.number().int().positive(),
  membershipId: z.uuid(),
  nonce: z.string().min(32),
  serverId: z.uuid(),
  workspaceId: z.uuid(),
});

export type CustomMcpOAuthState = z.infer<typeof schema>;

function signature(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function createCustomMcpOAuthState(
  secret: string,
  input: Omit<CustomMcpOAuthState, "expiresAt" | "nonce">,
): string {
  const payload = Buffer.from(
    JSON.stringify({
      ...input,
      expiresAt: Date.now() + 10 * 60 * 1_000,
      nonce: randomBytes(24).toString("base64url"),
    }),
  ).toString("base64url");
  return `${payload}.${signature(payload, secret)}`;
}

export function verifyCustomMcpOAuthState(
  value: string,
  secret: string,
): CustomMcpOAuthState | null {
  const [payload, supplied, extra] = value.split(".");
  if (payload === undefined || supplied === undefined || extra !== undefined) {
    return null;
  }
  const expected = Buffer.from(signature(payload, secret));
  const actual = Buffer.from(supplied);
  if (
    expected.byteLength !== actual.byteLength ||
    !timingSafeEqual(expected, actual)
  ) {
    return null;
  }
  try {
    const parsed = schema.safeParse(
      JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
    );
    return parsed.success && parsed.data.expiresAt > Date.now()
      ? parsed.data
      : null;
  } catch {
    return null;
  }
}

export function customMcpOAuthStatesMatch(
  first: string,
  second: string,
): boolean {
  const left = Buffer.from(first);
  const right = Buffer.from(second);
  return left.byteLength === right.byteLength && timingSafeEqual(left, right);
}

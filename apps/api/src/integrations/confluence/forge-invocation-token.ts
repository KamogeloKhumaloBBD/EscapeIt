import { createPublicKey, verify as verifySignature } from "node:crypto";

import { z } from "zod";

/**
 * Verification for the token Forge signs every remote invocation with.
 *
 * Unlike Jira and Bitbucket, a Forge delivery URL carries no secret — one
 * endpoint serves every installation — so this signature is the only proof a
 * request came from Atlassian. Written against node:crypto rather than a JWT
 * library to avoid adding a dependency, which means the checks a library would
 * do for us are made explicit below.
 */

const jwksUrl =
  "https://forge.cdn.prod.atlassian-dev.net/.well-known/jwks.json";
const issuer = "forge/invocation-token";
const jwksCacheMilliseconds = 60 * 60 * 1000;
const clockToleranceSeconds = 60;

const headerSchema = z.object({
  // Only RS256 is accepted. Allowing the algorithm to be chosen by the token
  // is how signature verification gets bypassed entirely ("alg": "none").
  alg: z.literal("RS256"),
  kid: z.string().min(1),
});

const claimsSchema = z.object({
  aud: z.union([z.string(), z.array(z.string())]),
  app: z
    .object({
      installation: z
        .object({ cloudId: z.string().min(1).optional() })
        .optional(),
    })
    .optional(),
  context: z.object({ cloudId: z.string().min(1).optional() }).optional(),
  exp: z.number(),
  iss: z.string(),
  nbf: z.number().optional(),
});

const jwkSchema = z.object({
  e: z.string().min(1),
  kid: z.string().min(1),
  kty: z.literal("RSA"),
  n: z.string().min(1),
});

const jwksSchema = z.object({ keys: z.array(jwkSchema) });

type Jwk = z.infer<typeof jwkSchema>;

let cachedKeys: { fetchedAt: number; keys: readonly Jwk[] } | null = null;

async function keySet(forceRefresh: boolean): Promise<readonly Jwk[]> {
  if (
    cachedKeys !== null &&
    !forceRefresh &&
    Date.now() - cachedKeys.fetchedAt < jwksCacheMilliseconds
  ) {
    return cachedKeys.keys;
  }

  const response = await fetch(jwksUrl, {
    signal: AbortSignal.timeout(5_000),
  });

  if (!response.ok) {
    return cachedKeys?.keys ?? [];
  }

  const parsed = jwksSchema.safeParse(await response.json());

  if (!parsed.success) {
    return cachedKeys?.keys ?? [];
  }

  cachedKeys = { fetchedAt: Date.now(), keys: parsed.data.keys };

  return parsed.data.keys;
}

function decodeSegment(segment: string): unknown {
  try {
    return JSON.parse(
      Buffer.from(segment, "base64url").toString("utf8"),
    ) as unknown;
  } catch {
    return null;
  }
}

function audienceMatches(
  audience: string | readonly string[],
  expected: string,
): boolean {
  return Array.isArray(audience)
    ? audience.includes(expected)
    : audience === expected;
}

/**
 * Returns the Confluence site (cloud) id the delivery came from, or null when
 * the token is missing, malformed, expired, signed by an unknown key, or
 * issued for a different app.
 */
export async function cloudIdFromInvocationToken(
  authorizationHeader: string | null,
  expectedAppId: string,
): Promise<string | null> {
  if (authorizationHeader === null) {
    return null;
  }

  const token = authorizationHeader.replace(/^Bearer\s+/iu, "").trim();
  const [encodedHeader, encodedClaims, encodedSignature] = token.split(".");

  if (
    encodedHeader === undefined ||
    encodedClaims === undefined ||
    encodedSignature === undefined
  ) {
    return null;
  }

  const header = headerSchema.safeParse(decodeSegment(encodedHeader));
  const claims = claimsSchema.safeParse(decodeSegment(encodedClaims));

  if (!header.success || !claims.success) {
    return null;
  }

  if (
    claims.data.iss !== issuer ||
    !audienceMatches(claims.data.aud, expectedAppId)
  ) {
    return null;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);

  if (
    claims.data.exp + clockToleranceSeconds < nowSeconds ||
    (claims.data.nbf !== undefined &&
      claims.data.nbf - clockToleranceSeconds > nowSeconds)
  ) {
    return null;
  }

  // A key id we have never seen usually means Atlassian rotated keys, so the
  // set is re-fetched once before giving up.
  let keys = await keySet(false);
  let jwk = keys.find((candidate) => candidate.kid === header.data.kid);

  if (jwk === undefined) {
    keys = await keySet(true);
    jwk = keys.find((candidate) => candidate.kid === header.data.kid);
  }

  if (jwk === undefined) {
    return null;
  }

  let signatureValid: boolean;

  try {
    signatureValid = verifySignature(
      "RSA-SHA256",
      Buffer.from(`${encodedHeader}.${encodedClaims}`),
      createPublicKey({ format: "jwk", key: jwk }),
      Buffer.from(encodedSignature, "base64url"),
    );
  } catch {
    return null;
  }

  if (!signatureValid) {
    return null;
  }

  return (
    claims.data.app?.installation?.cloudId ??
    claims.data.context?.cloudId ??
    null
  );
}

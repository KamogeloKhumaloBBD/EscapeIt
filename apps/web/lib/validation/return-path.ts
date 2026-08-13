import { z } from "zod";

const invitationReturnPathSchema = z
  .string()
  .regex(/^\/invite\/[A-Za-z0-9_-]{43}$/);

const oauthAuthorizationPathSchema = z
  .string()
  .max(8_192)
  .refine((value) => {
    if (!value.startsWith("/api/auth/oauth2/authorize?")) {
      return false;
    }

    const url = new URL(value, "https://context-layer.invalid");
    const query = url.searchParams;
    const scopes = new Set(query.get("scope")?.split(" ") ?? []);

    return (
      url.origin === "https://context-layer.invalid" &&
      url.pathname === "/api/auth/oauth2/authorize" &&
      url.hash === "" &&
      query.get("response_type") === "code" &&
      query.get("code_challenge_method") === "S256" &&
      scopes.has("mcp:access") &&
      query.has("client_id") &&
      query.has("code_challenge") &&
      query.has("sig") &&
      query.has("exp") &&
      query.has("ba_iat") &&
      query.getAll("ba_param").length > 0
    );
  });

export function safeReturnPath(value: unknown): string | null {
  const invitation = invitationReturnPathSchema.safeParse(value);

  if (invitation.success) {
    return invitation.data;
  }

  const oauthAuthorization = oauthAuthorizationPathSchema.safeParse(value);
  return oauthAuthorization.success ? oauthAuthorization.data : null;
}

export function oauthAuthorizationReturnPath(
  values: Record<string, string | string[] | undefined>,
): string | null {
  const query = new URLSearchParams();

  for (const [name, value] of Object.entries(values)) {
    if (typeof value === "string") {
      query.append(name, value);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        query.append(name, item);
      }
    }
  }

  return safeReturnPath(`/api/auth/oauth2/authorize?${query.toString()}`);
}

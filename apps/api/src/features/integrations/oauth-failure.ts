import { HttpError } from "../../errors";

export type OAuthFailureReason =
  | "account_access_required"
  | "authorization_expired"
  | "permission_required"
  | "provider_unavailable"
  | "unexpected";

export function oauthFailureReason(error: unknown): OAuthFailureReason {
  if (!(error instanceof HttpError)) return "unexpected";

  switch (error.code) {
    case "PROVIDER_RESOURCE_UNAVAILABLE":
    case "PROVIDER_RESOURCE_NOT_FOUND":
      return "account_access_required";
    case "PROVIDER_AUTHORIZATION_EXPIRED":
    case "CREDENTIALS_UNAVAILABLE":
      return "authorization_expired";
    case "PROVIDER_PERMISSION_REQUIRED":
      return "permission_required";
    case "PROVIDER_INVALID_RESPONSE":
    case "PROVIDER_UNAVAILABLE":
      return "provider_unavailable";
    default:
      return "unexpected";
  }
}

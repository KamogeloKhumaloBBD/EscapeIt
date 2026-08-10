import "server-only";

import { requestApi } from "@/lib/server/api-client";

export type AuthSessionStatus = "authenticated" | "anonymous" | "unavailable";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function getAuthSessionStatus(): Promise<AuthSessionStatus> {
  const result = await requestApi("/api/auth/get-session");

  if (!result.ok) {
    return "unavailable";
  }

  if (isRecord(result.data) && isRecord(result.data.user)) {
    return "authenticated";
  }

  return "anonymous";
}

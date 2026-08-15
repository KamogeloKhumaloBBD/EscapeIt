import { z } from "zod";

import type { ApiResult } from "@/lib/server/api-client";

const publicApiErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().trim().min(1),
  }),
});

export interface PublicApiError {
  code: string;
  message: string;
}

export function readPublicApiError(data: unknown): PublicApiError | null {
  const parsed = publicApiErrorSchema.safeParse(data);
  return parsed.success ? parsed.data.error : null;
}

export function apiErrorMessage(
  result: Pick<ApiResult, "data" | "status">,
  fallback: string,
): string {
  const publicError = readPublicApiError(result.data);

  if (publicError !== null) {
    return publicError.message;
  }

  if (result.status === 401) {
    return "Your session has expired. Sign in again to continue.";
  }

  if (result.status === 403) {
    return "You do not have permission to do that. Ask a workspace owner for access.";
  }

  if (result.status === 429) {
    return "Too many requests were made. Wait a moment, then try again.";
  }

  if (result.status >= 500) {
    return "The service is temporarily unavailable. Try again in a few minutes.";
  }

  return fallback;
}

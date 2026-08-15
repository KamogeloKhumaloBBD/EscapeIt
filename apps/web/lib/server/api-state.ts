import "server-only";

import type { ZodType } from "zod";

import { requestApi } from "@/lib/server/api-client";
import { apiErrorMessage } from "@/lib/server/api-error";

export type ApiState<T> =
  | { status: "anonymous" }
  | { data: T; status: "available" }
  | { status: "not-found" }
  | { message: string; status: "unavailable" };

export function extractDataField(data: unknown): unknown {
  if (typeof data !== "object" || data === null || !("data" in data)) {
    return null;
  }

  return Reflect.get(data, "data");
}

export function parseData<T>(data: unknown, schema: ZodType<T>): T | null {
  const parsed = schema.safeParse(extractDataField(data));
  return parsed.success && parsed.data !== undefined ? parsed.data : null;
}

export async function requestState<T>(
  path: `/api/${string}`,
  schema: ZodType<T>,
  unavailableMessage = "We couldn't load this information. Refresh the page to try again.",
): Promise<ApiState<T>> {
  const result = await requestApi(path);

  if (result.status === 401) {
    return { status: "anonymous" };
  }

  if (result.status === 404) {
    return { status: "not-found" };
  }

  if (!result.ok) {
    return {
      message: apiErrorMessage(result, unavailableMessage),
      status: "unavailable",
    };
  }

  const data = parseData(result.data, schema);
  return data === null
    ? { message: unavailableMessage, status: "unavailable" }
    : { data, status: "available" };
}

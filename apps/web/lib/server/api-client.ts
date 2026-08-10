import "server-only";

import { headers } from "next/headers";

const defaultApiUrl = "http://localhost:4000";
const defaultPublicAppUrl = "http://localhost:3000";
const defaultTimeoutMs = 10_000;

export interface ApiResult {
  data: unknown;
  ok: boolean;
  setCookies: string[];
  status: number;
}

export interface ApiRequestOptions {
  body?: unknown;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  timeoutMs?: number;
}

function readHttpUrl(name: string, fallback: string): URL {
  const value = process.env[name] ?? fallback;
  const url = new URL(value);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${name} must use HTTP or HTTPS.`);
  }

  return url;
}

async function readJson(response: Response): Promise<unknown> {
  if (!response.headers.get("content-type")?.includes("application/json")) {
    return null;
  }

  try {
    const data: unknown = await response.json();
    return data;
  } catch {
    return null;
  }
}

export async function requestApi(
  path: `/api/${string}`,
  options: ApiRequestOptions = {},
): Promise<ApiResult> {
  const incomingHeaders = await headers();
  const requestHeaders = new Headers({
    accept: "application/json",
    origin: readHttpUrl("PUBLIC_APP_URL", defaultPublicAppUrl).origin,
  });

  for (const name of ["cookie", "user-agent", "x-correlation-id"] as const) {
    const value = incomingHeaders.get(name);

    if (value !== null) {
      requestHeaders.set(name, value);
    }
  }

  let body: string | undefined;

  if (options.body !== undefined) {
    requestHeaders.set("content-type", "application/json");
    body = JSON.stringify(options.body);
  }

  try {
    const apiUrl = readHttpUrl("API_INTERNAL_URL", defaultApiUrl);
    const response = await fetch(new URL(path, apiUrl), {
      ...(body === undefined ? {} : { body }),
      cache: "no-store",
      headers: requestHeaders,
      method: options.method ?? "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(options.timeoutMs ?? defaultTimeoutMs),
    });

    return {
      data: await readJson(response),
      ok: response.ok,
      setCookies: response.headers.getSetCookie(),
      status: response.status,
    };
  } catch {
    return {
      data: null,
      ok: false,
      setCookies: [],
      status: 503,
    };
  }
}

import "server-only";

import { cookies } from "next/headers";
import { parseSetCookie } from "set-cookie-parser";

type SameSite = "lax" | "none" | "strict";
type Priority = "high" | "low" | "medium";

function parseSameSite(value: string | undefined): SameSite | undefined {
  const normalized = value?.toLowerCase();

  if (
    normalized === "lax" ||
    normalized === "none" ||
    normalized === "strict"
  ) {
    return normalized;
  }

  return undefined;
}

function parsePriority(header: string): Priority | undefined {
  const value = /(?:^|;)\s*priority=(high|low|medium)(?:;|$)/i.exec(
    header,
  )?.[1];

  if (value === undefined) {
    return undefined;
  }

  return value.toLowerCase() as Priority;
}

export async function applyResponseCookies(
  setCookieHeaders: readonly string[],
): Promise<void> {
  const cookieStore = await cookies();

  for (const header of setCookieHeaders) {
    const parsed = parseSetCookie(header, {
      decodeValues: true,
      split: false,
    })[0];

    if (parsed === undefined) {
      throw new Error("The authentication server returned an invalid cookie.");
    }

    const sameSite = parseSameSite(parsed.sameSite);
    const priority = parsePriority(header);

    cookieStore.set({
      name: parsed.name,
      value: parsed.value,
      ...(parsed.domain === undefined ? {} : { domain: parsed.domain }),
      ...(parsed.expires === undefined ? {} : { expires: parsed.expires }),
      ...(parsed.httpOnly === undefined ? {} : { httpOnly: parsed.httpOnly }),
      ...(parsed.maxAge === undefined ? {} : { maxAge: parsed.maxAge }),
      ...(parsed.partitioned === undefined
        ? {}
        : { partitioned: parsed.partitioned }),
      ...(parsed.path === undefined ? {} : { path: parsed.path }),
      ...(priority === undefined ? {} : { priority }),
      ...(sameSite === undefined ? {} : { sameSite }),
      ...(parsed.secure === undefined ? {} : { secure: parsed.secure }),
    });
  }
}

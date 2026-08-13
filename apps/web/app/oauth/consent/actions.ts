"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { requestApi } from "@/lib/server/api-client";
import { safeReturnPath } from "@/lib/validation/return-path";

export interface ConsentActionState {
  message: string | null;
  status: "idle" | "error";
}

const consentResponseSchema = z.object({
  redirect: z.boolean(),
  url: z.url(),
});

function safeOAuthRedirect(value: string): string | null {
  const url = new URL(value);
  return url.protocol === "http:" || url.protocol === "https:"
    ? url.toString()
    : null;
}

export async function consentAction(
  _previousState: ConsentActionState,
  formData: FormData,
): Promise<ConsentActionState> {
  const oauthQueryValue = formData.get("oauthQuery");
  const decision = formData.get("decision");
  const oauthQuery = typeof oauthQueryValue === "string" ? oauthQueryValue : "";

  if (
    (decision !== "allow" && decision !== "deny") ||
    safeReturnPath(`/api/auth/oauth2/authorize?${oauthQuery}`) === null
  ) {
    return {
      message: "This authorization request is invalid or has expired.",
      status: "error",
    };
  }

  const result = await requestApi("/api/auth/oauth2/consent", {
    body: {
      accept: decision === "allow",
      oauth_query: oauthQuery,
    },
    method: "POST",
  });
  const parsed = consentResponseSchema.safeParse(
    result.data ??
      (result.location === null
        ? null
        : { redirect: true, url: result.location }),
  );

  if (!result.ok || !parsed.success || !parsed.data.redirect) {
    return {
      message: "We couldn't complete this authorization request.",
      status: "error",
    };
  }

  const destination = safeOAuthRedirect(parsed.data.url);

  if (destination === null) {
    return {
      message: "The client supplied an invalid return address.",
      status: "error",
    };
  }

  redirect(destination);
}

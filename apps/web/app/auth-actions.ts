"use server";

import { redirect } from "next/navigation";

import type { SignOutActionState } from "@/components/auth/sign-out-state";
import { requestApi } from "@/lib/server/api-client";
import { applyResponseCookies } from "@/lib/server/response-cookies";

const genericSignOutError = "We couldn't sign you out. Please try again.";

export async function signOutAction(
  _previousState: SignOutActionState,
): Promise<SignOutActionState> {
  const result = await requestApi("/api/auth/sign-out", {
    method: "POST",
  });

  if (!result.ok || result.setCookies.length === 0) {
    return { error: genericSignOutError };
  }

  try {
    await applyResponseCookies(result.setCookies);
  } catch {
    return { error: genericSignOutError };
  }

  redirect("/");
}

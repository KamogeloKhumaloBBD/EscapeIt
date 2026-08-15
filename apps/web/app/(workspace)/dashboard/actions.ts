"use server";

import { redirect } from "next/navigation";

import type { SendDigestState } from "@/app/(workspace)/dashboard/action-state";
import { requestApi } from "@/lib/server/api-client";

/**
 * Express owns the owner check and the recipient list; this action only
 * translates the result for the UI. Nothing here decides who receives a digest.
 */
export async function sendDigestNowAction(
  _previousState: SendDigestState,
): Promise<SendDigestState> {
  const result = await requestApi("/api/digests/send-now", {
    method: "POST",
    // The request stays open while a small model writes one sentence per
    // connected tool, which is tens of seconds on shared CPU. The client's
    // ten-second default aborts long before that and reads as a failed send.
    timeoutMs: 180_000,
  });

  if (result.status === 401) {
    redirect("/sign-in");
  }

  if (result.status === 403) {
    return {
      message: "Only workspace owners can send the digest.",
      status: "error",
    };
  }

  if (!result.ok) {
    return {
      message: "We couldn't send the digest. Try again.",
      status: "error",
    };
  }

  return { message: "Digest on its way.", status: "success" };
}

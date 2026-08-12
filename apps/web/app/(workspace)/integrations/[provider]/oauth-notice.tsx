"use client";

import { useEffect } from "react";
import { toast } from "sonner";

export function OAuthNotice({
  accountLabel,
  result,
}: {
  accountLabel: string;
  result: string | undefined;
}) {
  useEffect(() => {
    if (result === undefined) {
      return;
    }

    if (result === "connected") {
      toast.success(`Your ${accountLabel} is connected.`);
    } else if (result === "cancelled") {
      toast.warning(`${accountLabel} authorization was cancelled.`);
    } else if (result === "invalid") {
      toast.error("The authorization request expired. Please try again.");
    } else {
      toast.error(`We couldn't connect your ${accountLabel}.`);
    }

    const url = new URL(window.location.href);
    url.searchParams.delete("oauth");
    window.history.replaceState(null, "", url);
  }, [accountLabel, result]);

  return null;
}

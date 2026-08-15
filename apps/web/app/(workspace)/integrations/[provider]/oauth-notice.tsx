"use client";

import { useEffect } from "react";
import { toast } from "sonner";

export function OAuthNotice({
  accountLabel,
  providerDisplayName,
  reason,
  result,
}: {
  accountLabel: string;
  providerDisplayName: string;
  reason: string | undefined;
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
    } else {
      const messages: Record<string, string> = {
        account_access_required: `This ${accountLabel} cannot access the ${providerDisplayName} installation selected for this workspace. Sign in with an account that has access, or ask a workspace owner to grant access.`,
        authorization_expired: `Your ${accountLabel} authorization has expired. Reconnect the account and try again.`,
        invalid_state:
          "The authorization request expired or was already used. Start the connection again.",
        permission_required: `This ${accountLabel} is missing a permission required by ${providerDisplayName}. Grant the requested permissions and reconnect.`,
        provider_unavailable: `${providerDisplayName} is temporarily unavailable. Wait a few minutes, then try connecting again.`,
        unexpected: `We couldn't connect your ${accountLabel}. Check the account and try again.`,
      };
      toast.error(
        reason === undefined
          ? messages.unexpected
          : (messages[reason] ?? messages.unexpected),
      );
    }

    const url = new URL(window.location.href);
    url.searchParams.delete("oauth");
    url.searchParams.delete("reason");
    window.history.replaceState(null, "", url);
  }, [accountLabel, providerDisplayName, reason, result]);

  return null;
}

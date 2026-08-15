"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { WorkspacePage } from "@/components/workspace-page";

import {
  dashboardTimeZoneCookieMaxAge,
  dashboardTimeZoneCookieName,
  parseDashboardTimeZone,
} from "./time-zone-cookie";

export function DashboardTimeZone({
  current,
  loading = false,
}: {
  current?: string;
  loading?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const serializedSearch = searchParams.toString();

  useEffect(() => {
    const browserTimeZone = parseDashboardTimeZone(
      Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    );

    if (browserTimeZone === undefined) return;

    const next = new URLSearchParams(serializedSearch);
    const hasLegacyParameter = next.has("timeZone");
    next.delete("timeZone");

    const timeZoneChanged = current !== browserTimeZone;
    if (timeZoneChanged) {
      const secure = window.location.protocol === "https:" ? "; Secure" : "";
      document.cookie =
        [
          `${dashboardTimeZoneCookieName}=${encodeURIComponent(browserTimeZone)}`,
          "Path=/dashboard",
          `Max-Age=${String(dashboardTimeZoneCookieMaxAge)}`,
          "SameSite=Lax",
        ].join("; ") + secure;
    }

    if (hasLegacyParameter) {
      const query = next.toString();
      router.replace(query.length === 0 ? "/dashboard" : `/dashboard?${query}`);
    } else if (timeZoneChanged) {
      router.refresh();
    }
  }, [current, router, serializedSearch]);

  if (!loading) return null;

  return (
    <WorkspacePage aria-label="Loading dashboard" role="status">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="mt-4 h-12 w-72 max-w-full" />
      <Skeleton className="mt-10 h-16 w-full" />
      <Skeleton className="mt-8 h-80 w-full" />
    </WorkspacePage>
  );
}

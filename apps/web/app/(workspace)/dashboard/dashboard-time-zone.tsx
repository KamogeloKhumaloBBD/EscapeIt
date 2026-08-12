"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { Skeleton } from "@/components/ui/skeleton";

export function DashboardTimeZone({
  current,
  loading = false,
}: {
  current?: string;
  loading?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const browserTimeZone =
      Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

    if (current === browserTimeZone) return;

    const next = new URLSearchParams(searchParams.toString());
    next.set("timeZone", browserTimeZone);
    router.replace(`/dashboard?${next.toString()}`);
  }, [current, router, searchParams]);

  if (!loading) return null;

  return (
    <main className="mx-auto w-full max-w-7xl px-5 pb-24 pt-9 sm:px-7 lg:px-10 lg:pt-12">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="mt-4 h-12 w-72 max-w-full" />
      <Skeleton className="mt-10 h-16 w-full" />
      <Skeleton className="mt-8 h-80 w-full" />
    </main>
  );
}

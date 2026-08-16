import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getAuthSessionStatus } from "@/lib/server/auth-session";

export async function AuthControl() {
  const sessionStatus = await getAuthSessionStatus();

  if (sessionStatus === "authenticated") {
    return (
      <Button asChild size="sm" variant="default">
        <Link href="/dashboard">Dashboard</Link>
      </Button>
    );
  }

  return (
    <Button asChild size="sm">
      <Link href="/sign-in">Sign in</Link>
    </Button>
  );
}

export function AuthControlSkeleton() {
  return <Skeleton className="h-9 w-[82px] rounded-none" />;
}

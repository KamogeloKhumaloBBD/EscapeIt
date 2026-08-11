import Link from "next/link";

import { SignOutForm } from "@/components/auth/sign-out-form";
import { Skeleton } from "@/components/ui/skeleton";

export function AppHeader({ showSignOut = true }: { showSignOut?: boolean }) {
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6 lg:px-8">
      <Link
        className="text-sm font-semibold tracking-[-0.02em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#15130f]"
        href="/"
      >
        Context Layer
      </Link>
      {showSignOut ? (
        <SignOutForm />
      ) : (
        <Link
          className="text-sm text-[#68635a] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#15130f]"
          href="/"
        >
          Home
        </Link>
      )}
    </header>
  );
}

export function AppHeaderSkeleton() {
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6 lg:px-8">
      <span className="text-sm font-semibold tracking-[-0.02em]">
        Context Layer
      </span>
      <Skeleton className="h-9 w-[76px] rounded-none" />
    </header>
  );
}

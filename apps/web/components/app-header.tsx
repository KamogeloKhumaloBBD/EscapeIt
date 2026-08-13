import Link from "next/link";

import { SignOutForm } from "@/components/auth/sign-out-form";
import { BrandIcon } from "@/components/brand-icon";
import { Skeleton } from "@/components/ui/skeleton";

export function AppHeader({ showSignOut = true }: { showSignOut?: boolean }) {
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6 lg:px-8">
      <Link
        className="flex items-center gap-2 text-sm font-semibold tracking-[-0.02em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#15130f]"
        href="/"
      >
        <BrandIcon className="size-6" />
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
      <span className="flex items-center gap-2 text-sm font-semibold tracking-[-0.02em]">
        <BrandIcon className="size-6" />
        Context Layer
      </span>
      <Skeleton className="h-9 w-[76px] rounded-none" />
    </header>
  );
}

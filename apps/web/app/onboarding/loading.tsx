import { AppHeaderSkeleton } from "@/components/app-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function OnboardingLoading() {
  return (
    <main className="min-h-screen bg-[#fbfaf7] text-[#15130f]">
      <AppHeaderSkeleton />
      <section
        aria-label="Loading workspace setup"
        className="mx-auto flex min-h-[calc(100vh-88px)] w-full max-w-md flex-col justify-center px-6 pb-24"
        role="status"
      >
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-4 h-11 w-72" />
        <Skeleton className="mt-4 h-6 w-full" />
        <div className="mt-10 space-y-6">
          <div className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-12 w-full rounded-none" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-10 w-full rounded-none" />
        </div>
      </section>
    </main>
  );
}

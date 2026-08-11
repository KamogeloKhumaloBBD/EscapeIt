import { AppHeaderSkeleton } from "@/components/app-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <main className="min-h-screen bg-[#fbfaf7] text-[#15130f]">
      <AppHeaderSkeleton />
      <section
        aria-label="Loading dashboard"
        className="mx-auto w-full max-w-6xl px-6 pb-24 pt-16 lg:px-8"
        role="status"
      >
        <Skeleton className="h-4 w-16" />
        <Skeleton className="mt-3 h-16 w-80" />
        <div className="mt-16 grid gap-10 border-y border-[#ded9cf] py-8 sm:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div className="space-y-3" key={item}>
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-9 w-12" />
            </div>
          ))}
        </div>
        <Skeleton className="mt-16 h-8 w-40" />
        <div className="mt-6 space-y-5">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      </section>
    </main>
  );
}

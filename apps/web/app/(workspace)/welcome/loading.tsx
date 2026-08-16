import { Skeleton } from "@/components/ui/skeleton";
import { WorkspacePage } from "@/components/workspace-page";

export default function WelcomeLoading() {
  return (
    <WorkspacePage
      aria-label="Loading welcome"
      className="lg:pt-16"
      role="status"
      width="focused"
    >
      <Skeleton className="h-3 w-32" />
      <Skeleton className="mt-4 h-12 w-full max-w-xl" />
      <Skeleton className="mt-4 h-6 w-full max-w-2xl" />
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((step) => (
          <Skeleton className="h-64 rounded-none" key={step} />
        ))}
      </div>
    </WorkspacePage>
  );
}

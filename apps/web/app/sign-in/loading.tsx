import { SignInShell } from "@/app/sign-in/sign-in-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function SignInLoading() {
  return (
    <SignInShell>
      <div
        className="mt-10 space-y-5"
        role="status"
        aria-label="Loading sign in"
      >
        <div className="space-y-2">
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-12 w-full rounded-none" />
        </div>
        <Skeleton className="h-10 w-full rounded-none" />
      </div>
    </SignInShell>
  );
}

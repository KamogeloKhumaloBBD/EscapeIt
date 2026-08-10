import type { ReactNode } from "react";
import Link from "next/link";

export function SignInShell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen bg-[#fbfaf7] px-6 py-6 text-[#15130f]">
      <div className="mx-auto flex w-full max-w-md flex-col">
        <header className="flex items-center justify-between">
          <Link
            href="/"
            className="text-sm font-semibold tracking-[-0.02em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#15130f]"
          >
            Context Layer
          </Link>
          <Link
            href="/"
            className="text-sm text-[#68635a] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#15130f]"
          >
            Home
          </Link>
        </header>

        <section className="flex flex-1 flex-col justify-center py-20">
          <p className="text-sm text-[#68635a]">Passwordless sign in</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.055em]">
            Bring your context with you.
          </h1>
          <p className="mt-4 leading-7 text-[#68635a]">
            Enter your email and we&apos;ll send you a short code.
          </p>

          {children}
        </section>
      </div>
    </main>
  );
}

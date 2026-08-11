import { redirect } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { getWorkspaceOverviewState } from "@/lib/server/workspace";

function formatActivityTime(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function DashboardPage() {
  const state = await getWorkspaceOverviewState();

  if (state.status === "anonymous") {
    redirect("/sign-in");
  }

  if (state.status === "without-workspace") {
    redirect("/onboarding");
  }

  return (
    <main className="min-h-screen bg-[#fbfaf7] text-[#15130f]">
      <AppHeader showSignOut={state.status !== "unavailable"} />
      {state.status === "unavailable" ? (
        <section className="mx-auto w-full max-w-6xl px-6 py-24 lg:px-8">
          <p className="text-sm text-[#68635a]">Dashboard</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.055em]">
            Your workspace is temporarily unavailable.
          </h1>
          <p className="mt-4 max-w-xl leading-7 text-[#68635a]">
            We couldn&apos;t reach the API. Refresh the page to try again.
          </p>
        </section>
      ) : (
        <section className="mx-auto w-full max-w-6xl px-6 pb-24 pt-16 lg:px-8">
          <p className="text-sm capitalize text-[#68635a]">
            {state.overview.role}
          </p>
          <h1 className="mt-3 text-5xl font-semibold tracking-[-0.06em] sm:text-6xl">
            {state.overview.name}
          </h1>

          <dl className="mt-16 grid gap-10 border-y border-[#ded9cf] py-8 sm:grid-cols-3">
            {[
              ["Members", state.overview.memberCount],
              [
                "Connected integrations",
                state.overview.connectedIntegrationCount,
              ],
              ["Active MCP tokens", state.overview.activeMcpTokenCount],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-sm text-[#68635a]">{label}</dt>
                <dd className="mt-2 text-3xl font-semibold tracking-[-0.04em]">
                  {value}
                </dd>
              </div>
            ))}
          </dl>

          <section className="mt-16" aria-labelledby="recent-activity-heading">
            <h2
              className="text-2xl font-semibold tracking-[-0.035em]"
              id="recent-activity-heading"
            >
              Recent activity
            </h2>
            {state.overview.recentActivity.length === 0 ? (
              <p className="mt-5 text-[#68635a]">No activity yet.</p>
            ) : (
              <ol className="mt-6 divide-y divide-[#ded9cf]">
                {state.overview.recentActivity.map((event) => (
                  <li
                    className="flex flex-col gap-1 py-5 sm:flex-row sm:items-center sm:justify-between"
                    key={event.id}
                  >
                    <div>
                      <p className="font-medium">{event.summary}</p>
                      <p className="mt-1 text-sm text-[#68635a]">
                        {event.category} · {event.status.replaceAll("_", " ")}
                      </p>
                    </div>
                    <time
                      className="text-sm text-[#817b72]"
                      dateTime={event.occurredAt}
                    >
                      {formatActivityTime(event.occurredAt)}
                    </time>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </section>
      )}
    </main>
  );
}

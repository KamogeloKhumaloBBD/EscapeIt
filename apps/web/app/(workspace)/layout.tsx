import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { WorkspaceShell } from "@/components/workspace-shell";
import { getCurrentWorkspaceState } from "@/lib/server/workspace";

export default async function WorkspaceLayout({
  children,
}: {
  children: ReactNode;
}) {
  const [state, cookieStore] = await Promise.all([
    getCurrentWorkspaceState(),
    cookies(),
  ]);

  if (state.status === "anonymous") {
    redirect("/sign-in");
  }

  if (state.status === "without-workspace") {
    redirect("/onboarding");
  }

  return (
    <WorkspaceShell
      defaultSidebarOpen={cookieStore.get("sidebar_state")?.value !== "false"}
      workspaceName={
        state.status === "available" ? state.workspace.name : "Workspace"
      }
      workspaceRole={state.status === "available" ? state.workspace.role : null}
    >
      {children}
    </WorkspaceShell>
  );
}

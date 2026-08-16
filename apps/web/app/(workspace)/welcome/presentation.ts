export type WelcomeSource = "invitation-accepted" | "workspace-created" | null;

export type WelcomeStepIcon = "agent" | "integrations" | "members" | "overview";

export interface WelcomeStep {
  action: string;
  description: string;
  href: string;
  icon: WelcomeStepIcon;
  title: string;
}

export function parseWelcomeSource(
  value: string | string[] | undefined,
): WelcomeSource {
  if (value === "workspace-created" || value === "invitation-accepted") {
    return value;
  }

  return null;
}

export function welcomeHeading(
  source: WelcomeSource,
  workspaceName: string,
): { description: string; eyebrow: string; title: string } {
  if (source === "workspace-created") {
    return {
      description: `Your shared context home, ${workspaceName}, is ready. Follow these steps to make it useful to your team and coding agents.`,
      eyebrow: "Workspace created",
      title: "Your workspace is ready.",
    };
  }

  if (source === "invitation-accepted") {
    return {
      description:
        "Your workspace owner manages shared resources and scopes. You only need to get oriented, connect your own accounts, and authorize your coding agent.",
      eyebrow: "Invitation accepted",
      title: `Welcome to ${workspaceName}.`,
    };
  }

  return {
    description:
      "Connect the context sources you use, then authorize your coding agent to work with them safely.",
    eyebrow: "Getting started",
    title: `Welcome to ${workspaceName}.`,
  };
}

const ownerSteps: readonly WelcomeStep[] = [
  {
    action: "Connect sources",
    description:
      "Choose workspace resources, allowed scopes, and the tools your team can use.",
    href: "/integrations",
    icon: "integrations",
    title: "Connect context sources",
  },
  {
    action: "Invite teammates",
    description:
      "Bring in your team while keeping every member's provider credentials personal.",
    href: "/members",
    icon: "members",
    title: "Bring in your team",
  },
  {
    action: "Set up an agent",
    description:
      "Register the workspace endpoint and authorize your coding client in the browser.",
    href: "/agent-setup",
    icon: "agent",
    title: "Connect your coding agent",
  },
];

const memberSteps: readonly WelcomeStep[] = [
  {
    action: "View teammates",
    description:
      "See who is in the workspace and understand the team you are sharing context with.",
    href: "/members",
    icon: "members",
    title: "Meet your workspace",
  },
  {
    action: "Connect accounts",
    description:
      "Use your own credentials for sources the workspace owner has already approved.",
    href: "/integrations",
    icon: "integrations",
    title: "Connect your personal accounts",
  },
  {
    action: "Set up your agent",
    description:
      "Authorize your coding client as you; it can only use context available to your identity.",
    href: "/agent-setup",
    icon: "agent",
    title: "Connect your coding agent",
  },
];

export function welcomeSteps(role: "member" | "owner"): readonly WelcomeStep[] {
  return role === "owner" ? ownerSteps : memberSteps;
}

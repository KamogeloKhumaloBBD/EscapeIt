import type { CustomMcpServer } from "@/lib/validation/custom-mcp";

export type CustomMcpStatusTone =
  "attention" | "disconnected" | "ready" | "setup";

export function customMcpStatusLabel(server: CustomMcpServer): string {
  if (server.status === "error") return "Needs attention";
  if (server.nextStep === "ready") return "Ready";
  if (server.nextStep === "connect_account") return "Not connected";
  if (server.nextStep === "wait_for_owner") return "Waiting for owner";
  return "Setup required";
}

export function customMcpStatusTone(
  server: CustomMcpServer,
): CustomMcpStatusTone {
  if (server.status === "error") return "attention";
  if (server.nextStep === "ready") return "ready";
  if (server.nextStep === "connect_account") return "disconnected";
  return "setup";
}

export function customMcpActionLabel(server: CustomMcpServer): string {
  if (server.nextStep === "ready") return "Manage";
  if (server.nextStep === "wait_for_owner") return "View setup";
  return "Continue setup";
}

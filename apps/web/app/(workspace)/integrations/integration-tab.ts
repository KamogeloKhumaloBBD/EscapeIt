export type IntegrationCatalogTab = "custom" | "platform";

export function parseIntegrationCatalogTab(
  value: string | null | undefined,
): IntegrationCatalogTab {
  return value === "custom" ? "custom" : "platform";
}

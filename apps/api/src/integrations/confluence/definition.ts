import {
  parseNotificationEventKey,
  parseProviderKey,
  parseScopeKey,
} from "@context-layer/db";

import type { ProviderDefinition } from "../provider-registry";

export const confluenceProvider = parseProviderKey("confluence");

export const confluenceDefinition = {
  capabilities: ["context", "user-accounts", "scopes", "notifications"],
  description: "Bring Confluence spaces and pages into your context layer.",
  displayName: "Confluence",
  key: confluenceProvider,
  mcpTools: [
    {
      description: "Return the connected member's Confluence account identity.",
      displayName: "Get my identity",
      kind: "read",
      name: "confluence_get_myself",
    },
    {
      description:
        "List allowlisted Confluence spaces visible to your account.",
      displayName: "List spaces",
      kind: "read",
      name: "confluence_list_spaces",
    },
    {
      description: "List pages in an allowlisted Confluence space.",
      displayName: "List pages",
      kind: "read",
      name: "confluence_list_pages",
    },
    {
      description: "Read one page from an allowlisted Confluence space.",
      displayName: "Get page",
      kind: "read",
      name: "confluence_get_page",
    },
    {
      description: "Search pages across allowlisted Confluence spaces.",
      displayName: "Search pages",
      kind: "read",
      name: "confluence_search_pages",
    },
    {
      description: "List child pages beneath an accessible Confluence page.",
      displayName: "Get page children",
      kind: "read",
      name: "confluence_get_page_children",
    },
    {
      description: "Read footer or inline comments from an accessible page.",
      displayName: "Get page comments",
      kind: "read",
      name: "confluence_get_page_comments",
    },
    {
      description: "List attachment metadata for an accessible page.",
      displayName: "List page attachments",
      kind: "read",
      name: "confluence_list_page_attachments",
    },
    {
      description: "Read a supported text, document, or image page attachment.",
      displayName: "Get page attachment",
      kind: "read",
      name: "confluence_get_page_attachment",
    },
    {
      description: "Create a published page in an allowlisted space.",
      displayName: "Create page",
      kind: "write",
      name: "confluence_create_page",
    },
    {
      description: "Update the title or body of an accessible published page.",
      displayName: "Update page",
      kind: "write",
      name: "confluence_update_page",
    },
    {
      description: "Add a footer comment to an accessible page.",
      displayName: "Add page comment",
      kind: "write",
      name: "confluence_add_page_comment",
    },
  ],
  notificationEvents: [
    {
      defaultEnabled: true,
      displayName: "Page created",
      key: parseNotificationEventKey("confluence.page-created"),
    },
    {
      defaultEnabled: true,
      displayName: "Page updated",
      key: parseNotificationEventKey("confluence.page-updated"),
    },
    {
      defaultEnabled: true,
      displayName: "Comments",
      key: parseNotificationEventKey("confluence.comment-created"),
    },
  ],
  requiresNotificationSetup: true,
  presentation: {
    accountLabel: "Atlassian account",
    resourceLabel: "Confluence site",
    scopeLabels: { plural: "spaces", singular: "space" },
  },
  resourceSelection: "authorization",
  scopeKinds: [
    {
      displayName: "Space",
      key: parseScopeKey("confluence.space"),
    },
  ],
} satisfies ProviderDefinition;

import {
  parseNotificationEventKey,
  parseProviderKey,
  parseScopeKey,
} from "@context-layer/db";

import type { ProviderDefinition } from "../provider-registry";

export const jiraProvider = parseProviderKey("jira");

export const jiraDefinition = {
  capabilities: ["context", "user-accounts", "scopes", "notifications"],
  description: "Bring Jira projects and work items into your context layer.",
  displayName: "Jira",
  key: jiraProvider,
  mcpTools: [
    {
      description: "Return the connected member's Jira account identity.",
      displayName: "Get my identity",
      kind: "read",
      name: "jira_get_myself",
    },
    {
      description: "Retrieve one issue from an allowed Jira project.",
      displayName: "Get issue",
      kind: "read",
      name: "jira_get_issue",
    },
    {
      description: "Search issues across allowed Jira projects.",
      displayName: "Search issues",
      kind: "read",
      name: "jira_search_issues",
    },
    {
      description: "List issues assigned to the connected Jira identity.",
      displayName: "Get assigned issues",
      kind: "read",
      name: "jira_get_assigned_issues",
    },
    {
      description: "Read comments from an issue in an allowed project.",
      displayName: "Get issue comments",
      kind: "read",
      name: "jira_get_issue_comments",
    },
    {
      description: "List allowlisted Jira projects visible to your account.",
      displayName: "List projects",
      kind: "read",
      name: "jira_list_projects",
    },
    {
      description: "List issue types available when creating an issue.",
      displayName: "Get create metadata",
      kind: "read",
      name: "jira_get_create_metadata",
    },
    {
      description: "Read bounded issue field and status history.",
      displayName: "Get issue changelog",
      kind: "read",
      name: "jira_get_issue_changelog",
    },
    {
      description: "List transitions currently available for an issue.",
      displayName: "Get issue transitions",
      kind: "read",
      name: "jira_get_issue_transitions",
    },
    {
      description: "Read bounded worklogs for an issue.",
      displayName: "Get issue worklogs",
      kind: "read",
      name: "jira_get_issue_worklogs",
    },
    {
      description: "List metadata for attachments on an issue.",
      displayName: "List issue attachments",
      kind: "read",
      name: "jira_list_issue_attachments",
    },
    {
      description: "Read a supported text, document, or image attachment.",
      displayName: "Get issue attachment",
      kind: "read",
      name: "jira_get_issue_attachment",
    },
    {
      description: "Create an issue in an allowed Jira project.",
      displayName: "Create issue",
      kind: "write",
      name: "jira_create_issue",
    },
    {
      description: "Add a comment to an accessible Jira issue.",
      displayName: "Add comment",
      kind: "write",
      name: "jira_add_comment",
    },
    {
      description: "Move an issue through an available Jira transition.",
      displayName: "Transition issue",
      kind: "write",
      name: "jira_transition_issue",
    },
  ],
  notificationEvents: [
    {
      defaultEnabled: true,
      displayName: "Issue updated",
      key: parseNotificationEventKey("jira.issue-updated"),
    },
  ],
  presentation: {
    accountLabel: "Atlassian account",
    resourceLabel: "Jira site",
    scopeLabels: { plural: "projects", singular: "project" },
  },
  resourceSelection: "authorization",
  scopeKinds: [
    {
      displayName: "Project",
      key: parseScopeKey("jira.project"),
    },
  ],
} satisfies ProviderDefinition;

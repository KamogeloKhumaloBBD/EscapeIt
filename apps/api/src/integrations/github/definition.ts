import { parseProviderKey, parseScopeKey } from "@context-layer/db";

import type { ProviderDefinition } from "../provider-registry";

export const githubProvider = parseProviderKey("github");
export const githubRepositoryScope = parseScopeKey("github.repository");

const githubMcpToolRows = [
  [
    "github_get_myself",
    "Get my identity",
    "Return the connected member's GitHub identity.",
    "read",
  ],
  [
    "github_list_repositories",
    "List repositories",
    "List allowlisted repositories visible to the connected GitHub identity.",
    "read",
  ],
  [
    "github_get_repository",
    "Get repository",
    "Retrieve one allowlisted repository.",
    "read",
  ],
  [
    "github_get_file",
    "Get file",
    "Read one bounded UTF-8 file from an allowlisted repository.",
    "read",
  ],
  [
    "github_search_code",
    "Search code",
    "Search code within one allowlisted repository.",
    "read",
  ],
  [
    "github_list_branches",
    "List branches",
    "List branches in an allowlisted repository.",
    "read",
  ],
  [
    "github_list_commits",
    "List commits",
    "List commits in an allowlisted repository.",
    "read",
  ],
  [
    "github_get_commit",
    "Get commit",
    "Retrieve one commit from an allowlisted repository.",
    "read",
  ],
  [
    "github_list_issues",
    "List issues",
    "List issues in an allowlisted repository.",
    "read",
  ],
  [
    "github_get_issue",
    "Get issue",
    "Retrieve one issue from an allowlisted repository.",
    "read",
  ],
  [
    "github_get_issue_comments",
    "Get issue comments",
    "List conversation comments for an issue or pull request.",
    "read",
  ],
  [
    "github_list_pull_requests",
    "List pull requests",
    "List pull requests in an allowlisted repository.",
    "read",
  ],
  [
    "github_get_pull_request",
    "Get pull request",
    "Retrieve one pull request from an allowlisted repository.",
    "read",
  ],
  [
    "github_get_pull_request_files",
    "Get pull request files",
    "List bounded file changes for a pull request.",
    "read",
  ],
  [
    "github_create_issue",
    "Create issue",
    "Create an issue in an allowlisted repository.",
    "write",
  ],
  [
    "github_add_comment",
    "Add comment",
    "Add a conversation comment to an issue or pull request.",
    "write",
  ],
  [
    "github_create_pull_request",
    "Create pull request",
    "Open a pull request between existing branches in one allowlisted repository.",
    "write",
  ],
  [
    "github_create_pull_request_with_changes",
    "Create pull request with changes",
    "Create a branch, one bounded text commit, and a pull request.",
    "write",
  ],
] as const;

export const githubDefinition = {
  autoSelectSingleResourceAfterAuthorization: true,
  capabilities: ["context", "user-accounts", "scopes"],
  description:
    "Bring allowlisted GitHub repositories, code, issues, and pull requests into your context layer.",
  displayName: "GitHub",
  key: githubProvider,
  mcpTools: githubMcpToolRows.map(([name, displayName, description, kind]) => ({
    description,
    displayName,
    kind,
    name,
  })),
  notificationEvents: [],
  presentation: {
    accountLabel: "GitHub account",
    resourceLabel: "GitHub App installation",
    scopeLabels: { plural: "repositories", singular: "repository" },
  },
  resourceSelection: "application",
  scopeKinds: [{ displayName: "Repository", key: githubRepositoryScope }],
} satisfies ProviderDefinition;

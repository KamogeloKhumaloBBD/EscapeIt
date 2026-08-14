import { parseProviderKey, parseScopeKey } from "@context-layer/db";

import type { ProviderDefinition } from "../provider-registry";

export const bitbucketProvider = parseProviderKey("bitbucket");

export const bitbucketDefinition = {
  capabilities: ["context", "user-accounts", "scopes"],
  description: "Bring Bitbucket repositories into your context layer.",
  displayName: "Bitbucket",
  key: bitbucketProvider,
  mcpTools: [
    {
      description: "Return the connected member's Bitbucket account identity.",
      displayName: "Get my identity",
      kind: "read",
      name: "bitbucket_get_myself",
    },
    {
      description:
        "List allowlisted Bitbucket repositories visible to your account.",
      displayName: "List repositories",
      kind: "read",
      name: "bitbucket_list_repositories",
    },
    {
      description: "Retrieve one allowlisted Bitbucket repository.",
      displayName: "Get repository",
      kind: "read",
      name: "bitbucket_get_repository",
    },
    {
      description:
        "List bounded commits on a branch in an allowlisted repository.",
      displayName: "List commits",
      kind: "read",
      name: "bitbucket_list_commits",
    },
    {
      description:
        "Read one commit and its bounded diff from an allowlisted repository.",
      displayName: "Get commit",
      kind: "read",
      name: "bitbucket_get_commit",
    },
    {
      description:
        "Read bounded file content at a path and ref in an allowlisted repository.",
      displayName: "Get file",
      kind: "read",
      name: "bitbucket_get_file",
    },
    {
      description:
        "Search code across allowlisted repositories in the workspace.",
      displayName: "Search code",
      kind: "read",
      name: "bitbucket_search_code",
    },
    {
      description: "List pull requests in an allowlisted repository.",
      displayName: "List pull requests",
      kind: "read",
      name: "bitbucket_list_pull_requests",
    },
    {
      description: "Retrieve one pull request from an allowlisted repository.",
      displayName: "Get pull request",
      kind: "read",
      name: "bitbucket_get_pull_request",
    },
    {
      description:
        "Read the bounded diff for a pull request in an allowlisted repository.",
      displayName: "Get pull request diff",
      kind: "read",
      name: "bitbucket_get_pull_request_diff",
    },
    {
      description:
        "List bounded comments on a pull request in an allowlisted repository.",
      displayName: "List pull request comments",
      kind: "read",
      name: "bitbucket_list_pull_request_comments",
    },
  ],
  notificationEvents: [],
  presentation: {
    accountLabel: "Atlassian account",
    resourceLabel: "Bitbucket workspace",
    scopeLabels: { plural: "repositories", singular: "repository" },
  },
  resourceSelection: "application",
  scopeKinds: [
    {
      displayName: "Repository",
      key: parseScopeKey("bitbucket.repository"),
    },
  ],
} satisfies ProviderDefinition;

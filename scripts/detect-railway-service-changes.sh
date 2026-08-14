#!/usr/bin/env bash

set -euo pipefail

service="${1:?Railway service name is required}"
target_sha="${2:?Target Git SHA is required}"
shift 2

if [[ "$#" -eq 0 ]]; then
  echo "At least one watched path is required." >&2
  exit 1
fi

railway_cli_version="${RAILWAY_CLI_VERSION:?RAILWAY_CLI_VERSION is required}"
railway_project_id="${RAILWAY_PROJECT_ID:?RAILWAY_PROJECT_ID is required}"
railway_environment="${RAILWAY_ENVIRONMENT:?RAILWAY_ENVIRONMENT is required}"

railway() {
  pnpm dlx "@railway/cli@$railway_cli_version" "$@"
}

changed=true
reason="No trustworthy successful $service deployment revision was found."
deployments_file="$(mktemp)"
railway_error_file="$(mktemp)"
trap 'rm -f "$deployments_file" "$railway_error_file"' EXIT

if railway deployment list \
  --project "$railway_project_id" \
  --environment "$railway_environment" \
  --service "$service" \
  --limit 100 \
  --json > "$deployments_file" 2> "$railway_error_file"; then
  if baseline="$(node -e '
    const fs = require("node:fs");
    const deployments = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    for (const deployment of deployments) {
      if (deployment.status !== "SUCCESS") continue;
      const direct = deployment.meta?.commitHash;
      if (typeof direct === "string" && /^[0-9a-f]{40}$/i.test(direct)) {
        process.stdout.write(direct);
        process.exit(0);
      }
      const message = deployment.meta?.cliMessage ?? deployment.meta?.commitMessage ?? deployment.meta?.message ?? "";
      const match = /github-sha:([0-9a-f]{40})/i.exec(message);
      if (match) {
        process.stdout.write(match[1]);
        process.exit(0);
      }
    }
  ' "$deployments_file")"; then
    if [[ -n "$baseline" ]] && git cat-file -e "$baseline^{commit}" 2>/dev/null; then
      if git merge-base --is-ancestor "$baseline" "$target_sha"; then
        if git diff --quiet "$baseline" "$target_sha" -- "$@"; then
          changed=false
          reason="No $service deployment inputs changed since revision $baseline."
        else
          reason="$service deployment inputs changed since revision $baseline."
        fi
      else
        reason="$service revision $baseline is not an ancestor of $target_sha."
      fi
    elif [[ -n "$baseline" ]]; then
      reason="$service revision $baseline is unavailable in Git history."
    fi
  else
    reason="$service deployment metadata could not be parsed; deploying defensively."
    echo "$reason" >&2
  fi
else
  reason="$service deployment history could not be read; deploying defensively."
  echo "$reason" >&2
  if [[ -s "$railway_error_file" ]]; then
    sed -n '1,40p' "$railway_error_file" >&2
  fi
fi

printf '%s\t%s\n' "$changed" "$reason"

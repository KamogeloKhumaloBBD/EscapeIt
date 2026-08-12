#!/usr/bin/env bash

set -euo pipefail

service="${1:?Railway service name is required}"
target_sha="${2:?Target Git SHA is required}"
railway_cli_version="${RAILWAY_CLI_VERSION:?RAILWAY_CLI_VERSION is required}"
railway_project_id="${RAILWAY_PROJECT_ID:?RAILWAY_PROJECT_ID is required}"
railway_environment="${RAILWAY_ENVIRONMENT:?RAILWAY_ENVIRONMENT is required}"

railway() {
  pnpm --silent dlx "@railway/cli@$railway_cli_version" "$@"
}

list_deployments() {
  railway deployment list \
    --project "$railway_project_id" \
    --environment "$railway_environment" \
    --service "$service" \
    --limit 100 \
    --json
}

before="$(list_deployments)"
before_ids="$(printf '%s' "$before" | node -e '
  let input = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => { input += chunk; });
  process.stdin.on("end", () => {
    for (const deployment of JSON.parse(input)) console.log(deployment.id);
  });
')"

railway up \
  --project "$railway_project_id" \
  --environment "$railway_environment" \
  --service "$service" \
  --detach \
  --yes \
  --message "github-sha:$target_sha service:$service"

deployment_id=""
for _ in $(seq 1 30); do
  current="$(list_deployments)"
  deployment_id="$(printf '%s' "$current" | BEFORE_IDS="$before_ids" node -e '
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { input += chunk; });
    process.stdin.on("end", () => {
      const before = new Set((process.env.BEFORE_IDS ?? "").split(/\s+/).filter(Boolean));
      const deployment = JSON.parse(input).find((item) => !before.has(item.id));
      if (deployment) process.stdout.write(deployment.id);
    });
  ')"
  [[ -n "$deployment_id" ]] && break
  sleep 2
done

if [[ -z "$deployment_id" ]]; then
  echo "Unable to identify the new $service deployment." >&2
  exit 1
fi

echo "Watching Railway deployment $deployment_id for $service."

for _ in $(seq 1 180); do
  deployments="$(list_deployments)"
  status="$(printf '%s' "$deployments" | DEPLOYMENT_ID="$deployment_id" node -e '
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { input += chunk; });
    process.stdin.on("end", () => {
      const deployment = JSON.parse(input).find((item) => item.id === process.env.DEPLOYMENT_ID);
      if (deployment) process.stdout.write(deployment.status);
    });
  ')"

  case "$status" in
    SUCCESS)
      echo "$service deployment $deployment_id succeeded."
      exit 0
      ;;
    FAILED|CRASHED|REMOVED)
      echo "$service deployment $deployment_id ended with status $status." >&2
      railway logs "$deployment_id" \
        --project "$railway_project_id" \
        --environment "$railway_environment" \
        --service "$service" \
        --build --lines 100 || true
      railway logs "$deployment_id" \
        --project "$railway_project_id" \
        --environment "$railway_environment" \
        --service "$service" \
        --deployment --lines 100 || true
      exit 1
      ;;
  esac

  sleep 15
done

echo "$service deployment $deployment_id timed out after 45 minutes." >&2
railway logs "$deployment_id" \
  --project "$railway_project_id" \
  --environment "$railway_environment" \
  --service "$service" \
  --deployment --lines 100 || true
exit 1

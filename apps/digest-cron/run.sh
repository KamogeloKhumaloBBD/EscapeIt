#!/bin/sh

set -eu

: "${DIGEST_RUN_URL:?DIGEST_RUN_URL is required}"
: "${DIGEST_RUN_SECRET:?DIGEST_RUN_SECRET is required}"

curl \
  --fail-with-body \
  --silent \
  --show-error \
  --request POST \
  --header "Accept: application/json" \
  --header "Authorization: Bearer ${DIGEST_RUN_SECRET}" \
  --connect-timeout 15 \
  --max-time 3600 \
  --retry 2 \
  --retry-connrefused \
  --retry-delay 5 \
  --retry-max-time 180 \
  "${DIGEST_RUN_URL}"

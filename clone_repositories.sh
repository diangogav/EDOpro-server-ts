#!/usr/bin/env bash
# clone_repositories.sh — FETCH stage: validate manifest, then fetch all sources.
#
# Stage: VALIDATE (RSM-005) then FETCH (RSM-006, RSM-007).
# Runs from repo root (D1 cwd invariant — no cd into subdirs).
# All checkout dirs are keyed by source id: repositories/<id> (D8).
# Sources are read exclusively from resources.manifest.json (RSM-010).
#
# Usage: bash clone_repositories.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/resources-lib.sh"

echo "Validating manifest..."
validate_manifest "$MANIFEST_PATH" || exit 1

echo "Fetching sources..."

# Support test override for repos root; default matches setup_resources.sh.
REPOS="${REPOS_ROOT:-./repositories}"

mkdir -p "$REPOS"

# Iterate all sources from the manifest
source_count=$(manifest_get '.sources | length')

i=0
while [ "$i" -lt "$source_count" ]; do
  src_id=$(manifest_get ".sources[$i].id")
  src_type=$(manifest_get ".sources[$i].type")
  src_url=$(manifest_get ".sources[$i].url")

  case "$src_type" in
    git)
      # Optional branch — jq returns "null" when the field is absent
      src_branch=$(manifest_get ".sources[$i].branch // \"\"")
      echo "  [git] $src_id"
      sync_repo "$src_id" "$src_url" "$src_branch"
      ;;
    http)
      src_filename=$(manifest_get ".sources[$i].filename")
      local_path="$REPOS/$src_filename"
      echo "  [http] $src_id -> $local_path"
      wget -qO "$local_path" "$src_url" || fail "wget failed for $src_id ($src_url)"
      http_integrity_check "$local_path" "$src_id" "$src_url" \
        || fail "Integrity check failed for $src_id — aborting fetch stage"
      ;;
    *)
      fail "Unknown source type '$src_type' for source '$src_id'"
      ;;
  esac

  i=$((i + 1))
done

echo "Repositories synced."

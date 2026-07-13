#!/usr/bin/env bash
# setup_resources.sh — ASSEMBLE + PUBLISH stage.
#
# Builds a fresh resource set into resources/releases/<id>, then atomically
# repoints resources/current at it. Safe to run while the server is reading
# resources/current: the swap is a single atomic rename, and in-flight reads
# keep their old release via open file handles (POSIX). Old releases are GC'd.
#
# Single source of truth for the resource layout — used by local dev, the
# Docker build (seed), and the runtime updater sidecar.
#
# CWD invariant (D1): runs from repo root; all paths are repo-root-relative.
# No cd into subdirs. Sources are read exclusively from resources.manifest.json
# (RSM-010). Assembly rules from manifest assembly[] (RSM-002/003/004).
#
# Usage: bash setup_resources.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/resources-lib.sh"

# Support test overrides for repos root and releases root.
REPOS="${REPOS_ROOT:-./repositories}"
RELEASES="${RELEASES_ROOT:-./resources/releases}"

ID="$(date +%Y%m%d-%H%M%S-%N)"
STAGING="$RELEASES/$ID"
KEEP="${RESOURCES_KEEP_RELEASES:-2}"

echo "Assembling resources into $STAGING ..."

mkdir -p "$STAGING"

# === ASSEMBLE: iterate assembly[] rules from the manifest ===

rule_count=$(manifest_get '.assembly | length')

# Resolve source directory for a given source id.
# git sources land at repositories/<id>; http sources land as a flat file
# at repositories/<filename>, so their "source dir" is repositories/ itself.
# Defined once before the loop; src_id is passed via jq --arg to avoid string
# interpolation into the filter.
_resolve_src_dir() {
  local src_id="$1"
  local src_type
  src_type=$(jq -r --arg id "$src_id" '.sources[] | select(.id == $id) | .type' "$MANIFEST_PATH")
  case "$src_type" in
    http) echo "$REPOS" ;;
    *)    echo "$REPOS/$src_id" ;;
  esac
}

i=0
while [ "$i" -lt "$rule_count" ]; do
  rule_target=$(manifest_get ".assembly[$i].target")
  rule_from=$(manifest_get ".assembly[$i].from")
  rule_from_type=$(manifest_get ".assembly[$i].from | type")
  rule_dir=$(manifest_get ".assembly[$i].dir // \"\"")
  rule_file=$(manifest_get ".assembly[$i].file // \"\"")
  rule_only=$(manifest_get ".assembly[$i].only // \"\"")

  full_target="$STAGING/$rule_target"

  if [ "$rule_from_type" = "array" ]; then
    # RSM-003 fallback chain — from is an array; a file key is required
    # (validated at manifest-validation time).
    # Build list of source dirs in order.
    from_count=$(manifest_get ".assembly[$i].from | length")
    src_dirs=()
    j=0
    while [ "$j" -lt "$from_count" ]; do
      from_id=$(manifest_get ".assembly[$i].from[$j]")
      src_dirs+=("$(_resolve_src_dir "$from_id")")
      j=$((j + 1))
    done
    apply_rule_with_fallback "$rule_file" "$full_target" "${src_dirs[@]}" \
      || fail "Assembly rule $i (target=$rule_target): fallback chain exhausted"
  else
    # Single source — from is a string source id
    src_dir="$(_resolve_src_dir "$rule_from")"
    apply_rule "$src_dir" "$rule_dir" "$rule_file" "$rule_only" "$full_target" \
      || fail "Assembly rule $i (target=$rule_target) failed"
  fi

  i=$((i + 1))
done

# === PUBLISH: strip .git, atomic swap, GC ===

# Strip .git from the assembled release (keep it in repositories/ so
# refreshes can pull deltas).
find "$STAGING" -name ".git" -type d -exec rm -rf {} +

# Atomic publish: repoint resources/current -> releases/<id>.
# Build the symlink under a temp name, then rename over the live one.
# rename(2) is atomic on the same filesystem, so readers never observe a
# missing or half-updated current.
# If a previous build left `current` as a real directory (e.g. a Docker COPY
# that dereferenced the symlink), drop it so the atomic symlink swap can land.
RESOURCES_DIR="$(dirname "$RELEASES")"
if [ -d "$RESOURCES_DIR/current" ] && [ ! -L "$RESOURCES_DIR/current" ]; then
  rm -rf "$RESOURCES_DIR/current"
fi
ln -sfn "$(basename "$RELEASES")/$ID" "$RESOURCES_DIR/.current.tmp"
mv -T "$RESOURCES_DIR/.current.tmp" "$RESOURCES_DIR/current"
echo "Published $RESOURCES_DIR/current -> releases/$ID"

# === GC: keep only the newest $KEEP releases ===
# The just-published release is the newest, so current is always retained.
ls -1dt "$RELEASES"/*/ 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -rf

echo "Resources assembled successfully."

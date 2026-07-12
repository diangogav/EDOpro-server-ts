#!/usr/bin/env bash
# resources-lib.sh — Shared library for clone_repositories.sh and setup_resources.sh
#
# Source this file; do NOT execute it directly.
# Resolved manifest path is cwd-invariant: callers may set MANIFEST_PATH to override.
#
# Usage:
#   source "$(dirname "${BASH_SOURCE[0]}")/resources-lib.sh"

# ---------------------------------------------------------------------------
# fail — log an error to stderr and exit 1
# ---------------------------------------------------------------------------
fail() {
  echo "[resources][ERROR] $*" >&2
  exit 1
}

# ---------------------------------------------------------------------------
# Default manifest path — resolved relative to this script's directory so
# it works regardless of caller cwd (D1 cwd invariant).
# Callers may override by setting MANIFEST_PATH before sourcing.
# ---------------------------------------------------------------------------
MANIFEST_PATH="${MANIFEST_PATH:-$(dirname "${BASH_SOURCE[0]}")/resources.manifest.json}"

# ---------------------------------------------------------------------------
# jq preflight — fail fast with a clear message if jq is not available
# ---------------------------------------------------------------------------
_check_jq() {
  command -v jq >/dev/null 2>&1 || fail "jq is required but not found in PATH. Install jq before running resource scripts."
}
_check_jq

# ---------------------------------------------------------------------------
# manifest_get — wrapper around jq queries on the manifest
# Usage: manifest_get <jq-filter> [manifest-path]
# ---------------------------------------------------------------------------
manifest_get() {
  local filter="$1"
  local path="${2:-$MANIFEST_PATH}"
  jq -r "$filter" "$path"
}

# ---------------------------------------------------------------------------
# validate_manifest — RSM-005 a-e fail-fast validation
# Usage: validate_manifest <manifest-path>
# Exits 0 on success, 1 on any violation (with message to stderr).
# ---------------------------------------------------------------------------
validate_manifest() {
  local manifest="${1:-$MANIFEST_PATH}"

  # (a) Well-formed JSON
  if ! jq empty "$manifest" 2>/dev/null; then
    echo "[resources][ERROR] Manifest validation failed (a): malformed JSON in $manifest" >&2
    return 1
  fi

  # (b) No unknown source types — only "git" and "http" are allowed
  local bad_types
  bad_types=$(jq -r '[.sources[] | select(.type != "git" and .type != "http")] | map(.id + " (type=" + .type + ")") | .[]' "$manifest" 2>/dev/null)
  if [ -n "$bad_types" ]; then
    echo "[resources][ERROR] Manifest validation failed (b): unknown source type(s): $bad_types" >&2
    return 1
  fi

  # (c) No dangling from-ids — every from value (string or array) must reference a declared source id
  local dangling
  dangling=$(jq -r '
    (.sources | map(.id)) as $ids |
    [
      .assembly[] |
      .from as $from |
      if ($from | type) == "array" then $from[] else $from end |
      select(. as $f | ($ids | index($f)) == null)
    ] | unique | .[]
  ' "$manifest" 2>/dev/null)
  if [ -n "$dangling" ]; then
    echo "[resources][ERROR] Manifest validation failed (c): dangling from-id(s): $dangling" >&2
    return 1
  fi

  # (d) file must be mutually exclusive with dir and only
  local bad_combos
  bad_combos=$(jq -r '
    [
      .assembly[] |
      select(
        (has("file") and (has("dir") or has("only")))
      ) |
      .target
    ] | .[]
  ' "$manifest" 2>/dev/null)
  if [ -n "$bad_combos" ]; then
    echo "[resources][ERROR] Manifest validation failed (d): file+dir or file+only combo in rule(s): $bad_combos" >&2
    return 1
  fi

  # (e) Target collision — two rules with the same target are only legal if the
  #     later rule (higher array index) has overwrite:true
  local collision_targets
  collision_targets=$(jq -r '
    [
      .assembly | to_entries |
      group_by(.value.target) |
      .[] |
      select(length > 1) |
      . as $group |
      # All entries after the first must carry overwrite:true
      # If any entry after the first does NOT have overwrite:true, report the target
      if ($group[1:] | map(select(.value.overwrite != true)) | length) > 0
      then $group[0].value.target
      else empty
      end
    ] | .[]
  ' "$manifest" 2>/dev/null)
  if [ -n "$collision_targets" ]; then
    echo "[resources][ERROR] Manifest validation failed (e): target collision without overwrite: $collision_targets" >&2
    return 1
  fi

  return 0
}

# ---------------------------------------------------------------------------
# http_integrity_check — RSM-006
# Usage: http_integrity_check <filepath> <source-id> <url>
# Checks: non-empty AND (for *.cdb) SQLite magic header.
# ---------------------------------------------------------------------------
http_integrity_check() {
  local filepath="$1"
  local src_id="$2"
  local url="$3"

  # (a) Non-empty
  if [ ! -s "$filepath" ]; then
    echo "[resources][ERROR] Integrity check failed for $src_id ($url): file is empty" >&2
    return 1
  fi

  # (b) For .cdb files: first 16 bytes must be the SQLite3 magic header
  case "$filepath" in
    *.cdb)
      local expected
      expected=$(printf 'SQLite format 3\x00')
      local actual
      actual=$(head -c 16 "$filepath")
      if [ "$actual" != "$expected" ]; then
        echo "[resources][ERROR] Integrity check failed for $src_id ($url): not a valid SQLite3 .cdb (bad magic header)" >&2
        return 1
      fi
      ;;
  esac

  return 0
}

# ---------------------------------------------------------------------------
# apply_rule — RSM-002/003 assembly rule executor
# Usage: apply_rule <src_dir> <dir> <file> <only> <target> <overwrite>
#   src_dir   : resolved source directory (repositories/<id>)
#   dir       : subdirectory within source (may be empty)
#   file      : single file path within source (may be empty)
#   only      : glob pattern for find -name (may be empty)
#   target    : destination path relative to staging root (caller provides full path)
#   overwrite : "true" or "" (collision legality already enforced at validate time)
#
# All four rule shapes (whole-source / dir / file / only-glob) are handled.
# find -name is used for glob to handle filenames with spaces and parentheses.
# ---------------------------------------------------------------------------
apply_rule() {
  local src_dir="$1"
  local dir="$2"
  local file="$3"
  local only="$4"
  local target="$5"
  local overwrite="$6"

  if [ -n "$file" ]; then
    # Single-file copy — target is the full destination file path (including name)
    local src_file="$src_dir/$file"
    mkdir -p "$(dirname "$target")"
    cp "$src_file" "$target"

  elif [ -n "$only" ]; then
    # Glob via find -name — handles spaces and parentheses safely
    local search_root="$src_dir"
    if [ -n "$dir" ]; then
      search_root="$src_dir/$dir"
    fi
    mkdir -p "$target"
    # find copies nothing when there are no matches — non-fatal per RSM-002
    find "$search_root" -maxdepth 1 -type f -name "$only" -exec cp -t "$target/" {} +

  elif [ -n "$dir" ]; then
    # Directory-only copy
    local src_subdir="$src_dir/$dir"
    mkdir -p "$target"
    cp -r "$src_subdir/." "$target/"

  else
    # Whole-source copy
    mkdir -p "$target"
    cp -r "$src_dir/." "$target/"
  fi
}

# ---------------------------------------------------------------------------
# apply_rule_with_fallback — RSM-003 ordered from[] fallback chain
# Usage: apply_rule_with_fallback <file> <target> <src_dir1> [<src_dir2> ...]
#   file    : file name to look for in each source dir
#   target  : destination file path (full path)
#   src_dirN: one or more source directories to try in order
#
# Uses the first source that contains the file. Aborts if no source has it.
# ---------------------------------------------------------------------------
apply_rule_with_fallback() {
  local file="$1"
  local target="$2"
  shift 2
  local sources=("$@")

  for src_dir in "${sources[@]}"; do
    local candidate="$src_dir/$file"
    if [ -f "$candidate" ]; then
      mkdir -p "$(dirname "$target")"
      cp "$candidate" "$target"
      return 0
    fi
  done

  echo "[resources][ERROR] Fallback chain exhausted: '$file' not found in any of: ${sources[*]}" >&2
  return 1
}

# ---------------------------------------------------------------------------
# sync_repo — RSM-007 git source behavior (moved verbatim from clone_repositories.sh)
# Usage: sync_repo <id> <url> <branch>
#   id     : source id — used as checkout directory name (repositories/<id>)
#   url    : git remote url
#   branch : branch name, or "" to use remote default branch
#
# Checkout dir is repositories/<id> relative to repo root (D1/D8: id-keyed, cwd-invariant).
# Caller must run from repo root.
# ---------------------------------------------------------------------------
sync_repo() {
  local id="$1"
  local url="$2"
  local branch="$3"
  local dir="repositories/$id"

  if [ -d "$dir/.git" ]; then
    if [ -n "$branch" ]; then
      git -C "$dir" fetch --depth 1 origin "$branch" >/dev/null 2>&1 &&
        git -C "$dir" reset --hard FETCH_HEAD >/dev/null 2>&1 && return 0
    else
      git -C "$dir" fetch --depth 1 >/dev/null 2>&1 &&
        git -C "$dir" reset --hard "@{u}" >/dev/null 2>&1 && return 0
    fi
    echo "[resources] update failed for $id — re-cloning"
    rm -rf "$dir"
  fi

  # Directory exists without .git (partial checkout, etc.) — start clean
  [ -d "$dir" ] && rm -rf "$dir"

  if [ -n "$branch" ]; then
    git clone --depth 1 --branch "$branch" "$url" "$dir"
  else
    git clone --depth 1 "$url" "$dir"
  fi
}

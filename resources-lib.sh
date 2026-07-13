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

  # (structural guard) sources and assembly must be arrays
  local sources_type assembly_type
  sources_type=$(jq -r '(.sources | type)' "$manifest" 2>/dev/null)
  if [ $? -ne 0 ] || [ "$sources_type" != "array" ]; then
    echo "[resources][ERROR] Manifest validation failed (structural): .sources must be an array, got ${sources_type:-error}" >&2
    return 1
  fi
  assembly_type=$(jq -r '(.assembly | type)' "$manifest" 2>/dev/null)
  if [ $? -ne 0 ] || [ "$assembly_type" != "array" ]; then
    echo "[resources][ERROR] Manifest validation failed (structural): .assembly must be an array, got ${assembly_type:-error}" >&2
    return 1
  fi

  # (structural guard) every assembly[] element must be an object — a bare string,
  # number, or null would pass the array check but silently produce wrong behaviour
  # when later jq queries assume object keys (.target, .from, etc.). Name the index.
  local non_object_elements
  non_object_elements=$(jq -r '[.assembly | to_entries[] | select((.value | type) != "object") | .key] | .[]' "$manifest" 2>/dev/null)
  if [ -n "$non_object_elements" ]; then
    echo "[resources][ERROR] Manifest validation failed (structural): assembly element(s) at index ${non_object_elements} must be objects, not $(jq -r ".assembly[${non_object_elements}] | type" "$manifest" 2>/dev/null)" >&2
    return 1
  fi

  # (RSM-001) assembly[] target must be non-empty — a rule with a missing/empty
  # target resolves to a literal "null/" (or bare) publish dir. Name the rule index.
  local empty_targets
  empty_targets=$(jq -r '[.assembly | to_entries[] | select((.value.target // "") == "") | .key] | .[]' "$manifest" 2>/dev/null)
  if [ -n "$empty_targets" ]; then
    echo "[resources][ERROR] Manifest validation failed (RSM-001): assembly rule(s) with empty/missing target at index: $empty_targets" >&2
    return 1
  fi

  # (RSM-001) sources[] field validation
  # (1) every source id must be non-empty
  local empty_ids
  empty_ids=$(jq -r '[.sources[] | select((.id // "") == "")] | length' "$manifest" 2>/dev/null)
  if [ "$empty_ids" != "0" ]; then
    echo "[resources][ERROR] Manifest validation failed (RSM-001): source with empty/missing id in $manifest" >&2
    return 1
  fi

  # (2) source ids must be unique
  local dup_ids
  dup_ids=$(jq -r '[.sources[].id] | (group_by(.) | map(select(length > 1) | .[0])) | .[]' "$manifest" 2>/dev/null)
  if [ -n "$dup_ids" ]; then
    echo "[resources][ERROR] Manifest validation failed (RSM-001): duplicate source id(s): $dup_ids" >&2
    return 1
  fi

  # (3) every source url must be non-empty
  local empty_urls
  empty_urls=$(jq -r '[.sources[] | select((.url // "") == "") | .id] | .[]' "$manifest" 2>/dev/null)
  if [ -n "$empty_urls" ]; then
    echo "[resources][ERROR] Manifest validation failed (RSM-001): empty/missing url in source(s): $empty_urls" >&2
    return 1
  fi

  # (4) http sources must include a non-empty filename
  local missing_filename
  missing_filename=$(jq -r '[.sources[] | select(.type == "http") | select((.filename // "") == "") | .id] | .[]' "$manifest" 2>/dev/null)
  if [ -n "$missing_filename" ]; then
    echo "[resources][ERROR] Manifest validation failed (RSM-001): http source(s) missing filename: $missing_filename" >&2
    return 1
  fi

  # (5) whole-source fallback is unsupported in this slice — an assembly rule
  #     whose from is an array MUST specify a file
  local array_no_file
  array_no_file=$(jq -r '[.assembly[] | select((.from | type) == "array") | select(has("file") | not) | .target] | .[]' "$manifest" 2>/dev/null)
  if [ -n "$array_no_file" ]; then
    echo "[resources][ERROR] Manifest validation failed (RSM-001): array from without file (whole-source fallback unsupported) in rule(s): $array_no_file" >&2
    return 1
  fi

  # (6) An http source resolves to a flat file under repositories/ (its "source
  #     dir" is repositories/ itself), so a rule referencing an http source
  #     without a `file` key would copy the whole repositories/ tree. Reject any
  #     rule whose from (string or any array element) points at an http source
  #     when the rule has no `file`. Name the offending rule target.
  local http_no_file
  http_no_file=$(jq -r '
    (.sources | map(select(.type == "http") | .id)) as $http |
    [
      .assembly[] |
      select(has("file") | not) |
      .target as $t |
      .from as $from |
      (if ($from | type) == "array" then $from[] else $from end) |
      select(. as $f | ($http | index($f)) != null) |
      $t
    ] | unique | .[]
  ' "$manifest" 2>/dev/null)
  if [ -n "$http_no_file" ]; then
    echo "[resources][ERROR] Manifest validation failed (RSM-001): rule(s) referencing an http source without a file key (whole-source/dir/only over a flat http file unsupported): $http_no_file" >&2
    return 1
  fi

  # (7) An http source lands as a flat file named <filename> under repositories/,
  #     so a rule whose resolved from (string or array element) is an http source
  #     MUST reference that exact file via `file` == source.filename. A mismatch
  #     would look for a non-existent file. Name the rule target + source id.
  local http_file_mismatch
  http_file_mismatch=$(jq -r '
    (.sources | map(select(.type == "http") | {id, filename})) as $http |
    ($http | map(.id)) as $http_ids |
    [
      .assembly[] |
      .target as $t |
      (.file // "") as $rfile |
      .from as $from |
      (if ($from | type) == "array" then $from[] else $from end) |
      select(. as $f | ($http_ids | index($f)) != null) as $sid |
      ($http[] | select(.id == $sid)) as $src |
      select($rfile != $src.filename) |
      ($t + " (source " + $sid + ": file=\"" + $rfile + "\" != filename=\"" + ($src.filename // "") + "\")")
    ] | unique | .[]
  ' "$manifest" 2>/dev/null)
  if [ -n "$http_file_mismatch" ]; then
    echo "[resources][ERROR] Manifest validation failed (RSM-001): rule file must equal http source filename: $http_file_mismatch" >&2
    return 1
  fi

  # (b) No unknown source types — only "git" and "http" are allowed.
  # Use (.type|tostring) so non-string type values (e.g. integers) are safely
  # converted rather than causing jq to error. Capture jq exit status explicitly
  # so a jq crash (non-zero exit) is treated as a hard validation failure
  # instead of silently passing (fail-open prevention).
  local bad_types jq_rc
  bad_types=$(jq -r '[.sources[] | select((.type|tostring) != "git" and (.type|tostring) != "http")] | map(.id + " (type=" + (.type|tostring) + ")") | .[]' "$manifest" 2>/dev/null)
  jq_rc=$?
  if [ $jq_rc -ne 0 ]; then
    echo "[resources][ERROR] Manifest validation failed (b): jq error while checking source types (exit $jq_rc)" >&2
    return 1
  fi
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

  # (b) For .cdb files: first 16 bytes must be the SQLite3 magic header.
  #     Case-insensitive match (${filepath,,}) so both .cdb and .CDB trigger the check.
  #     (D4) Binary comparison via cmp — command substitution strips the trailing
  #     NUL byte, so string comparison would only check 15 of 16 magic bytes and
  #     accept a file truncated to exactly "SQLite format 3". cmp compares the raw
  #     first 16 bytes; a file shorter than 16 bytes fails because cmp reports EOF.
  case "${filepath,,}" in
    *.cdb)
      if ! head -c 16 "$filepath" | cmp -s - <(printf 'SQLite format 3\000'); then
        echo "[resources][ERROR] Integrity check failed for $src_id ($url): not a valid SQLite3 .cdb (bad magic header)" >&2
        return 1
      fi
      ;;
  esac

  return 0
}

# ---------------------------------------------------------------------------
# apply_rule — RSM-002/003 assembly rule executor
# Usage: apply_rule <src_dir> <dir> <file> <only> <target>
#   src_dir   : resolved source directory (repositories/<id>)
#   dir       : subdirectory within source (may be empty)
#   file      : single file path within source (may be empty)
#   only      : glob pattern for find -name (may be empty)
#   target    : destination path relative to staging root (caller provides full path)
#
# All four rule shapes (whole-source / dir / file / only-glob) are handled.
# find -name is used for glob to handle filenames with spaces and parentheses.
# Overwrite legality is enforced at validate time (RSM-004); at copy time cp
# overwrites unconditionally, so no per-rule overwrite flag is consumed here.
# A missing single-file, or a missing named subdirectory, is a hard failure
# (exit 1) — distinct from an empty glob match in an existing dir, which is a
# non-fatal exit 0 per RSM-002.
# ---------------------------------------------------------------------------
apply_rule() {
  local src_dir="$1"
  local dir="$2"
  local file="$3"
  local only="$4"
  local target="$5"

  if [ -n "$file" ]; then
    # Single-file copy — target is the full destination file path (including name)
    local src_file="$src_dir/$file"
    if [ ! -f "$src_file" ]; then
      echo "[resources][ERROR] apply_rule: file '$file' not found in source '$src_dir'" >&2
      return 1
    fi
    mkdir -p "$(dirname "$target")"
    cp "$src_file" "$target"

  elif [ -n "$only" ]; then
    # Glob via find -name — handles spaces and parentheses safely
    local search_root="$src_dir"
    if [ -n "$dir" ]; then
      search_root="$src_dir/$dir"
      # Missing named subdirectory is a hard failure (distinct from empty glob)
      if [ ! -d "$search_root" ]; then
        echo "[resources][ERROR] apply_rule: subdirectory '$dir' not found in source '$src_dir'" >&2
        return 1
      fi
    fi
    mkdir -p "$target"
    # find copies nothing when there are no matches — non-fatal per RSM-002
    find "$search_root" -maxdepth 1 -type f -name "$only" -exec cp -t "$target/" {} +

  elif [ -n "$dir" ]; then
    # Directory-only copy
    local src_subdir="$src_dir/$dir"
    if [ ! -d "$src_subdir" ]; then
      echo "[resources][ERROR] apply_rule: subdirectory '$dir' not found in source '$src_dir'" >&2
      return 1
    fi
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
  # Checkout root honors REPOS_ROOT (default ./repositories), matching
  # setup_resources.sh, so both stages agree on where sources land.
  local repos_root="${REPOS_ROOT:-./repositories}"
  local dir="$repos_root/$id"

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

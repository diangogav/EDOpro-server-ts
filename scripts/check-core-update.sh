#!/usr/bin/env bash
# check-core-update.sh — Detect a newer published EDOPro core and open a bump PR.
#
# core/libocgcore.so is a prebuilt third-party binary. core/CMakeLists.txt only
# builds CoreIntegrator, and the Dockerfile core-builder stage copies the blob
# straight out of the repo, so whatever is committed here is what ships. There
# is no build step that would pick up an upstream fix on its own, and upstream
# publishes silently: this script is the only thing that notices.
#
# All IO lives here; the decisions live in core-update-lib.sh so bats can drive
# them with fixtures.
#
# CWD invariant: runs from repo root, matching the other resource scripts.
#
# Requires: GITHUB_TOKEN, jq, curl, nm (binutils), python3, gh, git.
#
# Usage: bash scripts/check-core-update.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/core-update-lib.sh
source "$SCRIPT_DIR/core-update-lib.sh"

# The source-commit range is already an approximation, so a long tail adds
# noise rather than information.
CORE_SOURCE_COMMITS_MAX="${CORE_SOURCE_COMMITS_MAX:-100}"

CORE_PR_BASE="${CORE_PR_BASE:-main}"

# 1 runs every check and renders the report without touching the working tree,
# creating a branch, pushing, or opening a PR.
CORE_UPDATE_DRY_RUN="${CORE_UPDATE_DRY_RUN:-0}"

GITHUB_TOKEN="${GITHUB_TOKEN:-}"
[ -n "$GITHUB_TOKEN" ] || core_fail "GITHUB_TOKEN is not set. The check needs an authenticated GitHub API token to read upstream history and open the PR."

for tool in curl git gh nm python3 sha256sum; do
	command -v "$tool" >/dev/null 2>&1 || core_fail "$tool is required but not found in PATH."
done

[ -f "$CORE_LOCAL_PATH" ] || core_fail "$CORE_LOCAL_PATH not found — run this from the repository root."

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

gh_api() {
	curl --fail --silent --show-error --location \
		--header "Authorization: Bearer $GITHUB_TOKEN" \
		--header "Accept: application/vnd.github+json" \
		--header "X-GitHub-Api-Version: 2022-11-28" \
		"$1"
}

# --- 1. Compare the committed blob against the published one ---------------

CURRENT_HASH="$(sha256sum "$CORE_LOCAL_PATH" | awk '{print $1}')"
core_log "Committed $CORE_LOCAL_PATH sha256: $CURRENT_HASH"

# The contents API with the raw media type rather than raw.githubusercontent.com,
# so the download is authenticated and counted against the token's rate limit.
NEW_SO="$WORK/libocgcore.new.so"
curl --fail --silent --show-error --location \
	--header "Authorization: Bearer $GITHUB_TOKEN" \
	--header "Accept: application/vnd.github.raw" \
	--header "X-GitHub-Api-Version: 2022-11-28" \
	--output "$NEW_SO" \
	"https://api.github.com/repos/$CORE_UPSTREAM_REPO/contents/$CORE_UPSTREAM_PATH?ref=$CORE_UPSTREAM_BRANCH" ||
	core_fail "Failed to download $CORE_UPSTREAM_PATH from $CORE_UPSTREAM_REPO@$CORE_UPSTREAM_BRANCH"
[ -s "$NEW_SO" ] || core_fail "Downloaded core is empty — refusing to compare against a truncated file."

NEW_HASH="$(sha256sum "$NEW_SO" | awk '{print $1}')"
core_log "Upstream $CORE_UPSTREAM_REPO@$CORE_UPSTREAM_BRANCH sha256: $NEW_HASH"

set +e
core_bump_needed "$CURRENT_HASH" "$NEW_HASH"
bump_status=$?
set -e
case "$bump_status" in
	0) : ;;
	1)
		core_log "Core is up to date with $CORE_UPSTREAM_REPO@$CORE_UPSTREAM_BRANCH — nothing to do."
		exit 0
		;;
	*) core_fail "Could not compare core hashes." ;;
esac

core_log "Upstream core differs from the committed one — building the evidence report."

# --- 2. Idempotency: never open a second PR for the same upstream build -----
#
# The branch name is derived from the new sha256, so the weekly schedule maps
# the same upstream build to the same branch. An existing branch or open PR
# means a previous run already reported this build and it is still waiting on
# the manual duel test.

BRANCH="$(core_branch_name "$NEW_HASH")"

if git ls-remote --exit-code --heads origin "$BRANCH" >/dev/null 2>&1; then
	core_log "Branch $BRANCH already exists on origin — this core was already reported. Nothing to do."
	exit 0
fi

existing_pr="$(gh pr list --state open --head "$BRANCH" --json number --jq '.[0].number // empty' 2>/dev/null || true)"
if [ -n "$existing_pr" ]; then
	core_log "PR #$existing_pr is already open for $BRANCH — nothing to do."
	exit 0
fi

# --- 3. Place both binaries in upstream history ----------------------------

new_commit_json="$(gh_api "https://api.github.com/repos/$CORE_UPSTREAM_REPO/commits?path=$CORE_UPSTREAM_PATH&sha=$CORE_UPSTREAM_BRANCH&per_page=1")" ||
	core_fail "Failed to list $CORE_UPSTREAM_REPO history for $CORE_UPSTREAM_PATH"
NEW_COMMIT="$(jq -r '.[0].sha // empty' <<<"$new_commit_json")"
NEW_COMMIT_DATE="$(jq -r '.[0].commit.committer.date // empty' <<<"$new_commit_json")"
[ -n "$NEW_COMMIT" ] && [ -n "$NEW_COMMIT_DATE" ] ||
	core_fail "Could not determine the newest $CORE_UPSTREAM_REPO commit touching $CORE_UPSTREAM_PATH."

# The committed binary's own origin comes from the pin file rather than from
# upstream, which records nothing that maps a published blob back to a commit.
BASELINE_SHA=""
BASELINE_DATE=""
baseline_entry="$(core_read_pin "$(cat "$CORE_PIN_PATH" 2>/dev/null)" "$CURRENT_HASH" || true)"
if [ -n "$baseline_entry" ]; then
	BASELINE_SHA="${baseline_entry%% *}"
	BASELINE_DATE="${baseline_entry##* }"
	core_log "Baseline from $CORE_PIN_PATH: $BASELINE_SHA ($BASELINE_DATE)"
else
	core_log "Baseline UNKNOWN — $CORE_PIN_PATH is missing, unreadable, or does not describe $CURRENT_HASH."
fi

# --- 4. Approximate the upstream source commits behind the new build -------
#
# Only meaningful when the baseline is known. Even then it is an
# approximation: DeltaBagooska may publish a build made from an older source
# commit, so the range is bounded by publish dates, not by build provenance.

if [ -n "$BASELINE_DATE" ]; then
	source_json="$(gh_api "https://api.github.com/repos/$CORE_SOURCE_REPO/commits?since=$BASELINE_DATE&until=$NEW_COMMIT_DATE&per_page=$CORE_SOURCE_COMMITS_MAX")" ||
		core_fail "Failed to list $CORE_SOURCE_REPO commits between $BASELINE_DATE and $NEW_COMMIT_DATE"
	SOURCE_COMMITS="$(jq -r --arg repo "$CORE_SOURCE_REPO" '
		.[] |
		"- [`\(.sha[0:7])`](https://github.com/\($repo)/commit/\(.sha)) \(.commit.message | split("\n")[0])"
	' <<<"$source_json")"
else
	SOURCE_COMMITS="_Not computed: the baseline revision is unknown, so there is no date to bound the range with._"
fi

# --- 5. Compatibility checks against the new binary ------------------------

abi_raw="$(python3 - "$NEW_SO" <<'PY' 2>&1 || true
import ctypes
import sys

lib = ctypes.CDLL(sys.argv[1])
major = ctypes.c_int()
minor = ctypes.c_int()
lib.OCG_GetVersion(ctypes.byref(major), ctypes.byref(minor))
print(f"{major.value}.{minor.value}")
PY
)"

set +e
core_abi_matches "$abi_raw" "$CORE_EXPECTED_ABI"
abi_status=$?
set -e
case "$abi_status" in
	0) ABI_RESULT="PASS — reports \`$(core_parse_abi "$abi_raw")\`" ;;
	1) ABI_RESULT="**FAIL — reports \`$(core_parse_abi "$abi_raw")\`, expected \`$CORE_EXPECTED_ABI\`. \`CoreIntegrator\` needs source work before this core can be used.**" ;;
	*) ABI_RESULT="**UNKNOWN — \`OCG_GetVersion\` could not be probed: \`$(printf '%s' "$abi_raw" | tr '\n' ' ')\`**" ;;
esac
core_log "ABI check: $abi_status ($abi_raw)"

missing_symbols="$(core_missing_symbols "$(nm --dynamic --defined-only "$NEW_SO" 2>/dev/null)")"
if [ -z "$missing_symbols" ]; then
	SYMBOLS_RESULT="PASS — all ${#CORE_REQUIRED_SYMBOLS[@]} symbols present"
else
	SYMBOLS_RESULT="**FAIL — missing: $(printf '%s' "$missing_symbols" | tr '\n' ' ')**"
fi
core_log "Symbol check: ${missing_symbols:-all present}"

REPORT="$WORK/pr-body.md"
core_report_body \
	"$BASELINE_SHA" "$BASELINE_DATE" "$CURRENT_HASH" \
	"$NEW_COMMIT" "$NEW_COMMIT_DATE" "$NEW_HASH" \
	"$SOURCE_COMMITS" "$ABI_RESULT" "$SYMBOLS_RESULT" > "$REPORT"

# Nothing above this line writes to the working tree, so a dry run is free to
# stop here and leave the repository exactly as it found it.
if [ "$CORE_UPDATE_DRY_RUN" = "1" ]; then
	core_log "Dry run — report written to $REPORT (working tree untouched, no branch or PR):"
	cat "$REPORT"
	exit 0
fi

# --- 6. Stage the new binary and the pin that describes it -----------------
#
# The exec bit has been lost twice before and each time needed a follow-up
# commit to restore it, so it is set and then asserted against what git
# actually recorded rather than against the filesystem.

cp "$NEW_SO" "$CORE_LOCAL_PATH"
chmod 755 "$CORE_LOCAL_PATH"
core_pin_json "$CORE_UPSTREAM_REPO" "$NEW_COMMIT" "$NEW_COMMIT_DATE" "$NEW_HASH" > "$CORE_PIN_PATH"

git checkout -b "$BRANCH"
git add -- "$CORE_LOCAL_PATH" "$CORE_PIN_PATH"

staged_mode="$(git ls-files --stage -- "$CORE_LOCAL_PATH" | awk '{print $1}')"
[ "$staged_mode" = "100755" ] ||
	core_fail "Staged mode for $CORE_LOCAL_PATH is $staged_mode, expected 100755. The core must stay executable."

git -c user.name="${GIT_AUTHOR_NAME:-github-actions[bot]}" \
	-c user.email="${GIT_AUTHOR_EMAIL:-41898282+github-actions[bot]@users.noreply.github.com}" \
	commit -m "chore(core): update libocgcore.so to ${NEW_COMMIT:0:7}"

git push origin "$BRANCH"

gh pr create \
	--base "$CORE_PR_BASE" \
	--head "$BRANCH" \
	--title "chore(core): update libocgcore.so to ${NEW_COMMIT:0:7}" \
	--body-file "$REPORT"

core_log "PR opened for $BRANCH."

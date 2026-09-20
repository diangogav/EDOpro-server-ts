#!/usr/bin/env bash
# core-update-lib.sh — Shared library for check-core-update.sh. Source it; do
# not execute it.
#
# core/libocgcore.so is a prebuilt third-party blob: nothing in this repo
# compiles it (core/CMakeLists.txt only builds CoreIntegrator), so an upstream
# bump can only be judged from the outside. Every decision that can be reached
# from plain text lives here and touches neither the network nor the working
# tree, so bats can drive it with fixtures; check-core-update.sh owns the IO.

core_fail() {
	echo "[core-update][ERROR] $*" >&2
	exit 1
}

core_log() {
	echo "[core-update] $*"
}

# The pin file is JSON, so a missing jq must fail loudly at source time instead
# of silently degrading every run to an unknown baseline.
command -v jq >/dev/null 2>&1 || core_fail "jq is required but not found in PATH. Install jq before running the core update check."

# DeltaBagooska publishes the binary EDOPro actually ships; it is NOT the
# diangogav/evolution-ygopro-core fork, which is a WASM core for the YGOPro
# path and has no bearing on this file. edo9300/ygopro-core is the source the
# binary is built from, used only to describe what changed. Overridable so
# tests and manual runs can point elsewhere.
CORE_UPSTREAM_REPO="${CORE_UPSTREAM_REPO:-ProjectIgnis/DeltaBagooska}"
CORE_UPSTREAM_BRANCH="${CORE_UPSTREAM_BRANCH:-master}"
CORE_UPSTREAM_PATH="${CORE_UPSTREAM_PATH:-bin/libocgcore.so}"
CORE_SOURCE_REPO="${CORE_SOURCE_REPO:-edo9300/ygopro-core}"
CORE_LOCAL_PATH="${CORE_LOCAL_PATH:-core/libocgcore.so}"

# Records which upstream revision the committed binary came from. Upstream
# commit messages carry no build provenance and the blob itself carries no
# version, so without this file the origin of the committed binary is not
# recoverable except by hashing upstream history one revision at a time.
CORE_PIN_PATH="${CORE_PIN_PATH:-core/libocgcore.version}"

# The ABI CoreIntegrator is written against. A different major/minor means the
# C++ side needs source work, so it must surface as a blocking finding rather
# than ride along in an automated bump.
CORE_EXPECTED_ABI="${CORE_EXPECTED_ABI:-11.0}"

# The exact symbols OCGRepository::loadFunctions resolves through dlsym. Any
# one missing makes the server throw at duel startup, so the whole list is
# checked rather than a spot sample.
CORE_REQUIRED_SYMBOLS=(
	OCG_GetVersion
	OCG_CreateDuel
	OCG_LoadScript
	OCG_DuelNewCard
	OCG_StartDuel
	OCG_DuelQueryCount
	OCG_DuelQueryLocation
	OCG_DuelProcess
	OCG_DuelGetMessage
	OCG_DuelSetResponse
	OCG_DuelQuery
	OCG_DuelQueryField
	OCG_DestroyDuel
)

# core_bump_needed <current-sha256> <upstream-sha256>
# 0 = differ (bump), 1 = identical, 2 = a hash is missing. Unknown must never
# read as "up to date", because that silently skips the update forever.
core_bump_needed() {
	local current="$1"
	local upstream="$2"

	if [ -z "$current" ] || [ -z "$upstream" ]; then
		echo "[core-update][ERROR] core_bump_needed: missing hash (current='$current' upstream='$upstream')" >&2
		return 2
	fi

	[ "$current" != "$upstream" ]
}

# core_branch_name <new-sha256>
# Deterministic on purpose: the workflow runs on a schedule, so the same
# upstream build must map to the same branch every week. That is what makes
# the "branch already exists" short-circuit an idempotency guard instead of a
# race that opens a duplicate PR each run.
core_branch_name() {
	local sha="$1"

	if [[ ! "$sha" =~ ^[0-9a-fA-F]{12,}$ ]]; then
		echo "[core-update][ERROR] core_branch_name: expected a hex sha256, got '$sha'" >&2
		return 1
	fi

	local lower="${sha,,}"
	printf 'chore/core-update-%s\n' "${lower:0:12}"
}

# core_pin_json <repo> <commit> <commit-date> <binary-sha256>
core_pin_json() {
	jq -n \
		--arg repo "$1" \
		--arg commit "$2" \
		--arg commit_date "$3" \
		--arg binary_sha256 "$4" \
		'{repo: $repo, commit: $commit, commit_date: $commit_date, binary_sha256: $binary_sha256}'
}

# core_read_pin <pin-json> <actual-binary-sha256> — prints "<commit> <date>".
#
# The recorded hash is a guard, not decoration: a binary swapped by hand
# without updating the pin leaves a stale commit behind, and a stale commit
# yields a source-commit range that looks authoritative and is wrong. Anything
# the guard does not vouch for — missing file, unparseable JSON, hash
# mismatch, missing fields — returns 1 so the caller reports UNKNOWN instead.
core_read_pin() {
	local pin_json="$1"
	local binary_sha256="$2"
	local baseline

	[ -n "$binary_sha256" ] || return 1

	baseline="$(jq -r --arg sha "$binary_sha256" '
		select((.binary_sha256 // "") == $sha)
		| select((.commit // "") != "" and (.commit_date // "") != "")
		| "\(.commit) \(.commit_date)"
	' <<<"$pin_json" 2>/dev/null)" || return 1

	[ -n "$baseline" ] || return 1
	printf '%s\n' "$baseline"
}

# core_parse_abi <raw-output> — the "<major>.<minor>" in OCG_GetVersion output.
# Accepts the shapes the dlopen probe can print ("11.0", "major=11 minor=0",
# "OCG_GetVersion -> 11.0"), and returns 1 when nothing version-shaped is there.
core_parse_abi() {
	local raw="$1"
	local version

	version=$(grep -oE '[0-9]+\.[0-9]+' <<<"$raw" | head -n 1)

	if [ -z "$version" ]; then
		version=$(grep -oE 'major[^0-9]*[0-9]+[^0-9]+minor[^0-9]*[0-9]+' <<<"$raw" | head -n 1 |
			grep -oE '[0-9]+' | paste -sd'.' -)
	fi

	[ -n "$version" ] || return 1
	printf '%s\n' "$version"
}

# core_abi_matches <raw-output> <expected-abi>
# 0 = match, 1 = mismatch, 2 = unparseable. Unparseable is kept distinct: a
# probe that failed to run tells us nothing about the ABI, and reporting it as
# a mismatch sends a reviewer looking for a source change that does not exist.
core_abi_matches() {
	local raw="$1"
	local expected="$2"
	local actual

	actual=$(core_parse_abi "$raw") || return 2
	[ "$actual" = "$expected" ]
}

# core_missing_symbols <nm-output> — one missing required symbol per line.
#
# Takes `nm --dynamic --defined-only` output verbatim ("<addr> T <name>") and
# compares the name field exactly. dlsym resolves exact names, so a substring
# or suffix match would let an unrelated XOCG_CreateDuel satisfy the check for
# OCG_CreateDuel and report a core that throws at duel startup as loadable.
core_missing_symbols() {
	local dump="$1"
	local symbol names

	names="$(awk 'NF { print $NF }' <<<"$dump")"

	for symbol in "${CORE_REQUIRED_SYMBOLS[@]}"; do
		grep -qxF -- "$symbol" <<<"$names" || printf '%s\n' "$symbol"
	done
}

# core_report_body <baseline-sha> <baseline-date> <current-hash> <new-commit>
#                  <new-date> <new-hash> <source-commits> <abi> <symbols>
#
# Headings mirror .github/pull_request_template.md (bilingual EN/ES) so a
# generated PR reads like a hand-written one. An empty baseline-sha renders
# the UNKNOWN variant.
#
# The body states outright that the checks are not evidence of gameplay
# correctness: they prove the blob loads and exposes the entry points, nothing
# about rulings. A silent core bump once broke an entire archetype's effect
# activation, which no ABI or symbol check would have caught.
core_report_body() {
	local baseline_sha="$1"
	local baseline_date="$2"
	local current_hash="$3"
	local new_commit="$4"
	local new_date="$5"
	local new_hash="$6"
	local source_commits="$7"
	local abi_result="$8"
	local symbols_result="$9"

	local baseline_line
	if [ -n "$baseline_sha" ]; then
		baseline_line="\`$baseline_sha\` (${baseline_date:-unknown date})"
	else
		baseline_line="**UNKNOWN** — \`$CORE_PIN_PATH\` does not describe the committed binary"
	fi

	[ -n "$source_commits" ] || source_commits="_No commits reported for this range._"

	cat <<REPORT_EOF
## Description / Descripción

Automated bump of \`$CORE_LOCAL_PATH\` to the build currently published by
[\`$CORE_UPSTREAM_REPO\`](https://github.com/$CORE_UPSTREAM_REPO) on \`$CORE_UPSTREAM_BRANCH\`.

| | Committed binary | Upstream binary |
| --- | --- | --- |
| sha256 | \`$current_hash\` | \`$new_hash\` |
| Upstream commit | $baseline_line | \`$new_commit\` (${new_date:-unknown date}) |

The binary is a prebuilt third-party artifact — nothing in this repository
compiles it — so the change is a blob swap and the evidence below is the only
description of what moved.

### Upstream source commits (APPROXIMATION)

Commits in [\`$CORE_SOURCE_REPO\`](https://github.com/$CORE_SOURCE_REPO) between the
baseline date and the new build date. This is an **approximation, not a
changelog**: $CORE_UPSTREAM_REPO publishes binaries without recording the source
revision they were built from, so a published build may be made from an older
source commit than its publish date suggests.

$source_commits

### Compatibility checks

| Check | Result |
| --- | --- |
| OCG ABI (\`OCG_GetVersion\`, expected \`$CORE_EXPECTED_ABI\`) | $abi_result |
| dlsym symbols required by \`OCGRepository::loadFunctions\` | $symbols_result |

## Related Issue(s) / Issue(s) relacionado(s)

_None._

## Checklist

- [ ] My code follows the project style and guidelines / Mi código sigue el estilo y las guías del proyecto
- [ ] I have added tests or examples if needed / He agregado tests o ejemplos si es necesario
- [ ] I have updated documentation if needed / He actualizado la documentación si es necesario
- [ ] The PR title is descriptive / El título del PR es descriptivo
- [ ] **Manual duel test on dev completed against this core** / **Prueba manual de duelo en dev completada contra este core**

## Additional Notes / Notas adicionales

**The checks above are NOT proof that gameplay is unaffected.** They establish
only that the new binary loads, reports the expected ABI, and exposes the entry
points the server resolves at startup. They say nothing about rulings, effect
resolution, or timing. A core change can alter card behaviour while passing
every check here.

**A manual duel test on dev is still required before merging.** Merging on the
strength of this report alone risks shipping a silent gameplay regression.

The binary must stay mode \`100755\`. The script sets and asserts the executable
bit, because losing it has previously required a follow-up commit to restore.
REPORT_EOF
}

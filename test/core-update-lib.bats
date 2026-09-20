#!/usr/bin/env bats
# test/core-update-lib.bats
# Bats test suite for scripts/core-update-lib.sh
#
# Self-contained: every fixture is built inline, so no binary artifacts are
# needed and the suite never touches the network.
#
# Run from repo root:
#   tools/bats-core/bin/bats test/core-update-lib.bats

REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)"
LIB="$REPO_ROOT/scripts/core-update-lib.sh"

# The real hashes from the bump that motivated this check: the committed blob
# and the build published two months later.
BASELINE_HASH="706b308ecf549637cc08542d2f9a16cffe15d95af35d7842656ace9d9df13d7e"
NEWER_HASH="8f2c1e4a9b7d6350aa12cc45de6789fb0123456789abcdef0123456789abcdef"

setup() {
	# shellcheck source=../scripts/core-update-lib.sh
	source "$LIB"
}

# The pin file as it sits in the repository: the upstream revision the
# committed binary was published at, plus the hash that vouches for it.
pin_fixture() {
	core_pin_json \
		"ProjectIgnis/DeltaBagooska" \
		"b18c609fdeadbeefdeadbeefdeadbeefdeadbeef" \
		"2026-06-04T00:00:00Z" \
		"${1:-$BASELINE_HASH}"
}

# nm --dynamic --defined-only output: "<address> <type> <name>".
nm_fixture() {
	printf '0000000000012345 T %s\n' "$@"
}

# ============================================================
# core_bump_needed — hash comparison
# ============================================================

@test "core_bump_needed: identical hashes mean no bump" {
	run core_bump_needed "$BASELINE_HASH" "$BASELINE_HASH"
	[ "$status" -eq 1 ]
}

@test "core_bump_needed: differing hashes mean a bump is needed" {
	run core_bump_needed "$BASELINE_HASH" "$NEWER_HASH"
	[ "$status" -eq 0 ]
}

@test "core_bump_needed: a missing hash is an error, never 'up to date'" {
	# Treating an unknown hash as equal would silently skip the update forever.
	run core_bump_needed "" "$NEWER_HASH"
	[ "$status" -eq 2 ]

	run core_bump_needed "$BASELINE_HASH" ""
	[ "$status" -eq 2 ]
}

# ============================================================
# core_pin_json / core_read_pin — the recorded baseline
# ============================================================

@test "core_pin_json: records the upstream repo, commit, date and binary hash" {
	run core_pin_json "ProjectIgnis/DeltaBagooska" "b18c609f" "2026-06-04T00:00:00Z" "$BASELINE_HASH"
	[ "$status" -eq 0 ]
	[ "$(jq -r '.repo' <<<"$output")" = "ProjectIgnis/DeltaBagooska" ]
	[ "$(jq -r '.commit' <<<"$output")" = "b18c609f" ]
	[ "$(jq -r '.commit_date' <<<"$output")" = "2026-06-04T00:00:00Z" ]
	[ "$(jq -r '.binary_sha256' <<<"$output")" = "$BASELINE_HASH" ]
}

@test "core_read_pin: a pin that matches the binary yields its commit and date" {
	run core_read_pin "$(pin_fixture)" "$BASELINE_HASH"
	[ "$status" -eq 0 ]
	[ "$output" = "b18c609fdeadbeefdeadbeefdeadbeefdeadbeef 2026-06-04T00:00:00Z" ]
}

@test "core_read_pin: a pin describing a different binary is refused" {
	# Someone swapped the binary by hand without updating the pin. The recorded
	# commit is now stale, and a stale commit yields a source-commit range that
	# looks authoritative and describes the wrong build.
	run core_read_pin "$(pin_fixture)" "$NEWER_HASH"
	[ "$status" -ne 0 ]
	[ -z "$output" ]
}

@test "core_read_pin: a missing or unparseable pin is refused, not guessed" {
	run core_read_pin "" "$BASELINE_HASH"
	[ "$status" -ne 0 ]
	[ -z "$output" ]

	run core_read_pin "not json at all" "$BASELINE_HASH"
	[ "$status" -ne 0 ]
	[ -z "$output" ]
}

@test "core_read_pin: a pin missing the commit fields is refused" {
	local partial
	partial="$(jq -n --arg sha "$BASELINE_HASH" '{binary_sha256: $sha}')"
	run core_read_pin "$partial" "$BASELINE_HASH"
	[ "$status" -ne 0 ]
	[ -z "$output" ]
}

@test "core_read_pin: the seeded pin describes the committed binary" {
	# The pin is only load-bearing while it tracks the blob next to it.
	local committed
	committed="$(sha256sum "$REPO_ROOT/core/libocgcore.so" | awk '{print $1}')"
	run core_read_pin "$(cat "$REPO_ROOT/core/libocgcore.version")" "$committed"
	[ "$status" -eq 0 ]
	[ -n "$output" ]
}

# ============================================================
# core_parse_abi / core_abi_matches — the ABI gate
# ============================================================

@test "core_parse_abi: reads the joined and the split output shapes" {
	run core_parse_abi "11.0"
	[ "$status" -eq 0 ]
	[ "$output" = "11.0" ]

	run core_parse_abi "OCG_GetVersion -> 11.0"
	[ "$status" -eq 0 ]
	[ "$output" = "11.0" ]

	run core_parse_abi "major=11 minor=0"
	[ "$status" -eq 0 ]
	[ "$output" = "11.0" ]
}

@test "core_abi_matches: the expected ABI passes" {
	run core_abi_matches "11.0" "11.0"
	[ "$status" -eq 0 ]
}

@test "core_abi_matches: a different ABI fails" {
	# An ABI change means CoreIntegrator needs source work, so it must never be
	# bumped through silently.
	run core_abi_matches "12.0" "11.0"
	[ "$status" -eq 1 ]

	run core_abi_matches "11.1" "11.0"
	[ "$status" -eq 1 ]
}

@test "core_abi_matches: unparseable probe output is distinct from a mismatch" {
	# A probe that failed to run says nothing about the ABI; reporting it as a
	# mismatch would send a reviewer hunting a source change that does not exist.
	run core_abi_matches "OSError: cannot open shared object file" "11.0"
	[ "$status" -eq 2 ]
}

# ============================================================
# core_missing_symbols — the dlsym contract
# ============================================================

@test "core_missing_symbols: an nm dump with all 13 symbols reports nothing missing" {
	run core_missing_symbols "$(nm_fixture "${CORE_REQUIRED_SYMBOLS[@]}")"
	[ "$status" -eq 0 ]
	[ -z "$output" ]
}

@test "core_missing_symbols: a dropped symbol is named" {
	local dump
	dump="$(nm_fixture "${CORE_REQUIRED_SYMBOLS[@]}" | grep -v 'OCG_DuelQueryField$')"
	run core_missing_symbols "$dump"
	[ "$status" -eq 0 ]
	[ "$output" = "OCG_DuelQueryField" ]
}

@test "core_missing_symbols: a name that merely ends with a required symbol does not satisfy it" {
	# dlsym resolves exact names, so XOCG_CreateDuel is a different symbol and
	# the core would still throw at duel startup.
	local dump
	dump="$(nm_fixture "${CORE_REQUIRED_SYMBOLS[@]}" | sed 's/ OCG_CreateDuel$/ XOCG_CreateDuel/')"
	run core_missing_symbols "$dump"
	[ "$status" -eq 0 ]
	[ "$output" = "OCG_CreateDuel" ]
}

# ============================================================
# core_branch_name — deterministic, so the schedule is idempotent
# ============================================================

@test "core_branch_name: derives a stable branch from the new sha256" {
	run core_branch_name "$BASELINE_HASH"
	[ "$status" -eq 0 ]
	[ "$output" = "chore/core-update-706b308ecf54" ]
}

@test "core_branch_name: the same hash always yields the same branch" {
	# This is what makes the weekly run skip a build it already reported
	# instead of opening a duplicate PR.
	run core_branch_name "$BASELINE_HASH"
	local first="$output"
	run core_branch_name "$BASELINE_HASH"
	[ "$output" = "$first" ]
}

@test "core_branch_name: uppercase input normalises to the same branch" {
	run core_branch_name "${BASELINE_HASH^^}"
	[ "$status" -eq 0 ]
	[ "$output" = "chore/core-update-706b308ecf54" ]
}

@test "core_branch_name: a non-hex or too-short input is rejected" {
	run core_branch_name "not-a-hash"
	[ "$status" -eq 1 ]

	run core_branch_name "706b30"
	[ "$status" -eq 1 ]
}

# ============================================================
# core_report_body — the PR body
# ============================================================

@test "core_report_body: keeps the bilingual template headings" {
	run core_report_body "b18c609f" "2026-06-04T00:00:00Z" "$BASELINE_HASH" \
		"8eba148a" "2026-08-17T00:00:00Z" "$NEWER_HASH" \
		"- commit one" "PASS" "PASS"
	[ "$status" -eq 0 ]
	[[ "$output" == *"## Description / Descripción"* ]]
	[[ "$output" == *"## Related Issue(s) / Issue(s) relacionado(s)"* ]]
	[[ "$output" == *"## Checklist"* ]]
	[[ "$output" == *"## Additional Notes / Notas adicionales"* ]]
}

@test "core_report_body: states the checks are not proof and leaves the manual test unchecked" {
	run core_report_body "b18c609f" "2026-06-04T00:00:00Z" "$BASELINE_HASH" \
		"8eba148a" "2026-08-17T00:00:00Z" "$NEWER_HASH" \
		"- commit one" "PASS" "PASS"
	[ "$status" -eq 0 ]
	[[ "$output" == *"NOT proof"* ]]
	[[ "$output" == *"manual duel test on dev is still required"* ]]
	[[ "$output" == *"- [ ] **Manual duel test on dev completed against this core**"* ]]
}

@test "core_report_body: labels the source commit range as an approximation" {
	run core_report_body "b18c609f" "2026-06-04T00:00:00Z" "$BASELINE_HASH" \
		"8eba148a" "2026-08-17T00:00:00Z" "$NEWER_HASH" \
		"- commit one" "PASS" "PASS"
	[ "$status" -eq 0 ]
	[[ "$output" == *"APPROXIMATION"* ]]
}

@test "core_report_body: an unresolved baseline is reported as UNKNOWN, not invented" {
	run core_report_body "" "" "$BASELINE_HASH" \
		"8eba148a" "2026-08-17T00:00:00Z" "$NEWER_HASH" \
		"" "PASS" "PASS"
	[ "$status" -eq 0 ]
	[[ "$output" == *"UNKNOWN"* ]]
}

# ============================================================
# check-core-update.sh — the dry run contract
# ============================================================

# Builds a repository-shaped sandbox plus stubs for every external tool the
# script reaches for, so the dry run can be driven end to end offline.
dry_run_sandbox() {
	local work="$1"
	mkdir -p "$work/repo/core" "$work/bin"

	printf 'committed-core-bytes' > "$work/repo/core/libocgcore.so"
	chmod 755 "$work/repo/core/libocgcore.so"
	core_pin_json "ProjectIgnis/DeltaBagooska" "b18c609f" "2026-06-04T00:00:00Z" \
		"$(sha256sum "$work/repo/core/libocgcore.so" | awk '{print $1}')" \
		> "$work/repo/core/libocgcore.version"

	cat > "$work/bin/curl" <<'STUB'
#!/usr/bin/env bash
out=""
url=""
while [ $# -gt 0 ]; do
	case "$1" in
		--output) out="$2"; shift 2 ;;
		--header) shift 2 ;;
		--fail|--silent|--show-error|--location) shift ;;
		*) url="$1"; shift ;;
	esac
done
if [ -n "$out" ]; then
	printf 'upstream-core-bytes' > "$out"
	exit 0
fi
case "$url" in
	*DeltaBagooska/commits*) printf '[{"sha":"1111111111111111111111111111111111111111","commit":{"committer":{"date":"2026-09-01T00:00:00Z"}}}]' ;;
	*) printf '[]' ;;
esac
STUB

	# No branch on origin and no open PR, so the run reaches the checks.
	printf '#!/usr/bin/env bash\nexit 1\n' > "$work/bin/git"
	printf '#!/usr/bin/env bash\nexit 0\n' > "$work/bin/gh"
	printf '#!/usr/bin/env bash\necho 11.0\n' > "$work/bin/python3"
	{
		echo '#!/usr/bin/env bash'
		printf "printf '0000000000012345 T %%s\\\\n' %s\n" "${CORE_REQUIRED_SYMBOLS[*]}"
	} > "$work/bin/nm"

	chmod +x "$work/bin"/*
}

@test "check-core-update: a dry run leaves the working tree byte-identical" {
	# Dry run is the only way to inspect a bump before it lands, so a dry run
	# that overwrites the committed core silently destroys what it was meant to
	# preserve.
	local work
	work="$(mktemp -d)"
	dry_run_sandbox "$work"

	local before_core before_pin
	before_core="$(sha256sum "$work/repo/core/libocgcore.so" | awk '{print $1}')"
	before_pin="$(sha256sum "$work/repo/core/libocgcore.version" | awk '{print $1}')"

	cd "$work/repo"
	PATH="$work/bin:$PATH" GITHUB_TOKEN="stub-token" CORE_UPDATE_DRY_RUN=1 \
		run bash "$REPO_ROOT/scripts/check-core-update.sh"

	[ "$status" -eq 0 ]
	[[ "$output" == *"Dry run"* ]]
	[[ "$output" == *"## Description / Descripción"* ]]
	[ "$(sha256sum "$work/repo/core/libocgcore.so" | awk '{print $1}')" = "$before_core" ]
	[ "$(sha256sum "$work/repo/core/libocgcore.version" | awk '{print $1}')" = "$before_pin" ]

	rm -rf "$work"
}

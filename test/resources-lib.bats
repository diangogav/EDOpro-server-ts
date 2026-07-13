#!/usr/bin/env bats
# test/resources-lib.bats
# Bats test suite for resources-lib.sh
# Covers: RSM-002, RSM-003, RSM-004, RSM-005, RSM-006, RSM-012
#
# Self-contained: all fixtures are generated in setup() — no binary files
# in git (avoids *repositories/ and *.cdb gitignore patterns).
#
# Run from repo root:
#   tools/bats-core/bin/bats test/resources-lib.bats

REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)"
LIB="$REPO_ROOT/resources-lib.sh"
MANIFEST_FIXTURES="$REPO_ROOT/test/fixtures/manifests"

# ---------------------------------------------------------------------------
# setup — create a fresh temp dir tree for each test
# ---------------------------------------------------------------------------
setup() {
  WORK="$(mktemp -d)"
  STAGING="$WORK/staging"
  REPOS="$WORK/repositories"
  mkdir -p "$STAGING"

  # --- fixture source directories (generated, not stored in git) ---

  # source-a: plain files + a filename with spaces and parentheses
  mkdir -p "$REPOS/source-a"
  printf 'file-a content' > "$REPOS/source-a/file-a.txt"
  printf 'file-b content' > "$REPOS/source-a/file-b.txt"
  printf 'hat data'       > "$REPOS/source-a/2014.04 HAT (Pre Errata).lflist.conf.txt"

  # source-b: fallback source (file-c only in source-b; file-b also here but different content)
  mkdir -p "$REPOS/source-b"
  printf 'fallback content' > "$REPOS/source-b/file-b.txt"
  printf 'file-c content'   > "$REPOS/source-b/file-c.txt"

  # source-with-dir: source that has a subdirectory
  mkdir -p "$REPOS/source-with-dir/subdir"
  printf 'dir-file content'  > "$REPOS/source-with-dir/subdir/dir-file.txt"
  printf 'root-file content' > "$REPOS/source-with-dir/root-file.txt"
  # glob-matchable files inside the subdir, including spaces + parentheses
  printf 'sub conf content'  > "$REPOS/source-with-dir/subdir/Rush.lflist.conf"
  printf 'sub hat content'   > "$REPOS/source-with-dir/subdir/2014.04 HAT (Pre Errata).lflist.conf"
  printf 'sub other content' > "$REPOS/source-with-dir/subdir/note.txt"

  # http-source: crafted binary/text files for integrity check tests
  mkdir -p "$REPOS/http-source"

  # Valid SQLite3 magic: "SQLite format 3\x00" (exactly 16 bytes)
  printf 'SQLite format 3\x00' > "$REPOS/http-source/valid.cdb"

  # Empty file (fails non-empty check)
  > "$REPOS/http-source/empty.cdb"

  # Corrupt: 16 null bytes (fails SQLite magic check)
  printf '\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00' \
    > "$REPOS/http-source/corrupt.cdb"

  # Truncated: "SQLite format 3" (15 bytes, no trailing NUL) — must be rejected.
  # A naive string comparison via command substitution strips the NUL and would
  # accept this file; the binary cmp comparison rejects it (only 15 of 16 bytes).
  printf 'SQLite format 3' > "$REPOS/http-source/truncated.cdb"

  # Non-cdb: only non-empty check applies
  printf 'some lflist content\n' > "$REPOS/http-source/valid.conf"

  # Source the library; allow MANIFEST_PATH override per test
  MANIFEST_PATH="$MANIFEST_FIXTURES/valid-minimal.json"
  source "$LIB"
}

teardown() {
  rm -rf "$WORK"
}

# ============================================================
# RSM-005 — Manifest validation (a-e)
# ============================================================

@test "RSM-005a: malformed JSON aborts with exit 1" {
  MANIFEST_PATH="$MANIFEST_FIXTURES/malformed.json"
  run validate_manifest "$MANIFEST_PATH"
  [ "$status" -eq 1 ]
  # Message must name the violation (malformed JSON) and the manifest, not just exit
  [[ "$output" == *"malformed JSON"* ]]
  [[ "$output" == *"malformed.json"* ]]
}

@test "RSM-005b: unknown source type aborts with exit 1" {
  MANIFEST_PATH="$MANIFEST_FIXTURES/unknown-type.json"
  run validate_manifest "$MANIFEST_PATH"
  [ "$status" -eq 1 ]
  [[ "$output" == *"ftp"* ]] || [[ "$output" == *"type"* ]]
}

@test "RSM-005c: dangling from-id aborts with exit 1" {
  MANIFEST_PATH="$MANIFEST_FIXTURES/dangling-from.json"
  run validate_manifest "$MANIFEST_PATH"
  [ "$status" -eq 1 ]
  # Must name the specific offending id, not just generic wording
  [[ "$output" == *"missing-src"* ]]
}

@test "RSM-005d: file+dir combo aborts with exit 1" {
  MANIFEST_PATH="$MANIFEST_FIXTURES/file-dir-combo.json"
  run validate_manifest "$MANIFEST_PATH"
  [ "$status" -eq 1 ]
}

@test "RSM-005e: target collision without overwrite aborts with exit 1" {
  MANIFEST_PATH="$MANIFEST_FIXTURES/collision-no-overwrite.json"
  run validate_manifest "$MANIFEST_PATH"
  [ "$status" -eq 1 ]
  # Must name the specific colliding target, not just generic wording
  [[ "$output" == *"out/lflist.conf"* ]]
}

# ============================================================
# RSM-001 — sources[] field validation
# ============================================================

@test "RSM-001: empty source id aborts with exit 1" {
  MANIFEST_PATH="$MANIFEST_FIXTURES/empty-id.json"
  run validate_manifest "$MANIFEST_PATH"
  [ "$status" -eq 1 ]
  [[ "$output" == *"empty"* ]]
}

@test "RSM-001: duplicate source id aborts with exit 1 naming the id" {
  MANIFEST_PATH="$MANIFEST_FIXTURES/duplicate-id.json"
  run validate_manifest "$MANIFEST_PATH"
  [ "$status" -eq 1 ]
  [[ "$output" == *"dup-src"* ]]
}

@test "RSM-001: empty source url aborts with exit 1 naming the id" {
  MANIFEST_PATH="$MANIFEST_FIXTURES/empty-url.json"
  run validate_manifest "$MANIFEST_PATH"
  [ "$status" -eq 1 ]
  [[ "$output" == *"no-url-src"* ]]
}

@test "RSM-001: http source without filename aborts with exit 1 naming the id" {
  MANIFEST_PATH="$MANIFEST_FIXTURES/http-no-filename.json"
  run validate_manifest "$MANIFEST_PATH"
  [ "$status" -eq 1 ]
  [[ "$output" == *"http-src"* ]]
}

@test "RSM-001: array from without file aborts with exit 1 naming the target" {
  MANIFEST_PATH="$MANIFEST_FIXTURES/array-from-no-file.json"
  run validate_manifest "$MANIFEST_PATH"
  [ "$status" -eq 1 ]
  [[ "$output" == *"out/dir"* ]]
}

@test "RSM-001: http source in rule without file key aborts with exit 1 naming the target" {
  # An http source resolves to a flat file under repositories/, so a rule that
  # references it without a `file` key (dir/only/whole-source) would copy the
  # whole repositories/ tree. Validation must reject it and name the target.
  MANIFEST_PATH="$MANIFEST_FIXTURES/http-source-no-file.json"
  run validate_manifest "$MANIFEST_PATH"
  [ "$status" -eq 1 ]
  [[ "$output" == *"out/dir"* ]]
  [[ "$output" == *"http"* ]]
}

@test "RSM-001: assembly rule with missing target aborts with exit 1 naming the index" {
  # A rule with no target resolves to a literal null/ publish dir — must be rejected.
  MANIFEST_PATH="$MANIFEST_FIXTURES/missing-target.json"
  run validate_manifest "$MANIFEST_PATH"
  [ "$status" -eq 1 ]
  [[ "$output" == *"target"* ]]
  [[ "$output" == *"index"* ]]
}

@test "RSM-001: http rule file must equal source filename, else exit 1 naming target+source" {
  # The rule references an http source but its file key differs from the source
  # filename — validation must reject it and name the target + source id.
  MANIFEST_PATH="$MANIFEST_FIXTURES/http-file-mismatch.json"
  run validate_manifest "$MANIFEST_PATH"
  [ "$status" -eq 1 ]
  [[ "$output" == *"out/list.conf"* ]]
  [[ "$output" == *"http-src"* ]]
}

@test "RSM-005 all-checks-pass: valid manifest exits 0" {
  MANIFEST_PATH="$MANIFEST_FIXTURES/valid-minimal.json"
  run validate_manifest "$MANIFEST_PATH"
  [ "$status" -eq 0 ]
}

@test "RSM-005 real manifest: resources.manifest.json validates cleanly" {
  run validate_manifest "$REPO_ROOT/resources.manifest.json"
  [ "$status" -eq 0 ]
}

# ============================================================
# RSM-006 — HTTP integrity check
# ============================================================

@test "RSM-006: valid .cdb with SQLite magic passes" {
  run http_integrity_check "$REPOS/http-source/valid.cdb" "src-cdb" "http://example.com"
  [ "$status" -eq 0 ]
}

@test "RSM-006: empty file fails non-empty check" {
  run http_integrity_check "$REPOS/http-source/empty.cdb" "src-empty" "http://example.com"
  [ "$status" -eq 1 ]
}

@test "RSM-006: .cdb without SQLite magic fails magic check" {
  run http_integrity_check "$REPOS/http-source/corrupt.cdb" "src-corrupt" "http://example.com"
  [ "$status" -eq 1 ]
}

@test "RSM-006: .cdb truncated to 15 bytes (no trailing NUL) fails magic check" {
  # "SQLite format 3" without the 16th NUL byte must be rejected. A string
  # comparison via command substitution would strip the NUL and wrongly accept it.
  run http_integrity_check "$REPOS/http-source/truncated.cdb" "src-truncated" "http://example.com"
  [ "$status" -eq 1 ]
}

@test "RSM-006: non-.cdb file passes with only non-empty check" {
  run http_integrity_check "$REPOS/http-source/valid.conf" "src-conf" "http://example.com"
  [ "$status" -eq 0 ]
}

# ============================================================
# RSM-002 — Assembly rule shapes via apply_rule
# ============================================================

@test "RSM-002 whole-source: copies entire source dir to target" {
  run apply_rule "$REPOS/source-a" "" "" "" "$STAGING/whole-target"
  [ "$status" -eq 0 ]
  [ -f "$STAGING/whole-target/file-a.txt" ]
  [ -f "$STAGING/whole-target/file-b.txt" ]
}

@test "RSM-002 dir-only: copies named subdirectory to target" {
  run apply_rule "$REPOS/source-with-dir" "subdir" "" "" "$STAGING/dir-target"
  [ "$status" -eq 0 ]
  [ -f "$STAGING/dir-target/dir-file.txt" ]
  [ ! -f "$STAGING/dir-target/root-file.txt" ]
}

@test "RSM-002 single-file: copies named file to target path" {
  run apply_rule "$REPOS/source-a" "" "file-a.txt" "" "$STAGING/out/file-a.txt"
  [ "$status" -eq 0 ]
  [ -f "$STAGING/out/file-a.txt" ]
}

@test "RSM-002 only-glob: copies matching files, handles spaces+parens in names" {
  mkdir -p "$STAGING/glob-target"
  run apply_rule "$REPOS/source-a" "" "" "*.txt" "$STAGING/glob-target"
  [ "$status" -eq 0 ]
  [ -f "$STAGING/glob-target/file-a.txt" ]
  [ -f "$STAGING/glob-target/file-b.txt" ]
  [ -f "$STAGING/glob-target/2014.04 HAT (Pre Errata).lflist.conf.txt" ]
}

@test "RSM-002 empty-glob: no match is non-fatal (exit 0)" {
  mkdir -p "$STAGING/empty-glob-target"
  run apply_rule "$REPOS/source-a" "" "" "*.nosuchext" "$STAGING/empty-glob-target"
  [ "$status" -eq 0 ]
  result=$(find "$STAGING/empty-glob-target" -maxdepth 1 -type f | wc -l)
  [ "$result" -eq 0 ]
}

@test "RSM-002 dir+only: copies matching files from subdir, handles spaces+parens" {
  run apply_rule "$REPOS/source-with-dir" "subdir" "" "*.lflist.conf" "$STAGING/dir-only-target"
  [ "$status" -eq 0 ]
  [ -f "$STAGING/dir-only-target/Rush.lflist.conf" ]
  [ -f "$STAGING/dir-only-target/2014.04 HAT (Pre Errata).lflist.conf" ]
  # note.txt does not match the glob and must be excluded
  [ ! -f "$STAGING/dir-only-target/note.txt" ]
}

@test "RSM-002 missing single-file: apply_rule exits non-zero" {
  run apply_rule "$REPOS/source-a" "" "no-such-file.txt" "" "$STAGING/out/nope.txt"
  [ "$status" -ne 0 ]
  [[ "$output" == *"no-such-file.txt"* ]]
}

@test "RSM-002 missing dir subdirectory: apply_rule exits non-zero (hard failure)" {
  run apply_rule "$REPOS/source-with-dir" "no-such-subdir" "" "" "$STAGING/missing-dir-target"
  [ "$status" -ne 0 ]
  [[ "$output" == *"no-such-subdir"* ]]
}

@test "RSM-002 missing dir subdirectory with only-glob: apply_rule exits non-zero" {
  run apply_rule "$REPOS/source-with-dir" "no-such-subdir" "" "*.conf" "$STAGING/missing-dir-glob-target"
  [ "$status" -ne 0 ]
  [[ "$output" == *"no-such-subdir"* ]]
}

@test "RSM-002 overwrite: second apply_rule call wins at the same target" {
  # First source-a/file-a.txt, then source-b content overwrites the same target
  run apply_rule "$REPOS/source-a" "" "file-a.txt" "" "$STAGING/out/dup.txt"
  [ "$status" -eq 0 ]
  [ "$(cat "$STAGING/out/dup.txt")" = "file-a content" ]
  run apply_rule "$REPOS/source-b" "" "file-c.txt" "" "$STAGING/out/dup.txt"
  [ "$status" -eq 0 ]
  [ "$(cat "$STAGING/out/dup.txt")" = "file-c content" ]
}

# ============================================================
# RSM-003 — Fallback chain
# ============================================================

@test "RSM-003 first-source-wins: takes file from first available source" {
  # file-b.txt exists in both sources; first source wins
  run apply_rule_with_fallback "file-b.txt" "$STAGING/out/file-b.txt" \
    "$REPOS/source-a" "$REPOS/source-b"
  [ "$status" -eq 0 ]
  [ "$(cat "$STAGING/out/file-b.txt")" = "file-b content" ]
}

@test "RSM-003 fallback-to-second: uses second source when file absent from first" {
  # file-c.txt is only in source-b
  run apply_rule_with_fallback "file-c.txt" "$STAGING/out/file-c.txt" \
    "$REPOS/source-a" "$REPOS/source-b"
  [ "$status" -eq 0 ]
  [ -f "$STAGING/out/file-c.txt" ]
}

@test "RSM-003 chain-exhausted: aborts when file missing from all sources" {
  run apply_rule_with_fallback "no-such-file.txt" "$STAGING/out/nosuch.txt" \
    "$REPOS/source-a" "$REPOS/source-b"
  [ "$status" -eq 1 ]
}

# ============================================================
# RSM-004 — Collision detection (validate_manifest handles it)
# ============================================================

@test "RSM-004 collision-without-overwrite: validate_manifest catches it" {
  MANIFEST_PATH="$MANIFEST_FIXTURES/collision-no-overwrite.json"
  run validate_manifest "$MANIFEST_PATH"
  [ "$status" -eq 1 ]
}

@test "RSM-004 intentional-overwrite: valid manifest with overwrite passes validation" {
  # valid-minimal.json has two rules for 'out/overwritten', second has overwrite:true
  MANIFEST_PATH="$MANIFEST_FIXTURES/valid-minimal.json"
  run validate_manifest "$MANIFEST_PATH"
  [ "$status" -eq 0 ]
}

# ============================================================
# RSM-012 — Unused files not present in manifest
# ============================================================

@test "RSM-012: unused evolution-assets files not referenced in initial manifest" {
  local manifest="$REPO_ROOT/resources.manifest.json"
  run bash -c "jq -r '[.assembly[].file // empty] | .[]' \"$manifest\""
  [ "$status" -eq 0 ]
  [[ "$output" != *"classic.cdb"* ]]
  [[ "$output" != *"jtp.en.cdb"* ]]
  [[ "$output" != *"jtp.es.cdb"* ]]
  [[ "$output" != *"edison.lflist.conf"* ]]
}

@test "RSM-012: real manifest has exactly 11 sources" {
  run jq '.sources | length' "$REPO_ROOT/resources.manifest.json"
  [ "$status" -eq 0 ]
  [ "$output" -eq 11 ]
}

@test "RSM-012: real manifest has exactly 22 assembly rules" {
  run jq '.assembly | length' "$REPO_ROOT/resources.manifest.json"
  [ "$status" -eq 0 ]
  [ "$output" -eq 22 ]
}

# ============================================================
# JD hardening — structural guards and robustness (PR1b)
# ============================================================

@test "hardening: sources not an array aborts with exit 1 naming the violation" {
  MANIFEST_PATH="$MANIFEST_FIXTURES/sources-not-array.json"
  run validate_manifest "$MANIFEST_PATH"
  [ "$status" -eq 1 ]
  [[ "$output" == *"sources"* ]]
}

@test "hardening: assembly not an array aborts with exit 1 naming the violation" {
  MANIFEST_PATH="$MANIFEST_FIXTURES/assembly-not-array.json"
  run validate_manifest "$MANIFEST_PATH"
  [ "$status" -eq 1 ]
  [[ "$output" == *"assembly"* ]]
}

@test "hardening: unknown type field as integer (jq crash path) does not silently pass" {
  # A .type value of 5 (integer) triggers (.type|tostring) safely — must still
  # report an unknown-type violation, not silently pass.
  local bad_manifest
  bad_manifest="$(mktemp)"
  printf '{"sources":[{"id":"s","type":5,"url":"http://x"}],"assembly":[]}' \
    > "$bad_manifest"
  run validate_manifest "$bad_manifest"
  rm -f "$bad_manifest"
  [ "$status" -eq 1 ]
  [[ "$output" == *"unknown"* ]] || [[ "$output" == *"type"* ]]
}

@test "hardening: http_integrity_check accepts uppercase .CDB extension" {
  # Case-insensitive .cdb match — an uppercase .CDB file must trigger the
  # SQLite header check, not be treated as a plain non-cdb file.
  local upper_cdb
  upper_cdb="$(mktemp /tmp/test-XXXXXX.CDB)"
  printf 'SQLite format 3\x00' > "$upper_cdb"
  run http_integrity_check "$upper_cdb" "src-upper" "http://example.com"
  rm -f "$upper_cdb"
  [ "$status" -eq 0 ]
}

@test "hardening: http_integrity_check rejects corrupt uppercase .CDB" {
  local upper_cdb
  upper_cdb="$(mktemp /tmp/test-XXXXXX.CDB)"
  printf '\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00' \
    > "$upper_cdb"
  run http_integrity_check "$upper_cdb" "src-upper-corrupt" "http://example.com"
  rm -f "$upper_cdb"
  [ "$status" -eq 1 ]
}

@test "hardening: apply_rule whole-source (5 args, no vestigial 6th arg)" {
  # Confirm that apply_rule works correctly with exactly 5 arguments.
  run apply_rule "$REPOS/source-a" "" "" "" "$STAGING/five-arg-target"
  [ "$status" -eq 0 ]
  [ -f "$STAGING/five-arg-target/file-a.txt" ]
}

# ============================================================
# T-005 — clone_repositories.sh control flow (PR1b)
# Tests use a mock manifest + PATH-override stubs to avoid network.
# ============================================================

@test "clone: aborts on invalid manifest (validate_manifest fail-fast)" {
  # A bad manifest must cause clone_repositories.sh to exit non-zero before
  # any git/wget is attempted. We override PATH to stub git/wget so any
  # network call would succeed — meaning failure proves it came from validation.
  local bad_manifest="$MANIFEST_FIXTURES/dangling-from.json"

  # Stub out git and wget so we can detect if they're called
  local stub_dir
  stub_dir="$(mktemp -d)"
  printf '#!/bin/sh\necho "STUB: git called" >&2\nexit 0\n' > "$stub_dir/git"
  printf '#!/bin/sh\necho "STUB: wget called" >&2\nexit 0\n' > "$stub_dir/wget"
  chmod +x "$stub_dir/git" "$stub_dir/wget"

  MANIFEST_PATH="$bad_manifest" PATH="$stub_dir:$PATH" \
    run bash "$REPO_ROOT/clone_repositories.sh"
  rm -rf "$stub_dir"
  [ "$status" -ne 0 ]
  [[ "$output" == *"missing-src"* ]] || [[ "$output" == *"dangling"* ]]
}

@test "clone: git source triggers sync_repo for each git entry" {
  # Minimal manifest with one git source; stub git to record the call.
  local stub_dir
  stub_dir="$(mktemp -d)"
  local call_log="$stub_dir/calls.log"

  # git stub: record args and succeed
  cat > "$stub_dir/git" <<'STUB'
#!/usr/bin/env bash
echo "git $*" >> "$CALL_LOG"
# simulate shallow clone: create the target dir with a .git subdir
if [ "$1" = "clone" ]; then
  target="${@: -1}"
  mkdir -p "$target/.git"
fi
exit 0
STUB
  chmod +x "$stub_dir/git"

  local test_manifest
  test_manifest="$(mktemp)"
  cat > "$test_manifest" <<'MANIFEST'
{
  "sources": [
    { "id": "test-repo", "type": "git", "url": "https://example.com/repo.git", "branch": "main" }
  ],
  "assembly": []
}
MANIFEST

  # REPOS_ROOT isolates the checkout into $WORK so we never touch the real
  # repositories/ dir and always hit the clean-clone path (no stale .git).
  MANIFEST_PATH="$test_manifest" CALL_LOG="$call_log" REPOS_ROOT="$WORK/repositories" \
  PATH="$stub_dir:$PATH" \
    run bash "$REPO_ROOT/clone_repositories.sh"
  rm -f "$test_manifest"
  # Capture the log before tearing the stub dir down so assertions are load-bearing.
  local log_content=""
  [ -f "$call_log" ] && log_content="$(cat "$call_log")"
  rm -rf "$stub_dir"

  [ "$status" -eq 0 ]
  # The git stub recorded its invocations; the log must exist and pin the
  # control flow: sync_repo must have shelled out to `git clone --depth 1`
  # with `--branch main` for the branched source (first checkout, no prior .git).
  [ -n "$log_content" ]
  [[ "$log_content" == *"clone --depth 1"* ]]
  [[ "$log_content" == *"--branch main"* ]]
  [[ "$log_content" == *"https://example.com/repo.git"* ]]
}

@test "clone: http source triggers wget then integrity check" {
  # Minimal manifest with one http (non-cdb) source; stub wget to create a
  # non-empty file; script must pass integrity check and exit 0.
  local stub_dir
  stub_dir="$(mktemp -d)"
  local cwd_snap

  cat > "$stub_dir/wget" <<'STUB'
#!/bin/sh
# parse -qO <file> <url> form: arg 1=-qO, arg 2=file, arg 3=url
output_file="$2"
printf 'hello lflist content\n' > "$output_file"
exit 0
STUB
  chmod +x "$stub_dir/wget"

  local test_manifest
  test_manifest="$(mktemp)"
  cat > "$test_manifest" <<'MANIFEST'
{
  "sources": [
    { "id": "test-http", "type": "http", "url": "https://example.com/list.conf", "filename": "list.conf" }
  ],
  "assembly": []
}
MANIFEST

  MANIFEST_PATH="$test_manifest" REPOS_ROOT="$WORK/repositories" PATH="$stub_dir:$PATH" \
    run bash "$REPO_ROOT/clone_repositories.sh"
  rm -f "$test_manifest"
  rm -rf "$stub_dir"
  [ "$status" -eq 0 ]
}

@test "clone: http source fails integrity check on empty download" {
  local stub_dir
  stub_dir="$(mktemp -d)"

  cat > "$stub_dir/wget" <<'STUB'
#!/bin/sh
output_file="$2"
# create an empty file (simulates empty download)
> "$output_file"
exit 0
STUB
  chmod +x "$stub_dir/wget"

  local test_manifest
  test_manifest="$(mktemp)"
  cat > "$test_manifest" <<'MANIFEST'
{
  "sources": [
    { "id": "test-empty-http", "type": "http", "url": "https://example.com/empty.conf", "filename": "empty.conf" }
  ],
  "assembly": []
}
MANIFEST

  MANIFEST_PATH="$test_manifest" REPOS_ROOT="$WORK/repositories" PATH="$stub_dir:$PATH" \
    run bash "$REPO_ROOT/clone_repositories.sh"
  rm -f "$test_manifest"
  rm -rf "$stub_dir"
  [ "$status" -ne 0 ]
  [[ "$output" == *"empty"* ]] || [[ "$output" == *"Integrity"* ]] || [[ "$output" == *"integrity"* ]]
}

@test "clone: no hardcoded URLs (RSM-010 lint)" {
  # clone_repositories.sh must not contain any literal http(s):// or git@ URLs
  local script="$REPO_ROOT/clone_repositories.sh"
  run grep -E '(https?://|git@)' "$script"
  [ "$status" -ne 0 ]
}

@test "lib: no hardcoded source URLs (RSM-010 lint)" {
  # resources-lib.sh must not contain any literal github.com/moecube source URLs;
  # all sources come from the manifest. grep exiting non-zero (no match) is the
  # pass condition — the lib is currently clean.
  local script="$REPO_ROOT/resources-lib.sh"
  run grep -E 'github\.com|moecube' "$script"
  [ "$status" -ne 0 ]
}

@test "clone: no cd repositories command (cwd invariant D1)" {
  local script="$REPO_ROOT/clone_repositories.sh"
  run grep -E '^[[:space:]]*cd[[:space:]]' "$script"
  [ "$status" -ne 0 ]
}

# ============================================================
# T-006 — setup_resources.sh control flow (PR1b)
# Tests use a minimal manifest + pre-populated repositories/ dir
# under WORK to avoid network. Runs in isolated temp tree.
# ============================================================

# Helper: build a minimal working tree under $WORK so setup_resources.sh
# can run end-to-end without network. Called from each setup test.
_setup_minimal_tree() {
  # Create a repositories dir with one git source and one http source
  mkdir -p "$WORK/repositories/src-a"
  printf 'content-a\n' > "$WORK/repositories/src-a/data.txt"
  # Simulate a .git dir that must be stripped
  mkdir -p "$WORK/repositories/src-a/.git"
  printf 'fake git' > "$WORK/repositories/src-a/.git/HEAD"

  mkdir -p "$WORK/repositories"
  printf 'hello conf\n' > "$WORK/repositories/list.conf"

  # Write a minimal manifest
  cat > "$WORK/test.manifest.json" <<'MANIFEST'
{
  "sources": [
    { "id": "src-a", "type": "git",  "url": "https://example.com/a.git", "branch": "main" },
    { "id": "src-http", "type": "http", "url": "https://example.com/list.conf", "filename": "list.conf" }
  ],
  "assembly": [
    { "target": "mydir/data.txt", "from": "src-a", "file": "data.txt" },
    { "target": "mydir/list.conf", "from": "src-http", "file": "list.conf" },
    { "target": "whole", "from": "src-a" }
  ]
}
MANIFEST
}

@test "setup: assembles files from manifest rules into a new release" {
  _setup_minimal_tree
  MANIFEST_PATH="$WORK/test.manifest.json" \
  REPOS_ROOT="$WORK/repositories" \
  RELEASES_ROOT="$WORK/resources/releases" \
    run bash "$REPO_ROOT/setup_resources.sh"
  [ "$status" -eq 0 ]
  # At least one release dir was created and resources/current symlink exists
  [ -L "$WORK/resources/current" ]
  local release_dir
  release_dir="$(readlink "$WORK/resources/current")"
  [ -f "$WORK/$release_dir/mydir/data.txt" ] || \
    [ -f "$WORK/resources/current/mydir/data.txt" ]
}

@test "setup: .git directories are stripped from staging before publish" {
  _setup_minimal_tree
  MANIFEST_PATH="$WORK/test.manifest.json" \
  REPOS_ROOT="$WORK/repositories" \
  RELEASES_ROOT="$WORK/resources/releases" \
    run bash "$REPO_ROOT/setup_resources.sh"
  [ "$status" -eq 0 ]
  # Sanity: the fixture has a whole-source rule over the git source (no file
  # key), so .git would land in staging unless the publish step strips it.
  # This makes the assertion below load-bearing (a file-only fixture never
  # brings .git into staging, so the check would pass vacuously).
  #
  # -L follows the resources/current symlink into the published release; without
  # it find would stop at the symlink itself and never descend, silently missing
  # any .git under the release.
  run find -L "$WORK/resources/current" -name ".git" -type d
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "setup: aborts before swap when assembly rule fails (missing file)" {
  _setup_minimal_tree
  # Add a rule referencing a file that does not exist
  cat > "$WORK/bad.manifest.json" <<'MANIFEST'
{
  "sources": [
    { "id": "src-a", "type": "git", "url": "https://example.com/a.git", "branch": "main" }
  ],
  "assembly": [
    { "target": "mydir/no-such.txt", "from": "src-a", "file": "no-such.txt" }
  ]
}
MANIFEST
  local before_count
  before_count=$(ls "$WORK/resources/releases" 2>/dev/null | wc -l || echo 0)

  MANIFEST_PATH="$WORK/bad.manifest.json" \
  REPOS_ROOT="$WORK/repositories" \
  RELEASES_ROOT="$WORK/resources/releases" \
    run bash "$REPO_ROOT/setup_resources.sh"
  [ "$status" -ne 0 ]
  # No new release dir must have been published (symlink not created/updated)
  [ ! -L "$WORK/resources/current" ]
}

@test "setup: GC keeps only RESOURCES_KEEP_RELEASES newest releases" {
  _setup_minimal_tree
  # Run 3 times; with KEEP=2, only 2 releases must survive
  for _ in 1 2 3; do
    MANIFEST_PATH="$WORK/test.manifest.json" \
    REPOS_ROOT="$WORK/repositories" \
    RELEASES_ROOT="$WORK/resources/releases" \
    RESOURCES_KEEP_RELEASES=2 \
      bash "$REPO_ROOT/setup_resources.sh" >/dev/null 2>&1
    sleep 0.01  # ensure unique timestamp IDs
  done
  local count
  count=$(ls "$WORK/resources/releases" | wc -l)
  [ "$count" -le 2 ]
}

@test "setup: no hardcoded source paths in setup_resources.sh (RSM-010)" {
  # The script must not contain any literal cp or path referencing old repo names
  local script="$REPO_ROOT/setup_resources.sh"
  run grep -E '(edopro-card-scripts|edopro-card-databases|edopro-banlists|ygopro-format-alternatives|ygopro-prereleases|ygopro-cards-art|evolution-assets|ygopro-scripts|ygopro-lflist\.conf|ygopro-cards\.cdb)' "$script"
  [ "$status" -ne 0 ]
}

# ============================================================
# JD round-3 hardening — non-object assembly element (PR1c)
# ============================================================

@test "hardening: non-object assembly element aborts with exit 1 naming the index" {
  # An assembly[] element that is not an object (e.g. a plain string) must be
  # rejected before any processing.  validate_manifest must exit 1 and name the
  # offending array index in the error message.
  MANIFEST_PATH="$MANIFEST_FIXTURES/assembly-element-not-object.json"
  run validate_manifest "$MANIFEST_PATH"
  [ "$status" -eq 1 ]
  [[ "$output" == *"assembly"* ]]
  [[ "$output" == *"0"* ]]
}

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

  # http-source: crafted binary/text files for integrity check tests
  mkdir -p "$REPOS/http-source"

  # Valid SQLite3 magic: "SQLite format 3\x00" (exactly 16 bytes)
  printf 'SQLite format 3\x00' > "$REPOS/http-source/valid.cdb"

  # Empty file (fails non-empty check)
  > "$REPOS/http-source/empty.cdb"

  # Corrupt: 16 null bytes (fails SQLite magic check)
  printf '\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00' \
    > "$REPOS/http-source/corrupt.cdb"

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
  [[ "$output" == *"missing-src"* ]] || [[ "$output" == *"dangling"* ]] || [[ "$output" == *"from"* ]]
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
  [[ "$output" == *"out/lflist.conf"* ]] || [[ "$output" == *"collision"* ]] || [[ "$output" == *"overwrite"* ]]
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

@test "RSM-006: non-.cdb file passes with only non-empty check" {
  run http_integrity_check "$REPOS/http-source/valid.conf" "src-conf" "http://example.com"
  [ "$status" -eq 0 ]
}

# ============================================================
# RSM-002 — Assembly rule shapes via apply_rule
# ============================================================

@test "RSM-002 whole-source: copies entire source dir to target" {
  run apply_rule "$REPOS/source-a" "" "" "" "$STAGING/whole-target" ""
  [ "$status" -eq 0 ]
  [ -f "$STAGING/whole-target/file-a.txt" ]
  [ -f "$STAGING/whole-target/file-b.txt" ]
}

@test "RSM-002 dir-only: copies named subdirectory to target" {
  run apply_rule "$REPOS/source-with-dir" "subdir" "" "" "$STAGING/dir-target" ""
  [ "$status" -eq 0 ]
  [ -f "$STAGING/dir-target/dir-file.txt" ]
  [ ! -f "$STAGING/dir-target/root-file.txt" ]
}

@test "RSM-002 single-file: copies named file to target path" {
  run apply_rule "$REPOS/source-a" "" "file-a.txt" "" "$STAGING/out/file-a.txt" ""
  [ "$status" -eq 0 ]
  [ -f "$STAGING/out/file-a.txt" ]
}

@test "RSM-002 only-glob: copies matching files, handles spaces+parens in names" {
  mkdir -p "$STAGING/glob-target"
  run apply_rule "$REPOS/source-a" "" "" "*.txt" "$STAGING/glob-target" ""
  [ "$status" -eq 0 ]
  [ -f "$STAGING/glob-target/file-a.txt" ]
  [ -f "$STAGING/glob-target/file-b.txt" ]
  [ -f "$STAGING/glob-target/2014.04 HAT (Pre Errata).lflist.conf.txt" ]
}

@test "RSM-002 empty-glob: no match is non-fatal (exit 0)" {
  mkdir -p "$STAGING/empty-glob-target"
  run apply_rule "$REPOS/source-a" "" "" "*.nosuchext" "$STAGING/empty-glob-target" ""
  [ "$status" -eq 0 ]
  result=$(find "$STAGING/empty-glob-target" -maxdepth 1 -type f | wc -l)
  [ "$result" -eq 0 ]
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

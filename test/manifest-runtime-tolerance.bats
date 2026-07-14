#!/usr/bin/env bats
# test/manifest-runtime-tolerance.bats
# Regression tests for RFD-002: validate_manifest must tolerate the runtime
# top-level key (and any other unknown top-level keys) without changes to
# resources-lib.sh.
#
# Run from repo root:
#   tools/bats-core/bin/bats test/manifest-runtime-tolerance.bats

REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)"
LIB="$REPO_ROOT/scripts/resources-lib.sh"

setup() {
  WORK="$(mktemp -d)"
  # shellcheck source=../resources-lib.sh
  source "$LIB"
}

teardown() {
  rm -rf "$WORK"
}

# ---------------------------------------------------------------------------
# RFD-002 — Manifest with runtime.ygopro section validates cleanly
# ---------------------------------------------------------------------------

@test "RFD-002: real manifest (with runtime section) validates cleanly" {
  # The actual resources.manifest.json now includes the runtime.ygopro section.
  # validate_manifest must still return 0.
  run validate_manifest "$REPO_ROOT/resources.manifest.json"
  [ "$status" -eq 0 ]
}

@test "RFD-002: manifest with runtime key in addition to valid sources/assembly passes" {
  local manifest="$WORK/with-runtime.json"
  cat > "$manifest" <<'EOF'
{
  "sources": [
    { "id": "src-a", "type": "git", "url": "https://example.com/a" }
  ],
  "assembly": [
    { "target": "out/content", "from": "src-a" }
  ],
  "runtime": {
    "ygopro": {
      "standard": ["base", "formats/ocg"],
      "extended": ["extensions/prereleases"]
    }
  }
}
EOF
  run validate_manifest "$manifest"
  [ "$status" -eq 0 ]
}

@test "RFD-002: manifest with runtime key and comment key passes (multiple unknown top-level keys)" {
  local manifest="$WORK/with-comment-runtime.json"
  cat > "$manifest" <<'EOF'
{
  "comment": "test manifest",
  "sources": [
    { "id": "src-a", "type": "git", "url": "https://example.com/a" }
  ],
  "assembly": [
    { "target": "out/content", "from": "src-a" }
  ],
  "runtime": {
    "comment": "pool config",
    "ygopro": {
      "standard": ["base"],
      "extended": []
    }
  }
}
EOF
  run validate_manifest "$manifest"
  [ "$status" -eq 0 ]
}

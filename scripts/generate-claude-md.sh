#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
base_dir="$(dirname "$script_dir")"

# Only tracked AGENTS.md files: cloned repositories, resources and worktrees are skipped.
git -C "$base_dir" ls-files '*AGENTS.md' | while read -r agents_file; do
  dir="$base_dir/$(dirname "$agents_file")"
  claude_file="$dir/CLAUDE.md"

  if [[ -e "$claude_file" || -L "$claude_file" ]]; then
    echo "Skipping $claude_file (already exists)"
    continue
  fi

  ln -s "AGENTS.md" "$claude_file"
  echo "Created symlink $claude_file → AGENTS.md"
done

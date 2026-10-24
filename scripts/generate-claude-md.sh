#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
base_dir="$(dirname "$script_dir")"

# Only tracked files named exactly AGENTS.md: cloned repositories, resources and
# worktrees are skipped, and so is a tracked AGENTS.md deleted from the working tree.
git -C "$base_dir" ls-files -z ':(glob)**/AGENTS.md' | while IFS= read -r -d '' agents_file; do
  if [[ ! -f "$base_dir/$agents_file" ]]; then
    continue
  fi

  dir="$base_dir/$(dirname "$agents_file")"
  claude_file="$dir/CLAUDE.md"

  if [[ -e "$claude_file" || -L "$claude_file" ]]; then
    echo "Skipping $claude_file (already exists)"
    continue
  fi

  ln -s "AGENTS.md" "$claude_file"
  echo "Created symlink $claude_file → AGENTS.md"
done

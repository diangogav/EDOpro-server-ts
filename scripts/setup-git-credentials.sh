#!/usr/bin/env bash
# setup-git-credentials.sh — authenticate github.com HTTPS clones of PRIVATE
# repos declared in the private manifest override, using a read-only token.
#
# Generic add-on: any private GitHub source (pre-errata scripts today, other
# private repos in the future) is fetched with GH_PRIVATE_TOKEN. Reads the token
# from the environment (build: a BuildKit secret; runtime: the container env from
# --env-file). No-op when the token is absent (public builds clone only public
# sources). The token is NEVER written to disk — an env-based credential helper
# reads it at clone time; public HTTPS clones don't challenge auth, so the token
# is only ever sent to private repos.
set -u
if [ -n "${GH_PRIVATE_TOKEN:-}" ]; then
  git config --global credential."https://github.com".helper \
    '!f() { echo "username=x-access-token"; echo "password=${GH_PRIVATE_TOKEN}"; }; f'
  echo "[git-credentials] github.com HTTPS token helper configured (private sources)."
else
  echo "[git-credentials] GH_PRIVATE_TOKEN not set — skipping (public sources only)."
fi

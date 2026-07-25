#!/bin/bash
set -euo pipefail

# Resolve a probe version to a concrete release tag.
# "latest" is resolved via the GitHub API; a concrete tag is echoed as-is.
# The resolved tag is printed to stdout; diagnostics go to stderr so callers
# can safely capture the version with command substitution.

VERSION="${1:-latest}"
ACTION_DEBUG="${2:-false}"

# Normalize action-debug flag
if [ "${ACTION_DEBUG,,}" = "true" ] || [ "${ACTION_DEBUG}" = "1" ] || [ "${ACTION_DEBUG,,}" = "yes" ]; then
  ACTION_DEBUG=true
else
  ACTION_DEBUG=false
fi

# Concrete version: nothing to resolve
if [ "$VERSION" != "latest" ]; then
  echo "$VERSION"
  exit 0
fi

if [ "$ACTION_DEBUG" = "true" ]; then
  echo "Fetching latest version from GitHub API..." >&2
fi

# Try to get latest version from GitHub API with authentication.
# The trailing "|| true" keeps a failed pipeline (e.g. rate limit / auth error
# returns JSON without "tag_name", so grep exits non-zero) from aborting the
# script under "set -euo pipefail", allowing the fallback below to run.
if [ -n "${GITHUB_TOKEN:-}" ]; then
  VERSION=$(curl -s -H "Authorization: token $GITHUB_TOKEN" \
    https://api.github.com/repos/linyows/probe/releases/latest | \
    grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/' | tr -d '\r' || true)
else
  VERSION=$(curl -s https://api.github.com/repos/linyows/probe/releases/latest | \
    grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/' | tr -d '\r' || true)
fi

# Fallback to known version if API fails
if [ -z "$VERSION" ] || [ "$VERSION" = "null" ]; then
  if [ "$ACTION_DEBUG" = "true" ]; then
    echo "Failed to fetch from API, using fallback version v0.20.1" >&2
  fi
  VERSION="v0.20.1"
elif [ "$ACTION_DEBUG" = "true" ]; then
  echo "Successfully fetched version: $VERSION" >&2
fi

echo "$VERSION"

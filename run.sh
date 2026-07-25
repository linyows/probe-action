#!/bin/bash
set -euo pipefail

# Resolve the directory of this script before any "cd" so helper scripts can
# be located regardless of the working directory changes made below.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Parse inputs
PATHS_INPUT="$1"
VERSION="$2"
OPTIONS="$3"
WORKDIR="$4"
ACTION_DEBUG="$5"

# Check action-debug flag
if [ "${ACTION_DEBUG,,}" = "true" ] || [ "${ACTION_DEBUG}" = "1" ] || [ "${ACTION_DEBUG,,}" = "yes" ]; then
  ACTION_DEBUG=true
else
  ACTION_DEBUG=false
fi

# Change to working directory if specified
ORIGINAL_DIR=$(pwd)
if [ -n "$WORKDIR" ]; then
  if [ ! -d "$WORKDIR" ]; then
    echo "Error: Working directory does not exist: $WORKDIR"
    exit 1
  fi
  cd "$WORKDIR"
  if [ "$ACTION_DEBUG" = "true" ]; then
    echo "Debug: Changed to working directory: $WORKDIR"
  fi
fi

# Debug: Show environment info (only if action-debug is enabled)
if [ "$ACTION_DEBUG" = "true" ]; then
  echo "Debug: OS=$(uname -s), ARCH=$(uname -m)"
  echo "Debug: Current directory: $(pwd)"
  echo "Debug: Available files: $(ls -la)"
fi

# Determine OS and architecture
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

# Only support Linux for now
if [ "$OS" != "linux" ]; then
  echo "Error: Currently only Linux is supported"
  echo "Detected OS: $OS"
  exit 1
fi

case $ARCH in
  x86_64) ARCH="x86_64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  *) 
    echo "Error: Unsupported architecture: $ARCH" 
    echo "Supported architectures: x86_64, aarch64, arm64"
    exit 1 
    ;;
esac

if [ "$ACTION_DEBUG" = "true" ]; then
  echo "Detected platform: ${OS}_${ARCH}"
fi

# Resolve version (delegates "latest" resolution to resolve-version.sh)
VERSION=$(bash "$SCRIPT_DIR/resolve-version.sh" "$VERSION" "$ACTION_DEBUG")

if [ "$ACTION_DEBUG" = "true" ]; then
  echo "Using probe version: $VERSION"
fi

# Directory holding the probe binary. When PROBE_CACHE_DIR is set (e.g. by the
# GitHub Action so it can be cached via actions/cache), the binary is stored and
# run from there; otherwise it falls back to the original working directory.
PROBE_DIR="${PROBE_CACHE_DIR:-$ORIGINAL_DIR}"
mkdir -p "$PROBE_DIR"
# Resolve to an absolute path so later "cd" changes do not break references
# to "$PROBE_DIR/probe" when PROBE_CACHE_DIR is given as a relative path.
PROBE_DIR="$(cd "$PROBE_DIR" && pwd)"
cd "$PROBE_DIR"

# Skip download if an existing probe binary already matches the target version
SKIP_DOWNLOAD=false
if [ -x "$PROBE_DIR/probe" ]; then
  EXISTING_VERSION=$("$PROBE_DIR/probe" --version 2>/dev/null | grep -oE 'v?[0-9]+\.[0-9]+\.[0-9]+' | head -n1 || true)
  if [ -n "$EXISTING_VERSION" ] && [ "${EXISTING_VERSION#v}" = "${VERSION#v}" ]; then
    SKIP_DOWNLOAD=true
    if [ "$ACTION_DEBUG" = "true" ]; then
      echo "Existing probe binary matches version $VERSION, skipping download"
    fi
  elif [ "$ACTION_DEBUG" = "true" ]; then
    echo "Existing probe version '${EXISTING_VERSION:-unknown}' does not match '$VERSION', re-downloading"
  fi
fi

if [ "$SKIP_DOWNLOAD" != "true" ]; then
  # Download probe
  DOWNLOAD_URL="https://github.com/linyows/probe/releases/download/${VERSION}/probe_${OS}_${ARCH}.tar.gz"
  if [ "$ACTION_DEBUG" = "true" ]; then
    echo "Downloading from: $DOWNLOAD_URL"
  fi

  if ! curl -L -f -s -S -o probe.tar.gz "$DOWNLOAD_URL"; then
    echo "Error: Failed to download probe from $DOWNLOAD_URL"
    echo "Please check if the version exists and supports your platform"
    exit 1
  fi

  # Verify download
  if [ ! -f probe.tar.gz ]; then
    echo "Error: probe.tar.gz not found after download"
    exit 1
  fi

  # Check file size (should be greater than 0)
  FILESIZE=$(stat -c%s probe.tar.gz 2>/dev/null || stat -f%z probe.tar.gz 2>/dev/null || echo "0")
  if [ "$FILESIZE" -eq 0 ]; then
    echo "Error: Downloaded file is empty (0 bytes)"
    echo "URL: $DOWNLOAD_URL"
    exit 1
  fi

  if [ "$ACTION_DEBUG" = "true" ]; then
    echo "Download successful (${FILESIZE} bytes), extracting..."
  fi

  # Verify tar archive integrity before extraction
  if ! tar -tzf probe.tar.gz >/dev/null 2>&1; then
    echo "Error: probe.tar.gz appears to be corrupted or invalid"
    echo "File size: ${FILESIZE} bytes"
    echo "URL: $DOWNLOAD_URL"
    if [ "$ACTION_DEBUG" = "true" ]; then
      echo "Archive test output:"
      tar -tzf probe.tar.gz 2>&1 || true
    fi
    exit 1
  fi

  # Extract binary
  if ! tar -xzf probe.tar.gz; then
    echo "Error: Failed to extract probe.tar.gz"
    echo "File size: ${FILESIZE} bytes"
    echo "URL: $DOWNLOAD_URL"
    exit 1
  fi

  # Verify extraction
  if [ ! -f probe ]; then
    echo "Error: probe binary not found after extraction"
    echo "Archive contents:"
    tar -tzf probe.tar.gz 2>&1 || echo "Failed to list archive contents"
    echo "Current directory contents after extraction:"
    ls -la
    exit 1
  fi

  chmod +x probe

  # Remove the archive so only the binary is kept (and cached)
  rm -f probe.tar.gz
fi

if [ "$ACTION_DEBUG" = "true" ]; then
  echo "Probe binary ready: $("$PROBE_DIR/probe" --version 2>/dev/null || echo 'version check failed')"
fi

# Return to the original directory first (the binary may have been downloaded
# from a different dir), then re-enter WORKDIR so a relative WORKDIR resolves
# against the original directory rather than the cache dir.
cd "$ORIGINAL_DIR"
if [ -n "$WORKDIR" ]; then
  cd "$WORKDIR"
fi

# Process paths - handle both array format and single path
declare -a PATH_ARRAY

if [ "$ACTION_DEBUG" = "true" ]; then
  echo "Debug: PATHS_INPUT raw value: '$PATHS_INPUT'"
  echo "Debug: PATHS_INPUT length: ${#PATHS_INPUT}"
fi

# GitHub Actions with multiline strings: handle newline-separated paths
# Use mapfile/readarray to properly handle multiline input
if [[ "$PATHS_INPUT" == *$'\n'* ]]; then
  # Multiline string: split by newlines using mapfile
  mapfile -t PATH_ARRAY <<< "$PATHS_INPUT"
  # Remove empty entries from array
  for i in "${!PATH_ARRAY[@]}"; do
    if [[ -z "${PATH_ARRAY[i]// }" ]]; then
      unset 'PATH_ARRAY[i]'
    fi
  done
  # Reindex array to remove gaps
  PATH_ARRAY=("${PATH_ARRAY[@]}")
else
  # Single path
  PATH_ARRAY=("$PATHS_INPUT")
fi

if [ "$ACTION_DEBUG" = "true" ]; then
  echo "Debug: PATH_ARRAY contains ${#PATH_ARRAY[@]} elements"
  for i in "${!PATH_ARRAY[@]}"; do
    echo "Debug: PATH_ARRAY[$i] = '${PATH_ARRAY[$i]}'"
  done
fi

# Run probe for each path
for path in "${PATH_ARRAY[@]}"; do
  # Trim whitespace and quotes
  path=$(echo "$path" | xargs | sed 's/^"//;s/"$//')

  # Skip empty paths
  if [ -z "$path" ]; then
    continue
  fi

  # Verify workflow file exists
  if [ ! -f "$path" ]; then
    echo "Error: Workflow file not found: $path"
    if [ "$ACTION_DEBUG" = "true" ]; then
      echo "Current directory contents:"
      find . -name "*.yml" -o -name "*.yaml" | head -10
    fi
    exit 1
  fi

  # Build command arguments from options
  PROBE_ARGS=""
  if [ -n "$OPTIONS" ]; then
    PROBE_ARGS="$OPTIONS"
  fi

  # Run probe (use absolute path to binary)
  if [ "$ACTION_DEBUG" = "true" ]; then
    echo "Running probe with workflow: $path"
    echo "Command: FORCE_COLOR=1 $PROBE_DIR/probe $PROBE_ARGS $path"
  fi

  FORCE_COLOR=1 "$PROBE_DIR/probe" $PROBE_ARGS "$path"
  
  # Add blank line between multiple workflow executions for clarity
  if [ ${#PATH_ARRAY[@]} -gt 1 ]; then
    echo ""
  fi
done

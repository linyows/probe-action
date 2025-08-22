#!/bin/bash
set -euo pipefail

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

# Set version
if [ "$VERSION" = "latest" ]; then
  if [ "$ACTION_DEBUG" = "true" ]; then
    echo "Fetching latest version from GitHub API..."
  fi

  # Try to get latest version from GitHub API with authentication
  if [ -n "${GITHUB_TOKEN:-}" ]; then
    VERSION=$(curl -s -H "Authorization: token $GITHUB_TOKEN" \
      https://api.github.com/repos/linyows/probe/releases/latest | \
      grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/' | tr -d '\r')
  else
    VERSION=$(curl -s https://api.github.com/repos/linyows/probe/releases/latest | \
      grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/' | tr -d '\r')
  fi

  # Fallback to known version if API fails
  if [ -z "$VERSION" ] || [ "$VERSION" = "null" ]; then
    if [ "$ACTION_DEBUG" = "true" ]; then
      echo "Failed to fetch from API, using fallback version v0.20.1"
    fi
    VERSION="v0.20.1"
  elif [ "$ACTION_DEBUG" = "true" ]; then
    echo "Successfully fetched version: $VERSION"
  fi
fi

if [ "$ACTION_DEBUG" = "true" ]; then
  echo "Using probe version: $VERSION"
fi

# Download probe to original directory to avoid conflicts
cd "$ORIGINAL_DIR"

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

if [ "$ACTION_DEBUG" = "true" ]; then
  echo "Download successful, extracting..."
fi

# Extract binary
if ! tar -xzf probe.tar.gz; then
  echo "Error: Failed to extract probe.tar.gz"
  exit 1
fi

# Verify extraction
if [ ! -f probe ]; then
  echo "Error: probe binary not found after extraction"
  echo "Archive contents:"
  tar -tzf probe.tar.gz || echo "Failed to list archive contents"
  exit 1
fi

chmod +x probe
if [ "$ACTION_DEBUG" = "true" ]; then
  echo "Probe binary ready: $(./probe --version 2>/dev/null || echo 'version check failed')"
fi

# Change back to working directory if specified
if [ -n "$WORKDIR" ]; then
  cd "$WORKDIR"
fi

# Process paths - handle both array format and single path
declare -a PATH_ARRAY
if [[ "$PATHS_INPUT" =~ ^\[.*\]$ ]]; then
  # Remove brackets and split by comma
  PATHS_CLEAN="${PATHS_INPUT#[}"
  PATHS_CLEAN="${PATHS_CLEAN%]}"
  IFS=',' read -ra PATH_ARRAY <<< "$PATHS_CLEAN"
else
  # Single path or newline/comma separated
  IFS=$'\n,' read -ra PATH_ARRAY <<< "$PATHS_INPUT"
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
    echo "Command: FORCE_COLOR=1 $ORIGINAL_DIR/probe $PROBE_ARGS $path"
  fi

  FORCE_COLOR=1 "$ORIGINAL_DIR/probe" $PROBE_ARGS "$path"
done

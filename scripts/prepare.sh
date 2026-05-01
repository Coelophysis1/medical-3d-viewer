#!/bin/bash
set -Eeuo pipefail

COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"

cd "${COZE_WORKSPACE_PATH}"

echo "Installing dependencies..."

# First try with frozen lockfile (fast, consistent)
if ! pnpm install --frozen-lockfile --prefer-offline 2>&1; then
  echo "Frozen lockfile install failed, falling back to regular install..."
  pnpm install --prefer-offline
fi

# Verify critical modules exist
echo "Verifying critical modules..."
CRITICAL_MODULES=("next" "react" "react-dom" "three")
for mod in "${CRITICAL_MODULES[@]}"; do
  if ! node -e "require.resolve('${mod}')" 2>/dev/null; then
    echo "ERROR: Critical module '${mod}' not found after install!"
    echo "Reinstalling all dependencies..."
    pnpm install
    break
  fi
done

echo "Dependencies installed and verified successfully."

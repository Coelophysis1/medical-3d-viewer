#!/bin/bash
set -Eeuo pipefail

COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"

cd "${COZE_WORKSPACE_PATH}"

echo "Installing dependencies..."

# Try install, handle ENOTEMPTY by cleaning node_modules
try_install() {
  local result
  result=$(pnpm install --frozen-lockfile --prefer-offline 2>&1) && return 0
  
  # Check for ENOTEMPTY error
  if echo "$result" | grep -q "ENOTEMPTY"; then
    echo "ENOTEMPTY detected, cleaning node_modules and retrying..."
    rm -rf node_modules
    pnpm install --prefer-offline 2>&1
    return $?
  fi
  
  # Other errors - fallback to regular install
  echo "Frozen lockfile install failed, falling back to regular install..."
  pnpm install --prefer-offline 2>&1
  return $?
}

try_install

# Verify critical modules exist
echo "Verifying critical modules..."
CRITICAL_MODULES=("next" "react" "react-dom" "three")
for mod in "${CRITICAL_MODULES[@]}"; do
  if ! node -e "require.resolve('${mod}')" 2>/dev/null; then
    echo "ERROR: Critical module '${mod}' not found after install!"
    echo "Cleaning node_modules and reinstalling..."
    rm -rf node_modules
    pnpm install
    break
  fi
done

# Final verification
for mod in "${CRITICAL_MODULES[@]}"; do
  if ! node -e "require.resolve('${mod}')" 2>/dev/null; then
    echo "FATAL: Module '${mod}' still missing after reinstall!"
    exit 1
  fi
done

echo "Dependencies installed and verified successfully."

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

echo "Building the Next.js project..."
pnpm next build

echo "Bundling server with tsup..."
pnpm tsup src/server.ts --format cjs --platform node --target node20 --outDir dist --no-splitting --no-minify

echo "Build completed successfully!"

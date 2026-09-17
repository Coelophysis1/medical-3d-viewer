#!/bin/bash
set -Eeuo pipefail
WORKSPACE_PATH="$(cd "$(dirname "$0")/.." && pwd)"
cd "${WORKSPACE_PATH}"
echo "Running validate..."
pnpm validate
echo "Validate passed!"

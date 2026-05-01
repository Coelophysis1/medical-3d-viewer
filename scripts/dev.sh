#!/bin/bash
set -Eeuo pipefail


PORT=5000
COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"
DEPLOY_RUN_PORT=5000


cd "${COZE_WORKSPACE_PATH}"

kill_port_if_listening() {
    local pids
    pids=$(ss -H -lntp 2>/dev/null | awk -v port="${DEPLOY_RUN_PORT}" '$4 ~ ":"port"$"' | grep -o 'pid=[0-9]*' | cut -d= -f2 | paste -sd' ' - || true)
    if [[ -z "${pids}" ]]; then
      echo "Port ${DEPLOY_RUN_PORT} is free."
      return
    fi
    echo "Port ${DEPLOY_RUN_PORT} in use by PIDs: ${pids} (SIGKILL)"
    echo "${pids}" | xargs -I {} kill -9 {}
    sleep 1
    pids=$(ss -H -lntp 2>/dev/null | awk -v port="${DEPLOY_RUN_PORT}" '$4 ~ ":"port"$"' | grep -o 'pid=[0-9]*' | cut -d= -f2 | paste -sd' ' - || true)
    if [[ -n "${pids}" ]]; then
      echo "Warning: port ${DEPLOY_RUN_PORT} still busy after SIGKILL, PIDs: ${pids}"
    else
      echo "Port ${DEPLOY_RUN_PORT} cleared."
    fi
}

echo "Clearing port ${PORT} before start."
kill_port_if_listening

# Verify critical modules exist before starting
echo "Verifying critical modules..."
CRITICAL_MODULES=("next" "react" "react-dom")
MISSING=0
for mod in "${CRITICAL_MODULES[@]}"; do
  if ! node -e "require.resolve('${mod}')" 2>/dev/null; then
    echo "WARNING: Critical module '${mod}' not found! Running pnpm install..."
    MISSING=1
  fi
done
if [ "$MISSING" -eq 1 ]; then
  pnpm install
fi

echo "Starting HTTP service on port ${PORT} for dev..."

PORT=$PORT pnpm tsx watch src/server.ts

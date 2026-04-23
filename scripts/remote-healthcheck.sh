#!/usr/bin/env bash
# shellcheck shell=bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/remote-healthcheck.sh -H user@host [options]

Options:
  -H, --host HOST             SSH host, e.g. root@1.2.3.4 (required)
  -d, --remote-dir PATH       Remote app root (default: /opt/new-api)
  -s, --service-name NAME     Service name (default: new-api)
  -p, --port PORT             Override API port (default: read from remote .env or 3000)
  -u, --public-url URL        Public URL for Nginx-level check, e.g. https://newapi.example.com
  -r, --retries NUMBER        Retry count for app readiness check (default: 20)
  -i, --interval SECONDS      Retry interval in seconds (default: 2)
  -h, --help                  Show this help

Examples:
  scripts/remote-healthcheck.sh -H root@1.2.3.4 -u https://newapi.example.com
EOF
}

HOST=""
REMOTE_DIR="/opt/new-api"
SERVICE_NAME="new-api"
PORT=""
PUBLIC_URL=""
RETRIES=20
INTERVAL=2

while [[ $# -gt 0 ]]; do
  case "$1" in
    -H|--host)
      HOST="$2"; shift 2;;
    -d|--remote-dir)
      REMOTE_DIR="$2"; shift 2;;
    -s|--service-name)
      SERVICE_NAME="$2"; shift 2;;
    -p|--port)
      PORT="$2"; shift 2;;
    -u|--public-url)
      PUBLIC_URL="$2"; shift 2;;
    -r|--retries)
      RETRIES="$2"; shift 2;;
    -i|--interval)
      INTERVAL="$2"; shift 2;;
    -h|--help)
      usage
      exit 0;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1;;
  esac
done

if [[ -z "$HOST" ]]; then
  echo "ERROR: --host is required"
  usage
  exit 1
fi

if [[ ! "$RETRIES" =~ ^[0-9]+$ ]] || [[ "$RETRIES" -le 0 ]]; then
  echo "ERROR: --retries must be a positive integer"
  exit 1
fi
if [[ ! "$INTERVAL" =~ ^[0-9]+$ ]] || [[ "$INTERVAL" -le 0 ]]; then
  echo "ERROR: --interval must be a positive integer"
  exit 1
fi

ssh "$HOST" "bash -s" <<EOF
set -euo pipefail

REMOTE_DIR="$REMOTE_DIR"
SERVICE_NAME="$SERVICE_NAME"
PORT="${PORT:-}"
PUBLIC_URL="${PUBLIC_URL:-}"
RETRIES=$RETRIES
INTERVAL=$INTERVAL

extract_env_value() {
  local key="\$1"
  local file="\$2"
  if [[ ! -f "\$file" ]]; then
    return 1
  fi
  grep -E "^\\\${key}=" "\$file" | tail -n 1 | sed -E 's/^[^=]+=(.*)$/\\1/' | sed -E 's/^"?(.*)"?$/\\1/'
}

echo "==> 检查服务状态 ($SERVICE_NAME)..."
if command -v systemctl >/dev/null 2>&1; then
  if systemctl is-active --quiet "\$SERVICE_NAME"; then
    echo "systemctl: \$SERVICE_NAME is active"
  else
    echo "systemctl: \$SERVICE_NAME is not active"
  fi
  systemctl status "\$SERVICE_NAME" --no-pager -l || true
else
  if pgrep -af \"\${REMOTE_DIR}/current/new-api\" >/dev/null 2>&1; then
    echo "process: running"
  else
    echo "process: not running"
  fi
fi

if [[ -z "\$PORT" ]] && [[ -f "\${REMOTE_DIR}/.env" ]]; then
  PORT_FROM_ENV=\$(extract_env_value PORT "\${REMOTE_DIR}/.env")
  if [[ -n "\${PORT_FROM_ENV}" ]]; then
    PORT="\$PORT_FROM_ENV"
  fi
fi

PORT="\${PORT:-3000}"
echo "==> 健康检查目标端口: \$PORT"

echo "==> 检查监听端口..."
if command -v ss >/dev/null 2>&1; then
  ss -lntp | grep -E ":[[:space:]]*\$PORT\\b|:\$PORT\\s" || true
else
  netstat -lntp 2>/dev/null | grep ":\\$PORT " || true
fi

tmp_body=\$(mktemp)
cleanup() {
  rm -f "\$tmp_body"
}
trap cleanup EXIT

app_ok=false
for i in \$(seq 1 "\$RETRIES"); do
  code=\$(curl -sS -o "\$tmp_body" -w "%{http_code}" "http://127.0.0.1:\$PORT/api/status" || true)
  if [[ "\$code" == "200" ]]; then
    echo "==> app check success: /api/status -> 200 (attempt \$i/\$RETRIES)"
    app_ok=true
    break
  fi
  echo "==> app check waiting: /api/status -> \$code (attempt \$i/\$RETRIES), sleep \${INTERVAL}s"
  sleep "\$INTERVAL"
done

if [[ "\$app_ok" == "false" ]]; then
  echo "ERROR: /api/status not ready on 127.0.0.1:\$PORT after \$RETRIES attempts"
  echo "--- last response body ---"
  cat "\$tmp_body" || true
  echo
  echo "--- recent logs ---"
  tail -n 40 \"\${REMOTE_DIR}/logs/new-api.err\" || true
  echo "---"
  exit 1
fi

code_root=\$(curl -sS -o /dev/null -w "%{http_code}" "http://127.0.0.1:\$PORT/" || true)
if [[ "\$code_root" =~ ^5[0-9][0-9]$ ]]; then
  echo "WARN: / returns \$code_root, frontend route may fail"
fi

if [[ -n "\$PUBLIC_URL" ]]; then
  echo "==> 检查对外访问（含 Nginx 反代）: \$PUBLIC_URL"
  code_public=\$(curl -sS -o "\$tmp_body" -w "%{http_code}" "\$PUBLIC_URL/api/status" || true)
  if [[ "\$code_public" == "200" ]]; then
    echo "public api status: 200"
  else
    if [[ "\$code_public" == "502" ]]; then
      echo "WARN: public /api/status returned 502, likely upstream nginx 502 issue"
    else
      echo "WARN: public /api/status returned \$code_public"
    fi
    echo "--- public response body ---"
    cat "\$tmp_body" || true
    echo
  fi
else
  echo "INFO: PUBLIC_URL not set, skipping nginx-level check"
fi

echo "==> 最近运行日志关键字检查..."
if grep -Ei "(failed to initialize|failed to start|panic|fatal)" \"\${REMOTE_DIR}/logs/new-api.err\" | tail -n 20; then
  echo "FOUND: suspicious keywords in logs"
else
  echo "No critical error keyword found in recent logs"
fi

echo "Remote health check completed."
EOF

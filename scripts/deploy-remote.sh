#!/usr/bin/env bash
# shellcheck shell=bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  deploy-remote.sh -H user@host [options]

Options:
  -H, --host HOST        SSH host, e.g. root@1.2.3.4 (required)
  -d, --remote-dir PATH  Remote app root (default: /opt/new-api)
  -l, --local-root PATH  Local repo root (default: current directory)
  -r, --release-dir NAME Name of release folder timestamp (default: generated)
  -b, --backup-dir PATH  Remote backup dir for previous binary/dist (default: /opt/new-api/releases)
  -e, --env-file PATH    Optional local .env file to upload to remote /opt/new-api/.env
  -u, --public-url URL    Public URL for post-deploy health check, e.g. https://newapi.example.com
  -k, --keep-releases NUM  Keep last N releases locally (default: 5)
  -n, --skip-build       Skip local build steps (assume ./new-api and web/dist already prepared)
  --skip-db-check        Allow SQL_DSN=local/empty (for local sqlite only)
  --skip-healthcheck     Skip post-deploy remote health check
  --no-rollback         Disable auto rollback when health check fails
  --healthcheck-retries  Number of retries for post-deploy health check (default: 20)
  --healthcheck-interval Health check interval in seconds (default: 2)
  -h, --help             Show this help

Env vars:
  BINARY_NAME (default: new-api)
  SERVICE_NAME (default: new-api)

Examples:
  bash scripts/deploy-remote.sh -H root@1.2.3.4 -e .env.production
EOF
}

HOST=""
REMOTE_DIR="/opt/new-api"
LOCAL_ROOT="$(pwd)"
BACKUP_DIR="$REMOTE_DIR/releases"
ENV_FILE=""
SKIP_BUILD="false"
RELEASE_NAME=""
SKIP_DB_CHECK="false"
KEEP_RELEASES=5
ROLLBACK_ON_FAIL="true"
HEALTHCHECK_RETRIES=20
HEALTHCHECK_INTERVAL=2

BINARY_NAME="${BINARY_NAME:-new-api}"
SERVICE_NAME="${SERVICE_NAME:-new-api}"
LOCAL_BINARY="/tmp/${BINARY_NAME}"
LOCAL_RELEASE_ARCHIVE=""
SKIP_HEALTHCHECK="false"
PUBLIC_URL=""
TARGET_GOOS="${TARGET_GOOS:-linux}"
TARGET_GOARCH="${TARGET_GOARCH:-amd64}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    -H|--host)
      HOST="$2"; shift 2;;
    -d|--remote-dir)
      REMOTE_DIR="$2"; BACKUP_DIR="$REMOTE_DIR/releases"; shift 2;;
    -l|--local-root)
      LOCAL_ROOT="$2"; shift 2;;
    -r|--release-dir)
      RELEASE_NAME="$2"; shift 2;;
    -b|--backup-dir)
      BACKUP_DIR="$2"; shift 2;;
    -e|--env-file)
      ENV_FILE="$2"; shift 2;;
    -u|--public-url)
      PUBLIC_URL="$2"; shift 2;;
    -k|--keep-releases)
      KEEP_RELEASES="$2"; shift 2;;
    -n|--skip-build)
      SKIP_BUILD="true"; shift;;
    --healthcheck-retries)
      HEALTHCHECK_RETRIES="$2"; shift 2;;
    --healthcheck-interval)
      HEALTHCHECK_INTERVAL="$2"; shift 2;;
    --skip-db-check)
      SKIP_DB_CHECK="true"; shift;;
    --skip-healthcheck)
      SKIP_HEALTHCHECK="true"; shift;;
    --no-rollback)
      ROLLBACK_ON_FAIL="false"; shift;;
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

if [[ ! -d "$LOCAL_ROOT" ]]; then
  echo "ERROR: local root does not exist: $LOCAL_ROOT"
  exit 1
fi
if [[ ! "$KEEP_RELEASES" =~ ^[0-9]+$ ]] || [[ "$KEEP_RELEASES" -lt 1 ]]; then
  echo "ERROR: keep-releases must be a positive integer"
  exit 1
fi
if [[ ! "$HEALTHCHECK_RETRIES" =~ ^[0-9]+$ ]] || [[ "$HEALTHCHECK_RETRIES" -lt 1 ]]; then
  echo "ERROR: healthcheck-retries must be a positive integer"
  exit 1
fi
if [[ ! "$HEALTHCHECK_INTERVAL" =~ ^[0-9]+$ ]] || [[ "$HEALTHCHECK_INTERVAL" -lt 1 ]]; then
  echo "ERROR: healthcheck-interval must be a positive integer"
  exit 1
fi

PREVIOUS_RELEASE_NAME="$(ssh "$HOST" "if command -v readlink >/dev/null 2>&1; then basename \$(readlink ${REMOTE_DIR}/current 2>/dev/null || true); fi")"

TIMESTAMP="${RELEASE_NAME:-$(date +%Y%m%d%H%M%S)}"
RELEASE_DIR="/tmp/new-api-release-${TIMESTAMP}"
RELEASE_NAME="$TIMESTAMP"
REMOTE_RELEASE_DIR="${REMOTE_DIR}/releases/${RELEASE_NAME}"
LOCAL_RELEASE_ARCHIVE="/tmp/new-api-release-${TIMESTAMP}.tar.gz"

echo "[1/6] Precheck tools on local..."
command -v go >/dev/null || { echo "ERROR: go not found"; exit 1; }
command -v bun >/dev/null || { echo "ERROR: bun not found"; exit 1; }
command -v rsync >/dev/null || { echo "ERROR: rsync not found"; exit 1; }
command -v ssh >/dev/null || { echo "ERROR: ssh not found"; exit 1; }
command -v scp >/dev/null || { echo "ERROR: scp not found"; exit 1; }

pushd "$LOCAL_ROOT" >/dev/null

if [[ "$SKIP_BUILD" != "true" ]]; then
  echo "[2/6] Build frontend..."
  cd web
  bun install
  bun run build
  cd "$LOCAL_ROOT"

  echo "[3/6] Build backend..."
  GOOS="$TARGET_GOOS" GOARCH="$TARGET_GOARCH" CGO_ENABLED=0 go build -o "$LOCAL_BINARY" .
else
  if [[ ! -f "$LOCAL_BINARY" ]] || [[ ! -d "web/dist" ]]; then
    echo "ERROR: SKIP_BUILD enabled but binary or web/dist missing"
    exit 1
  fi
  echo "Skip build explicitly, keep existing binary/dist."
fi

echo "[4/6] Prepare release package..."
mkdir -p "$RELEASE_DIR"
cp "$LOCAL_BINARY" "$RELEASE_DIR/$BINARY_NAME"
mkdir -p "$RELEASE_DIR/web"
cp -R web/dist "$RELEASE_DIR/web/"
if [[ -n "$ENV_FILE" ]]; then
  cp "$ENV_FILE" "$RELEASE_DIR/.env"
fi
tar -czf "$LOCAL_RELEASE_ARCHIVE" -C "$RELEASE_DIR" .

rm -rf "$RELEASE_DIR"

echo "[5/6] Upload release package..."
scp "$LOCAL_RELEASE_ARCHIVE" "${HOST}:/tmp/new-api-release-${TIMESTAMP}.tar.gz"

echo "[6/6] Remote deploy + reload..."
ssh "$HOST" "SKIP_DB_CHECK='$SKIP_DB_CHECK' \
BINARY_NAME='$BINARY_NAME' \
SERVICE_NAME='$SERVICE_NAME' \
REMOTE_DIR='$REMOTE_DIR' \
BACKUP_DIR='$BACKUP_DIR' \
RELEASE_NAME='$RELEASE_NAME' \
PREVIOUS_RELEASE_NAME='$PREVIOUS_RELEASE_NAME' \
REMOTE_RELEASE_DIR='$REMOTE_RELEASE_DIR' \
ARCHIVE='/tmp/new-api-release-${TIMESTAMP}.tar.gz' \
KEEP_RELEASES='$KEEP_RELEASES' \
ROLLBACK_ON_FAIL='$ROLLBACK_ON_FAIL' \
HEALTHCHECK_RETRIES='$HEALTHCHECK_RETRIES' \
HEALTHCHECK_INTERVAL='$HEALTHCHECK_INTERVAL' \
bash -s" <<'EOF'
set -euo pipefail

mkdir -p "$REMOTE_DIR" "$BACKUP_DIR" "$REMOTE_DIR/logs" "$REMOTE_DIR/data"

mkdir -p "$REMOTE_RELEASE_DIR"
tar -xzf "$ARCHIVE" -C "$REMOTE_RELEASE_DIR"
chmod +x "$REMOTE_RELEASE_DIR/$BINARY_NAME"

cat > /tmp/new-api.service.$$ <<UNIT
[Unit]
Description=New API
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$REMOTE_DIR/current
EnvironmentFile=$REMOTE_DIR/.env
ExecStart=$REMOTE_DIR/current/$BINARY_NAME
Restart=always
RestartSec=5
LimitNOFILE=65535
StandardOutput=append:$REMOTE_DIR/logs/new-api.log
StandardError=append:$REMOTE_DIR/logs/new-api.err

[Install]
WantedBy=multi-user.target
UNIT

ln -sfn "$REMOTE_RELEASE_DIR" "${REMOTE_DIR}/current"
ACTIVE_RELEASE="$(readlink "${REMOTE_DIR}/current")"

if [[ -z "$ACTIVE_RELEASE" ]]; then
  ACTIVE_RELEASE="${REMOTE_DIR}/current"
fi

write_status() {
  echo "[$1] $2"
}

start_service() {
  if command -v systemctl >/dev/null 2>&1; then
    systemctl daemon-reload
    systemctl enable "${SERVICE_NAME}" || true
    systemctl restart "${SERVICE_NAME}"
  else
    pkill -f "${REMOTE_DIR}/current/${BINARY_NAME}" || true
    sleep 1
    nohup "${REMOTE_DIR}/current/${BINARY_NAME}" >>"${REMOTE_DIR}/logs/new-api.log" 2>>"${REMOTE_DIR}/logs/new-api.err" &
  fi
}

wait_api_ready() {
  local target_label="$1"
  local port="$2"
  local attempt
  for attempt in $(seq 1 "${HEALTHCHECK_RETRIES}"); do
    code=$(curl -sS -o /dev/null -w "%{http_code}" "http://127.0.0.1:${port}/api/status" || true)
    if [[ "$code" == "200" ]]; then
      write_status "OK" "${target_label} passed on attempt ${attempt}/${HEALTHCHECK_RETRIES}"
      return 0
    fi
    write_status "WARN" "${target_label} /api/status -> ${code}, wait ${HEALTHCHECK_INTERVAL}s (${attempt}/${HEALTHCHECK_RETRIES})"
    sleep "${HEALTHCHECK_INTERVAL}"
  done
  return 1
}

# prune old releases after successful deploy (keep latest N)
cleanup_old_releases() {
  if [[ "$KEEP_RELEASES" -gt 0 ]]; then
    mapfile -t old_releases < <(
      ls -1 "$BACKUP_DIR" | sort | head -n -"$KEEP_RELEASES"
    )
    for rel in "${old_releases[@]}"; do
      rm -rf "${BACKUP_DIR}/${rel}"
    done
  fi
}

if [[ -f "${REMOTE_DIR}/.env" ]]; then
  : 
elif [[ -f "${REMOTE_RELEASE_DIR}/.env" ]]; then
  mv "${REMOTE_RELEASE_DIR}/.env" "${REMOTE_DIR}/.env"
fi

SKIP_DB_CHECK="${SKIP_DB_CHECK:-false}"
if [[ "${SKIP_DB_CHECK}" != "true" ]]; then
  SQL_DSN_VALUE=""
  if [[ ! -f "${REMOTE_DIR}/.env" ]]; then
    echo "WARN: ${REMOTE_DIR}/.env not found, skip SQL_DSN strict check (local sqlite or first-time bootstrap)."
  else
    SQL_DSN_VALUE="$(grep -E '^SQL_DSN=' "${REMOTE_DIR}/.env" | tail -n 1 | cut -d= -f2- | sed -e 's/[[:space:]]//g' || true)"
    SQL_DSN_VALUE="${SQL_DSN_VALUE:-}"
  fi
  SQL_DSN_VALUE_NORM="${SQL_DSN_VALUE}"
  SQL_DSN_VALUE_NORM="${SQL_DSN_VALUE_NORM#\"}"
  SQL_DSN_VALUE_NORM="${SQL_DSN_VALUE_NORM%\"}"
  SQL_DSN_VALUE_NORM="${SQL_DSN_VALUE_NORM#\'}"
  SQL_DSN_VALUE_NORM="${SQL_DSN_VALUE_NORM%\'}"

  if [[ -z "$SQL_DSN_VALUE_NORM" || "${SQL_DSN_VALUE_NORM,,}" == "local" ]]; then
    echo "ERROR: SQL_DSN must be set and not local for remote deployment."
    echo "Current SQL_DSN value in ${REMOTE_DIR}/.env: \"${SQL_DSN_VALUE}\""
    echo "If this is intentionally a local sqlite deployment, rerun with --skip-db-check."
    exit 1
  fi
  if [[ "$SQL_DSN_VALUE_NORM" == *"<"* || "$SQL_DSN_VALUE_NORM" == *">"* || "$SQL_DSN_VALUE_NORM" == *"你的"* ]]; then
    echo "ERROR: SQL_DSN appears to be placeholder text, refuse deploy."
    echo "Current SQL_DSN value in ${REMOTE_DIR}/.env: \"${SQL_DSN_VALUE}\""
    exit 1
  fi
fi

mv /tmp/new-api.service.$$ "/etc/systemd/system/${SERVICE_NAME}.service"
start_service

PORT=3000
if [[ -f "${REMOTE_DIR}/.env" ]]; then
  PORT_FROM_ENV="$(grep -E '^PORT=' "${REMOTE_DIR}/.env" | tail -n 1 | cut -d= -f2- | tr -d '[:space:]' || true)"
  if [[ -n "$PORT_FROM_ENV" ]]; then
    PORT="$PORT_FROM_ENV"
  fi
fi

if ! wait_api_ready "current" "$PORT"; then
  write_status "ERROR" "new release not ready on :${PORT}"
  if [[ "$ROLLBACK_ON_FAIL" == "true" && -n "${PREVIOUS_RELEASE_NAME:-}" ]]; then
    PREVIOUS_RELEASE_DIR="${REMOTE_DIR}/releases/${PREVIOUS_RELEASE_NAME}"
    if [[ -d "$PREVIOUS_RELEASE_DIR" ]]; then
      write_status "WARN" "rollback to previous release ${PREVIOUS_RELEASE_NAME}"
      ln -sfn "$PREVIOUS_RELEASE_DIR" "${REMOTE_DIR}/current"
      start_service
      if wait_api_ready "rollback" "$PORT"; then
        write_status "INFO" "rollback succeeded"
      else
        write_status "ERROR" "rollback failed, manual recovery required"
      fi
    else
      write_status "ERROR" "previous release not found, cannot rollback"
    fi
  fi
  exit 1
fi

cleanup_old_releases
systemctl status "${SERVICE_NAME}" --no-pager -l || true

rm -f "$ARCHIVE"
rm -f /tmp/new-api.service.$$
EOF

popd >/dev/null

rm -f "$LOCAL_RELEASE_ARCHIVE"
echo "Deploy done. Remote release: $REMOTE_RELEASE_DIR"
if [[ "$SKIP_HEALTHCHECK" != "true" ]]; then
  if [[ -n "$PUBLIC_URL" ]]; then
    bash scripts/remote-healthcheck.sh -H "$HOST" -d "$REMOTE_DIR" -s "$SERVICE_NAME" -u "$PUBLIC_URL" -r "$HEALTHCHECK_RETRIES" -i "$HEALTHCHECK_INTERVAL"
  else
    bash scripts/remote-healthcheck.sh -H "$HOST" -d "$REMOTE_DIR" -s "$SERVICE_NAME" -r "$HEALTHCHECK_RETRIES" -i "$HEALTHCHECK_INTERVAL"
  fi
  if [[ $? -ne 0 ]]; then
    if [[ "$ROLLBACK_ON_FAIL" == "true" && -n "$PREVIOUS_RELEASE_NAME" ]]; then
      bash scripts/rollback-remote.sh -H "$HOST" -d "$REMOTE_DIR" -r "$PREVIOUS_RELEASE_NAME"
    fi
    exit 1
  fi
fi

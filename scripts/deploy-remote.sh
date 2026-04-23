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
  -n, --skip-build       Skip local build steps (assume ./new-api and web/dist already prepared)
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

BINARY_NAME="${BINARY_NAME:-new-api}"
SERVICE_NAME="${SERVICE_NAME:-new-api}"
LOCAL_BINARY="/tmp/${BINARY_NAME}"
LOCAL_RELEASE_ARCHIVE=""

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
    -n|--skip-build)
      SKIP_BUILD="true"; shift;;
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
  CGO_ENABLED=0 go build -o "$LOCAL_BINARY" .
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
ssh "$HOST" "bash -s" <<EOF
set -euo pipefail

REMOTE_DIR="$REMOTE_DIR"
BACKUP_DIR="$BACKUP_DIR"
RELEASE_NAME="$RELEASE_NAME"
REMOTE_RELEASE_DIR="$REMOTE_RELEASE_DIR"
ARCHIVE="/tmp/new-api-release-${TIMESTAMP}.tar.gz"
BINARY_NAME="$BINARY_NAME"
SERVICE_NAME="$SERVICE_NAME"

mkdir -p "\$REMOTE_DIR" "\$BACKUP_DIR" "\$REMOTE_DIR/logs" "\$REMOTE_DIR/data"

mkdir -p "\$REMOTE_RELEASE_DIR"
tar -xzf "\$ARCHIVE" -C "\$REMOTE_RELEASE_DIR"
chmod +x "\$REMOTE_RELEASE_DIR/\$BINARY_NAME"

cat > /tmp/new-api.service.$$ <<'UNIT'
[Unit]
Description=New API
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=${REMOTE_DIR}/current
EnvironmentFile=${REMOTE_DIR}/.env
ExecStart=${REMOTE_DIR}/current/${BINARY_NAME}
Restart=always
RestartSec=5
LimitNOFILE=65535
StandardOutput=append:${REMOTE_DIR}/logs/new-api.log
StandardError=append:${REMOTE_DIR}/logs/new-api.err

[Install]
WantedBy=multi-user.target
UNIT

ln -sfn "\$REMOTE_RELEASE_DIR" "${REMOTE_DIR}/current"

if [[ -f "${REMOTE_DIR}/.env" ]]; then
  : 
elif [[ -f "${REMOTE_RELEASE_DIR}/.env" ]]; then
  mv "${REMOTE_RELEASE_DIR}/.env" "${REMOTE_DIR}/.env"
fi

if command -v systemctl >/dev/null 2>&1; then
  mv /tmp/new-api.service.$$ /etc/systemd/system/\${SERVICE_NAME}.service
  systemctl daemon-reload
  systemctl enable \${SERVICE_NAME}
  systemctl restart \${SERVICE_NAME}
  systemctl status \${SERVICE_NAME} --no-pager -l
else
  pkill -f "${REMOTE_DIR}/current/${BINARY_NAME}" || true
  nohup "${REMOTE_DIR}/current/${BINARY_NAME}" >>"${REMOTE_DIR}/logs/new-api.log" 2>>"${REMOTE_DIR}/logs/new-api.err" &
  echo "service manager not found, process started by nohup"
fi

rm -f "\$ARCHIVE"
rm -f /tmp/new-api.service.\$\$
EOF

popd >/dev/null

rm -f "$LOCAL_RELEASE_ARCHIVE"
echo "Deploy done. Remote release: $REMOTE_RELEASE_DIR"

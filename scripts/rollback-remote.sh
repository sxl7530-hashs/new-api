#!/usr/bin/env bash
# shellcheck shell=bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  rollback-remote.sh -H user@host [options]

Options:
  -H, --host HOST       SSH host, e.g. root@1.2.3.4 (required)
  -d, --remote-dir PATH Remote app root (default: /opt/new-api)
  -r, --release NAME    Release directory name to rollback to. If omitted, rollback to previous release.
  -h, --help            Show this help

Examples:
  bash scripts/rollback-remote.sh -H root@1.2.3.4 -r 20260423000000
EOF
}

HOST=""
REMOTE_DIR="/opt/new-api"
TARGET_RELEASE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    -H|--host)
      HOST="$2"; shift 2;;
    -d|--remote-dir)
      REMOTE_DIR="$2"; shift 2;;
    -r|--release)
      TARGET_RELEASE="$2"; shift 2;;
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

ssh "$HOST" "bash -s" <<EOF
set -euo pipefail

REMOTE_DIR="$REMOTE_DIR"
TARGET_RELEASE="$TARGET_RELEASE"

if [[ ! -d "\${REMOTE_DIR}/releases" ]]; then
  echo "ERROR: no release directory found: \${REMOTE_DIR}/releases"
  exit 1
fi

CURRENT_RELEASE_NAME=""
if [[ -L "\${REMOTE_DIR}/current" ]]; then
  CURRENT_RELEASE_NAME="\$(basename "\$(readlink "\${REMOTE_DIR}/current" 2>/dev/null || true)")"
fi

if [[ -n "\$TARGET_RELEASE" ]]; then
  RELEASE_DIR="\${REMOTE_DIR}/releases/\${TARGET_RELEASE}"
else
  # pick previous release by current pointer first, then fallback to latest-but-one
  if [[ -n "\$CURRENT_RELEASE_NAME" ]]; then
    RELEASES_SORTED="\$(ls -1 \${REMOTE_DIR}/releases | sort)"
    PREV_RELEASE_NAME="\$(echo \"\$RELEASES_SORTED\" | awk -v cur=\"\$CURRENT_RELEASE_NAME\" 'BEGIN {found=0} {if(found==1) {print; exit}} \$0==cur {found=1}')"
    if [[ -z "\$PREV_RELEASE_NAME" ]]; then
      PREV_RELEASE_NAME="\$(echo \"\$RELEASES_SORTED\" | sort | head -n 1)"
    fi
    RELEASE_NAME_SELECTED="\$PREV_RELEASE_NAME"
  else
    # fallback: pick latest two by timestamp and use older one as rollback target
    RELEASE_NAME_SELECTED="\$(ls -1 \${REMOTE_DIR}/releases | sort | tail -n 2 | head -n 1)"
  fi
  RELEASE_DIR="\${REMOTE_DIR}/releases/\${RELEASE_NAME_SELECTED}"
  if [[ -z "\$RELEASE_DIR" ]]; then
    echo "ERROR: no releases found"
    exit 1
  fi
fi

if [[ ! -d "\$RELEASE_DIR" ]]; then
  echo "ERROR: release not found: \$RELEASE_DIR"
  exit 1
fi

ln -sfn "\$RELEASE_DIR" "\${REMOTE_DIR}/current"

if command -v systemctl >/dev/null 2>&1; then
  systemctl restart new-api || true
  systemctl status new-api --no-pager -l
else
  pkill -f "\${REMOTE_DIR}/current/new-api" || true
  nohup "\${REMOTE_DIR}/current/new-api" >>"\${REMOTE_DIR}/logs/new-api.log" 2>>"\${REMOTE_DIR}/logs/new-api.err" &
fi

echo "Rollback to: \$RELEASE_DIR"
EOF

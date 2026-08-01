#!/usr/bin/env bash
set -euo pipefail

PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
LOCK_FILE="/opt/enterprise-flow-hub/.cleanup-docker-images.lock"

usage() {
  cat <<'EOF'
Usage:
  ./cleanup-docker-images.sh [--all] [--until DURATION] [--volumes]

Options:
  --all      Remove all unused images, not only dangling images.
  --until    Only remove objects older than this Docker duration (default: 168h).
  --volumes  Also remove unused anonymous Docker volumes. Do not use this
             unless you are sure important data is stored in named volumes.

Examples:
  ./cleanup-docker-images.sh
  ./cleanup-docker-images.sh --all --until 168h
  ./cleanup-docker-images.sh --all --until 720h --volumes
EOF
}

PRUNE_IMAGES_FLAG=""
PRUNE_VOLUMES_FLAG=""
RETENTION="168h"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --all)
      PRUNE_IMAGES_FLAG="-a"
      shift
      ;;
    --until)
      if [ "$#" -lt 2 ] || [ -z "$2" ]; then
        echo "--until requires a Docker duration such as 168h." >&2
        exit 2
      fi
      RETENTION="$2"
      shift 2
      ;;
    --volumes)
      PRUNE_VOLUMES_FLAG="--volumes"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ ! "$RETENTION" =~ ^[1-9][0-9]*(s|m|h|d|w)$ ]]; then
  echo "Invalid --until duration: $RETENTION" >&2
  exit 2
fi

if command -v flock >/dev/null 2>&1; then
  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    echo "Another Docker cleanup is already running. Exiting."
    exit 0
  fi
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed or not in PATH." >&2
  exit 1
fi

echo "== Disk usage before cleanup =="
df -h /
echo

echo "== Docker usage before cleanup =="
docker system df || true
echo

echo "== Removing stopped containers =="
docker container prune -f --filter "until=24h"
echo

echo "== Removing unused Docker images older than ${RETENTION} =="
docker image prune -f ${PRUNE_IMAGES_FLAG} --filter "until=${RETENTION}"
echo

echo "== Removing build cache older than ${RETENTION} =="
docker builder prune -f --filter "until=${RETENTION}"
echo

if [ -n "$PRUNE_VOLUMES_FLAG" ]; then
  echo "== Removing unused anonymous volumes =="
  docker volume prune -f
  echo
fi

echo "== Docker usage after cleanup =="
docker system df || true
echo

echo "== Disk usage after cleanup =="
df -h /

#!/usr/bin/env bash
set -euo pipefail

PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
LOCK_FILE="/opt/enterprise-flow-hub/.cleanup-docker-images.lock"

usage() {
  cat <<'EOF'
Usage:
  ./cleanup-docker-images.sh [--all] [--volumes]

Options:
  --all      Remove all unused images, not only dangling images.
  --volumes  Also remove unused anonymous Docker volumes. Do not use this
             unless you are sure important data is stored in named volumes.

Examples:
  ./cleanup-docker-images.sh
  ./cleanup-docker-images.sh --all
  ./cleanup-docker-images.sh --all --volumes
EOF
}

PRUNE_IMAGES_FLAG=""
PRUNE_VOLUMES_FLAG=""

for arg in "$@"; do
  case "$arg" in
    --all)
      PRUNE_IMAGES_FLAG="-a"
      ;;
    --volumes)
      PRUNE_VOLUMES_FLAG="--volumes"
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
docker container prune -f
echo

echo "== Removing unused Docker images =="
docker image prune -f ${PRUNE_IMAGES_FLAG}
echo

echo "== Removing unused build cache =="
docker builder prune -f
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

#!/usr/bin/env bash
set -euo pipefail

PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
LOCK_FILE="/opt/enterprise-flow-hub/.cleanup-docker-images.lock"

usage() {
  cat <<'EOF'
Usage:
  ./cleanup-docker-images.sh [--all] [--until DURATION] [--keep-latest COUNT] [--volumes]

Options:
  --all      Remove all unused images, not only dangling images.
  --until    Only remove objects older than this Docker duration (default: 168h).
  --keep-latest
             Keep only the newest COUNT tagged releases for each repository used
             by a running container. Running images are always protected by Docker.
  --volumes  Also remove unused anonymous Docker volumes. Do not use this
             unless you are sure important data is stored in named volumes.

Examples:
  ./cleanup-docker-images.sh
  ./cleanup-docker-images.sh --all --until 168h --keep-latest 2
  ./cleanup-docker-images.sh --all --until 720h --volumes
EOF
}

PRUNE_IMAGES_FLAG=""
PRUNE_VOLUMES_FLAG=""
RETENTION="168h"
KEEP_LATEST="0"

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
    --keep-latest)
      if [ "$#" -lt 2 ] || [[ ! "$2" =~ ^[1-9][0-9]*$ ]]; then
        echo "--keep-latest requires a positive integer." >&2
        exit 2
      fi
      KEEP_LATEST="$2"
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
      echo "Unknown option: $1" >&2
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

if [ "$KEEP_LATEST" -gt 0 ]; then
  echo "== Keeping the newest ${KEEP_LATEST} releases per active repository =="
  mapfile -t active_repositories < <(
    docker ps --format '{{.Image}}' \
      | sed -E 's/@sha256:.*$//; s/:[^/:]+$//' \
      | awk 'NF && !seen[$0]++'
  )

  for repository in "${active_repositories[@]}"; do
    mapfile -t tagged_images < <(
      docker image ls "$repository" --format '{{.Repository}}:{{.Tag}}' \
        | grep -v ':<none>$' \
        | while IFS= read -r image; do
            created="$(docker image inspect --format '{{.Created}}' "$image")"
            printf '%s\t%s\n' "$created" "$image"
          done \
        | sort -r \
        | cut -f2-
    )

    if [ "${#tagged_images[@]}" -le "$KEEP_LATEST" ]; then
      echo "$repository: ${#tagged_images[@]} release(s), nothing to remove."
      continue
    fi

    for image in "${tagged_images[@]:$KEEP_LATEST}"; do
      echo "Removing superseded release: $image"
      docker image rm "$image"
    done
  done
  echo
fi

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

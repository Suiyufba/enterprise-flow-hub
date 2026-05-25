#!/usr/bin/env bash
set -euo pipefail

cd /opt/enterprise-flow-hub
set -a
. ./.env
set +a

mkdir -p backups
stamp="$(date +%Y%m%d-%H%M%S)"

docker run --rm \
  --entrypoint node \
  --workdir /app/backend \
  -e BACKUP_STAMP="$stamp" \
  -v enterprise-flow-hub_backend-data:/data \
  -v /opt/enterprise-flow-hub/backups:/backups \
  "$BACKEND_IMAGE" \
  -e 'const Database = require("better-sqlite3"); const stamp = process.env.BACKUP_STAMP; const db = new Database("/data/efh.db", { readonly: true }); db.backup(`/backups/efh-${stamp}.db`).then(() => console.log(`backup ok: efh-${stamp}.db`));'

find /opt/enterprise-flow-hub/backups -name "efh-*.db" -type f -mtime +14 -delete


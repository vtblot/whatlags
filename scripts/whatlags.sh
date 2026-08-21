#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ! -d node_modules ]]; then
  echo "Installe les dépendances : npm install" >&2
  exit 1
fi
if [[ ! -f .next/BUILD_ID ]]; then
  npm run build
fi
exec npm start

#!/usr/bin/env bash
set -euo pipefail

# Servidor estático simples para testar o site localmente.
# Uso: scripts/serve.sh 8080

PORT="${1:-8088}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/docs"

echo "Servindo ${ROOT_DIR} em http://localhost:${PORT}"
python -m http.server "${PORT}" --directory "${ROOT_DIR}"


#!/usr/bin/env bash
set -euo pipefail

# Prepara o banco SQLite para uso no GitHub Pages:
# - Copia o banco de origem
# - Executa VACUUM para compactar
# - Gera versões gzip e brotli
# - Emite manifest JSON com metadados
#
# Uso:
#   DB_VERSION=v1 DB_URL=https://.../db.sqlite.gz scripts/prepare-db.sh
#   scripts/prepare-db.sh data/source.sqlite
#
# Requisitos: sqlite3, gzip, brotli, sha256sum, stat

SRC_DB="${1:-data/source.sqlite}"
TMP_DIR="tmp"
OUT_DIR="docs/data"
DB_VERSION="${DB_VERSION:-dev}"
DB_URL="${DB_URL:-./data/db.sqlite.gz}"
DB_BROTLI_URL="${DB_BROTLI_URL:-./data/db.sqlite.br}"

mkdir -p "${TMP_DIR}" "${OUT_DIR}"

WORK_DB="${TMP_DIR}/db-prepared.sqlite"
cp "${SRC_DB}" "${WORK_DB}"

echo "[1/4] VACUUM no banco..."
sqlite3 "${WORK_DB}" "PRAGMA journal_mode=OFF; VACUUM;"

echo "[2/4] Gerando gzip..."
gzip -c "${WORK_DB}" > "${OUT_DIR}/db.sqlite.gz"

echo "[3/4] Gerando brotli..."
brotli -f "${WORK_DB}" -o "${OUT_DIR}/db.sqlite.br"

SIZE_GZ=$(stat -c%s "${OUT_DIR}/db.sqlite.gz")
SIZE_BR=$(stat -c%s "${OUT_DIR}/db.sqlite.br")
SHA_GZ=$(sha256sum "${OUT_DIR}/db.sqlite.gz" | awk '{print $1}')
SHA_BR=$(sha256sum "${OUT_DIR}/db.sqlite.br" | awk '{print $1}')

echo "[4/4] Gravando manifest.json..."
cat > "${OUT_DIR}/manifest.json" <<EOF
{
  "version": "${DB_VERSION}",
  "sources": {
    "gzip": {
      "url": "${DB_URL}",
      "size": ${SIZE_GZ},
      "sha256": "${SHA_GZ}",
      "encoding": "gzip"
    },
    "brotli": {
      "url": "${DB_BROTLI_URL}",
      "size": ${SIZE_BR},
      "sha256": "${SHA_BR}",
      "encoding": "br"
    }
  }
}
EOF

echo "Pronto. Tamanhos:"
echo "  gzip  : ${SIZE_GZ} bytes (sha256 ${SHA_GZ})"
echo "  brotli: ${SIZE_BR} bytes (sha256 ${SHA_BR})"
echo "Saídas em ${OUT_DIR}/ (manifest.json atualizado)."


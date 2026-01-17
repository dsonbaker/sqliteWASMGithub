#!/usr/bin/env bash
set -euo pipefail

# Gera um SQLite grande (~500-700 MB) para testes.
# Ajuste ROWS e PAYLOAD_SIZE para controlar o tamanho.
#
# Uso:
#   scripts/generate-test-db.sh
#   ROWS=600000 PAYLOAD_SIZE=1024 scripts/generate-test-db.sh data/source.sqlite
#
# Requisitos: sqlite3

OUT_DB="${1:-data/source.sqlite}"
ROWS="${ROWS:-500000}"
PAYLOAD_SIZE="${PAYLOAD_SIZE:-1024}"

mkdir -p "$(dirname "${OUT_DB}")"
rm -f "${OUT_DB}"

sqlite3 "${OUT_DB}" <<SQL
PRAGMA journal_mode=OFF;
PRAGMA synchronous=OFF;
PRAGMA temp_store=MEMORY;

CREATE TABLE items(
  id INTEGER PRIMARY KEY,
  nome TEXT,
  categoria TEXT,
  valor REAL,
  payload TEXT
);

WITH RECURSIVE cnt(x) AS (
  SELECT 1
  UNION ALL
  SELECT x+1 FROM cnt WHERE x < ${ROWS}
)
INSERT INTO items(id, nome, categoria, valor, payload)
SELECT
  x,
  'item-' || x,
  CASE
    WHEN x % 3 = 0 THEN 'alpha'
    WHEN x % 3 = 1 THEN 'beta'
    ELSE 'gamma'
  END,
  (x % 1000) / 10.0,
  printf('%0*d', ${PAYLOAD_SIZE}, 0)
FROM cnt;
SQL

echo "Banco gerado em ${OUT_DB}"
echo "Rows: ${ROWS}, payload: ${PAYLOAD_SIZE} bytes por linha"


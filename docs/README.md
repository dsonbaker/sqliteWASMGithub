# Guia rápido

Este diretório é publicado no GitHub Pages. Para testar localmente:

```bash
scripts/serve.sh
# abra http://localhost:8080
```

## Manifest (`data/manifest.json`)
- Campos esperados:
  - `version`: versão do dataset (ex.: `v1`).
  - `sources.gzip|brotli`: cada item tem `url`, `size`, `sha256`, `encoding`.
- Dica: para arquivos >100 MB suba o `.sqlite.gz` em GitHub Releases e use a URL de download direto.

## Fluxo no navegador
1. Faz `fetch` do manifest.
2. Escolhe brotli (se disponível) ou gzip.
3. Tenta stream + descompressão com `DecompressionStream` gravando no OPFS.
4. Se OPFS/stream não estiver disponível, faz fallback para buffer em memória (menos eficiente).
5. Abre o banco com `sql.js` (WASM) em modo read-only.

## Cache
- Metadados ficam em `localStorage` (`sqlite.version`, `sqlite.file`, `sqlite.source`).
- O arquivo fica no OPFS (quando suportado). Botão “Limpar cache local” remove ambos.

## Atualizando o banco
1. Gere o banco e comprima com `scripts/prepare-db.sh` (usa gzip e brotli).
2. Publique os artefatos em Releases ou em `docs/data/`.
3. Atualize `docs/data/manifest.json` com URLs/sha/size.
4. Suba para o GitHub e re-deploy do Pages.


# Site estático com SQLite + WASM no GitHub Pages

Este projeto mostra como publicar um site estático no GitHub Pages que baixa um banco SQLite grande, comprime em gzip/brotli, grava no navegador (OPFS/IndexedDB) e executa consultas localmente com SQLite WASM.

## Limites relevantes do GitHub Pages
- Repositório e artefatos publicados: ~1 GB é o teto prático. Acima disso a publicação costuma falhar.
- Arquivos individuais no Git: evite >100 MB. Para bancos >500 MB, publique o `.sqlite.gz` via GitHub Releases ou outro storage estático e aponte a URL no loader.
- Builds automatizados (Pages Actions) têm janela curta (~10 min) e banda limitada. Prefira subir o arquivo já comprimido, sem etapas pesadas no CI.

## Estrutura
- `docs/`: site servível pelo Pages.
- `docs/data/`: manifest e (opcionalmente) o banco comprimido. Para arquivos grandes, use só um placeholder e referencie uma URL externa.
- `docs/js/`: loader do banco e UI.
- `docs/vendor/`: dependências de terceiros (pako). O wasm do SQLite é carregado de CDN por padrão.
- `scripts/`: utilitários para preparar o banco.

## Fluxo resumido
1) Gerar/atualizar o banco: `sqlite3 data/source.sqlite ".read migrations.sql"`, depois `scripts/prepare-db.sh`.
2) Publicar o `.sqlite.gz` (recomendado via Releases) e atualizar `docs/data/manifest.json` com `version`, `url`, `size` e `sha256`.
3) Rodar `scripts/serve.sh` para testar localmente (`http://localhost:8080`).
4) Subir para o GitHub e habilitar Pages apontando para `docs/`.

## Workflow no GitHub Actions
- O deploy do Pages gera os artefatos no CI (db comprimido + manifest).
- Por isso os arquivos gerados localmente ficam no `.gitignore`:
  `data/source.sqlite`, `docs/data/db.sqlite.*`, `docs/data/manifest.json` e `tmp/`.
- Para testes locais, gere com `scripts/generate-test-db.sh` e `scripts/prepare-db.sh`.

## Como gerar um banco de ~500 MB (sequencial)
1) Gerar o banco grande de teste:
```
scripts/generate-test-db.sh
```
Opcional (ajustar tamanho):
```
ROWS=450000 PAYLOAD_SIZE=1024 scripts/generate-test-db.sh data/source.sqlite
```
Observações:
- Execute os comandos a partir da raiz do projeto.
- O banco de origem fica em `data/source.sqlite` (fora de `docs/`).
- Os arquivos comprimidos e o `manifest.json` são gravados em `docs/data/`.

2) Compactar e gerar o manifest:
```
DB_VERSION=test-500mb \
DB_URL=./data/db.sqlite.gz \
DB_BROTLI_URL=./data/db.sqlite.br \
scripts/prepare-db.sh data/source.sqlite
```

3) Servir localmente:
```
scripts/serve.sh 8080
```
Abrir `http://localhost:8080` e executar uma query de teste:
```
SELECT id, nome, categoria, valor, length(payload) AS payload_len
FROM items
LIMIT 10;
```

## Observações
- Navegador precisa suportar WASM e, para streaming eficiente, `DecompressionStream` e OPFS. O loader possui fallback para pako + buffer em memória (menos ideal).
- Mantenha consultas paginadas/limitadas na UI para evitar estouro de memória ao ler tabelas grandes.


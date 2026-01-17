// Utilitários para baixar, descomprimir e abrir um SQLite grande no navegador
// usando sql.js (WASM). Mantém o arquivo no OPFS quando disponível.

const DEFAULT_MANIFEST_URL = "./data/manifest.json";
const DEFAULT_FILE_NAME = "db.sqlite";
const VERSION_KEY = "sqlite.version";
const FILE_KEY = "sqlite.file";
const SOURCE_KEY = "sqlite.source";
const SQLJS_BASE_CDN = "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2";

let sqlJsPromise = null;

export async function loadManifest(url = DEFAULT_MANIFEST_URL) {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Falha ao baixar manifest ${url}: ${res.status}`);
  return res.json();
}

async function ensureSqlJs(wasmUrl) {
  if (sqlJsPromise) return sqlJsPromise;

  const scriptUrl = `${SQLJS_BASE_CDN}/sql-wasm.js`;
  sqlJsPromise = new Promise((resolve, reject) => {
    const tag = document.createElement("script");
    tag.src = scriptUrl;
    tag.onload = async () => {
      try {
        const init = window.initSqlJs;
        if (!init) throw new Error("initSqlJs não encontrado");
        const SQL = await init({
          locateFile: (file) => wasmUrl ?? `${SQLJS_BASE_CDN}/${file}`,
        });
        resolve(SQL);
      } catch (err) {
        reject(err);
      }
    };
    tag.onerror = () => reject(new Error(`Erro ao carregar ${scriptUrl}`));
    document.head.appendChild(tag);
  });

  return sqlJsPromise;
}

function supportsDecompression(encoding) {
  if (typeof DecompressionStream === "undefined") return false;
  try {
    // Tentativa de instanciar para validar suporte real
    new DecompressionStream(encoding === "br" ? "br" : encoding);
    return true;
  } catch (err) {
    return false;
  }
}

async function getOpfsFileHandle(fileName, create = true) {
  if (!navigator.storage?.getDirectory) return null;
  const root = await navigator.storage.getDirectory();
  return root.getFileHandle(fileName, { create });
}

async function fileExistsInOpfs(fileName) {
  try {
    const handle = await getOpfsFileHandle(fileName, false);
    const file = await handle.getFile();
    return { exists: true, size: file.size, handle };
  } catch (err) {
    return { exists: false, size: 0, handle: null };
  }
}

function pickSource(manifest, preferBrotli = true) {
  const { sources } = manifest || {};
  if (!sources) throw new Error("Manifest sem sources");
  const brotli = sources.brotli || sources.br;
  const gzip = sources.gzip;

  if (preferBrotli && brotli && brotli.url) {
    const encoding = brotli.encoding || "br";
    if (!supportsDecompression(encoding)) {
      if (gzip && gzip.url) return { ...gzip, encoding: gzip.encoding || "gzip" };
      throw new Error("Brotli sem suporte a DecompressionStream; use gzip no manifest");
    }
    return { ...brotli, encoding };
  }
  if (gzip && gzip.url) return { ...gzip, encoding: gzip.encoding || "gzip" };
  if (brotli && brotli.url) {
    const encoding = brotli.encoding || "br";
    if (!supportsDecompression(encoding)) {
      throw new Error("Brotli sem suporte a DecompressionStream; use gzip no manifest");
    }
    return { ...brotli, encoding };
  }
  throw new Error("Nenhuma fonte válida no manifest");
}

async function streamDecompressToWritable({ response, encoding, writable, signal }) {
  let stream = response.body;
  if (!stream) throw new Error("Response sem stream");

  if (encoding) {
    if (!supportsDecompression(encoding)) {
      throw new Error(`Sem suporte a DecompressionStream para ${encoding}`);
    }
    const alg = encoding === "br" ? "br" : encoding;
    stream = stream.pipeThrough(new DecompressionStream(alg));
  }

  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (signal?.aborted) throw new Error("Download abortado");
      await writable.write(value);
    }
    await writable.close?.();
  } finally {
    reader.releaseLock();
  }
}

async function fetchToMemory({ url, encoding, signal }) {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Falha ao baixar ${url}: ${res.status}`);
  const buffer = new Uint8Array(await res.arrayBuffer());

  if (!encoding || encoding === "identity") return buffer;

  if (encoding.startsWith("gz")) {
    if (window.pako?.ungzip) return window.pako.ungzip(buffer);
    throw new Error("Gzip sem suporte a pako; use navegador com DecompressionStream");
  }

  if (encoding === "br" || encoding === "brotli") {
    throw new Error("Brotli sem suporte a DecompressionStream; use gzip no manifest");
  }

  throw new Error(`Encoding não suportado: ${encoding}`);
}

async function downloadToOpfs({ url, encoding, fileName, size, signal }) {
  const handle = await getOpfsFileHandle(fileName, true);
  if (!handle) return null;

  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Falha ao baixar ${url}: ${res.status}`);

  const writable = await handle.createWritable();
  await streamDecompressToWritable({ response: res, encoding, writable, signal });

  const file = await handle.getFile();
  if (size && file.size !== size) {
    console.warn(`Tamanho esperado ${size}, obtido ${file.size}`);
  }

  return handle;
}

async function readOpfsFile(handle) {
  const file = await handle.getFile();
  const buffer = await file.arrayBuffer();
  return new Uint8Array(buffer);
}

function persistVersion(version, fileName, source) {
  localStorage.setItem(VERSION_KEY, version);
  localStorage.setItem(FILE_KEY, fileName);
  localStorage.setItem(SOURCE_KEY, JSON.stringify(source));
}

function clearVersion() {
  localStorage.removeItem(VERSION_KEY);
  localStorage.removeItem(FILE_KEY);
  localStorage.removeItem(SOURCE_KEY);
}

export async function clearStoredDatabase(fileName = DEFAULT_FILE_NAME) {
  try {
    if (navigator.storage?.getDirectory) {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(fileName);
    }
  } catch (err) {
    console.warn("Erro ao remover do OPFS", err);
  }
  clearVersion();
}

export async function ensureDatabaseStored(manifest, options = {}) {
  const preferBrotli = options.preferBrotli ?? true;
  const fileName = options.fileName ?? DEFAULT_FILE_NAME;
  const force = options.force ?? false;
  const signal = options.signal;

  const source = pickSource(manifest, preferBrotli);
  const cachedVersion = localStorage.getItem(VERSION_KEY);
  const cachedFile = localStorage.getItem(FILE_KEY);

  if (!force && cachedVersion === manifest.version && cachedFile === fileName) {
    const { exists, handle } = await fileExistsInOpfs(fileName);
    if (exists && handle) {
      return { location: "opfs", handle, source, version: cachedVersion };
    }
  }

  let handle = null;
  try {
    handle = await downloadToOpfs({
      url: source.url,
      encoding: source.encoding,
      fileName,
      size: source.size,
      signal,
    });
  } catch (err) {
    console.warn("Falhou download streaming/OPFS, tentando fallback em memória:", err);
  }

  if (handle) {
    persistVersion(manifest.version, fileName, source);
    return { location: "opfs", handle, source, version: manifest.version };
  }

  console.warn("OPFS indisponível; caindo para buffer em memória");
  const buffer = await fetchToMemory({ url: source.url, encoding: source.encoding, signal });
  return { location: "memory", buffer, source, version: manifest.version };
}

export async function openDatabase(store, options = {}) {
  const wasmUrl = options.wasmUrl;
  const SQL = await ensureSqlJs(wasmUrl);

  if (store.location === "opfs") {
    const bytes = await readOpfsFile(store.handle);
    const db = new SQL.Database(bytes);
    return { db, SQL, location: store.location, version: store.version, source: store.source };
  }

  if (store.location === "memory") {
    const db = new SQL.Database(store.buffer);
    return { db, SQL, location: store.location, version: store.version, source: store.source };
  }

  throw new Error("Store inválido para openDatabase");
}

export async function loadDatabase(manifestUrl = DEFAULT_MANIFEST_URL, options = {}) {
  const manifest = await loadManifest(manifestUrl);
  const stored = await ensureDatabaseStored(manifest, options);
  return openDatabase(stored, options);
}


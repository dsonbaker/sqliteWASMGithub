import { loadDatabase, clearStoredDatabase } from "./sqlite-loader.js";

const state = {
  ctx: null,
};

const els = {};

function qs(id) {
  return document.getElementById(id);
}

function setStatus(message, type = "info") {
  if (!els.status) return;
  els.status.textContent = message;
  els.status.dataset.type = type;
}

function setMeta(info) {
  if (!els.meta) return;
  const parts = [];
  if (info.version) parts.push(`versão ${info.version}`);
  if (info.location) parts.push(`local: ${info.location}`);
  if (info.source?.url) parts.push(`origem: ${info.source.url}`);
  els.meta.textContent = parts.join(" | ");
}

function renderTable(columns, rows) {
  const head = els.thead;
  const body = els.tbody;
  head.innerHTML = "";
  body.innerHTML = "";

  if (!columns.length) return;

  const tr = document.createElement("tr");
  columns.forEach((c) => {
    const th = document.createElement("th");
    th.textContent = c;
    tr.appendChild(th);
  });
  head.appendChild(tr);

  rows.forEach((row) => {
    const trRow = document.createElement("tr");
    columns.forEach((c) => {
      const td = document.createElement("td");
      td.textContent = row[c];
      trRow.appendChild(td);
    });
    body.appendChild(trRow);
  });
}

function toggleBusy(isBusy) {
  els.btnFetch.disabled = isBusy;
  els.btnRun.disabled = isBusy || !state.ctx;
  els.btnClear.disabled = isBusy;
}

async function onFetch() {
  const manifestUrl = els.manifestUrl.value.trim() || "./data/manifest.json";
  const preferBrotli = els.preferBrotli.checked;
  const force = els.forceDownload.checked;
  toggleBusy(true);
  setStatus("Baixando banco (streaming)...");
  try {
    const ctx = await loadDatabase(manifestUrl, {
      preferBrotli,
      fileName: els.fileName.value.trim() || undefined,
      force,
    });
    state.ctx = ctx;
    setMeta(ctx);
    setStatus("Banco pronto. Execute uma consulta.");
    els.btnRun.disabled = false;
  } catch (err) {
    console.error(err);
    setStatus(`Erro: ${err.message}`, "error");
  } finally {
    toggleBusy(false);
  }
}

async function onRunQuery() {
  if (!state.ctx?.db) {
    setStatus("Baixe e abra o banco antes de consultar", "warn");
    return;
  }

  const query = els.query.value.trim();
  if (!query) {
    setStatus("Informe um SQL", "warn");
    return;
  }

  const limit = Number.parseInt(els.limit.value, 10) || 200;
  const t0 = performance.now();
  try {
    const stmt = state.ctx.db.prepare(query);
    const columns = stmt.getColumnNames();
    const rows = [];
    let count = 0;

    while (stmt.step()) {
      const row = stmt.getAsObject();
      rows.push(row);
      count += 1;
      if (count >= limit) break;
    }
    stmt.free();

    const elapsed = (performance.now() - t0).toFixed(1);
    renderTable(columns, rows);
    setStatus(`Ok (${rows.length} linhas, ~${elapsed} ms)`);
  } catch (err) {
    console.error(err);
    setStatus(`Erro: ${err.message}`, "error");
  }
}

async function onClearCache() {
  toggleBusy(true);
  try {
    await clearStoredDatabase(els.fileName.value.trim() || undefined);
    state.ctx = null;
    renderTable([], []);
    setMeta({});
    setStatus("Cache limpo. Baixe novamente para usar o banco.");
  } catch (err) {
    console.error(err);
    setStatus(`Erro ao limpar cache: ${err.message}`, "error");
  } finally {
    toggleBusy(false);
  }
}

function bindElements() {
  els.manifestUrl = qs("manifest-url");
  els.fileName = qs("file-name");
  els.preferBrotli = qs("prefer-brotli");
  els.forceDownload = qs("force-download");
  els.btnFetch = qs("btn-fetch");
  els.btnRun = qs("btn-run");
  els.btnClear = qs("btn-clear");
  els.query = qs("sql");
  els.limit = qs("limit");
  els.thead = qs("results-head");
  els.tbody = qs("results-body");
  els.status = qs("status");
  els.meta = qs("meta");
}

function bindEvents() {
  els.btnFetch.addEventListener("click", onFetch);
  els.btnRun.addEventListener("click", onRunQuery);
  els.btnClear.addEventListener("click", onClearCache);
  els.query.addEventListener("keydown", (ev) => {
    if (ev.ctrlKey && ev.key === "Enter") {
      ev.preventDefault();
      onRunQuery();
    }
  });
}

function main() {
  bindElements();
  bindEvents();
  setStatus("Pronto para baixar o banco.");
}

document.addEventListener("DOMContentLoaded", main);


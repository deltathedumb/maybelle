const STORAGE_KEY = "maybelle.wiki.editor.v4";
const LEGACY_STORAGE_KEY = "maybelle.wiki.editor.v3";
const AUTH_STORAGE_KEY = "maybelle.wiki.auth.v2";
const LEGACY_AUTH_STORAGE_KEY = "maybelle.wiki.auth.v1";
const ARCHIVE_STORAGE_KEY = "maybelle.wiki.archive.v1";
const DEFAULT_CHECKPOINT_BUFFER_SIZE = 5;
const CHECKPOINT_INTERVAL_MS = 5 * 60 * 1000;
const BACKEND_MODE =
  location.protocol === "http:" || location.protocol === "https:";
const BACKEND_BASE_URL = BACKEND_MODE ? location.origin : "";
let appData = createEmptyData(),
  currentView = "home",
  selectedRootId = null,
  selectedEntryId = null,
  autosaveTimer = null,
  checkpointTimer = null,
  activeTextField = null;
let wikiAuth = loadWikiAuth();
let archiveAuth = loadArchiveAuth();
const CANON_ROOTS = [
  ["А", "Existence", "Being, presence, reality"],
  ["Б", "Becoming", "Change, emergence, transformation"],
  ["В", "Motion", "Movement, travel, flow"],
  ["Г", "Space", "Place, area, distance"],
  ["Д", "Structure", "Shape, order, built form"],
  ["Е", "Knowledge", "Knowing, learning, memory"],
  ["Ё", "Perception", "Sensing, seeing, noticing"],
  ["Ж", "Person", "Person, self, human actor"],
  ["З", "Life", "Living things, vitality, growth"],
  ["И", "Relation", "Connection, withness, between"],
  ["Й", "Identity", "Sameness, name, selfhood"],
  ["К", "Object", "Thing, item, material noun"],
  ["Л", "Language", "Speech, writing, sign"],
  ["М", "Mind", "Thought, feeling, intention"],
  ["Н", "Time", "Time, day, sequence"],
  ["О", "State", "Condition, quality of being"],
  ["П", "Purpose", "Goal, use, function"],
  ["Р", "Action", "Doing, making, event"],
  ["С", "Society", "Community, culture, shared life"],
  ["Т", "Tool", "Instrument, method, technology"],
  ["У", "Energy", "Power, force, heat"],
  ["Ф", "Form", "Appearance, body, pattern"],
  ["Х", "Opposition", "Not, against, contrast"],
  ["Ц", "Quantity", "Number, amount, measure"],
  ["Ч", "Choice", "Decision, selection, possibility"],
  ["Ш", "Group", "Collection, many-as-one"],
  ["Щ", "Comparison", "Likeness, difference, degree"],
  ["Ъ", "Cause", "Reason, source, because"],
  ["Ы", "Possession", "Having, belonging, ownership"],
  ["Ь", "Property", "Attribute, trait, modifier"],
  ["Э", "Light", "Light, brightness, illumination"],
  ["Ю", "Direction", "Toward, path, orientation"],
  ["Я", "Reference", "This, that, pointing, context"],
];
const CANON_ENTRIES = [
  {
    compound: "ЖИ",
    description: "Greeting / hello",
    literal_meaning: "Person + Relation",
    notes: "Standard Maybelle greeting.",
  },
  {
    compound: "НО",
    description: "Good morning / time-state phrase",
    literal_meaning: "Time + State",
    notes: "A greeting-like phrase for a favorable time state.",
  },
  {
    compound: "НЭ",
    description: "Day / daylight time",
    literal_meaning: "Time + Light",
    notes: "Derived from Time plus Light.",
  },
  {
    compound: "НХЭ",
    description: "Night / time without light",
    literal_meaning: "Time + Opposition + Light",
    notes: "Derived from Time plus Not/Opposition plus Light.",
  },
];
function $(id) {
  return document.getElementById(id);
}
function uid(p) {
  return crypto.randomUUID
    ? `${p}-${crypto.randomUUID()}`
    : `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
function stableImportedId(prefix, item, index) {
  if (item && item.id !== undefined && String(item.id).trim() !== "")
    return String(item.id);
  const s = JSON.stringify(item || {});
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${prefix}-import-${index + 1}-${(h >>> 0).toString(36)}`;
}
function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(String(value), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
function dedupeStrings(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((v) => String(v || "").trim())
        .filter(Boolean),
    ),
  );
}
function loadWikiAuth() {
  try {
    const current = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || "{}") || {};
    if (Object.keys(current).length) return current;
    const legacy =
      JSON.parse(localStorage.getItem(LEGACY_AUTH_STORAGE_KEY) || "{}") || {};
    if (Object.keys(legacy).length) {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(legacy));
      return legacy;
    }
    return {};
  } catch {
    return {};
  }
}
function saveWikiAuth() {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(wikiAuth));
}
function loadArchiveAuth() {
  try {
    return JSON.parse(localStorage.getItem(ARCHIVE_STORAGE_KEY) || "{}") || {};
  } catch {
    return {};
  }
}
function saveArchiveAuth() {
  localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(archiveAuth));
}
function loadStoredWikiJson() {
  const current = localStorage.getItem(STORAGE_KEY);
  if (current) return current;
  const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (legacy) {
    localStorage.setItem(STORAGE_KEY, legacy);
    return legacy;
  }
  return "";
}
function syncServerInputs() {
  if ($("serverPullPasswordInput") && document.activeElement !== $("serverPullPasswordInput"))
    $("serverPullPasswordInput").value = wikiAuth.readPass || "";
  if ($("serverPushPasswordInput") && document.activeElement !== $("serverPushPasswordInput"))
    $("serverPushPasswordInput").value = wikiAuth.writePass || "";
  if ($("serverAdminPasswordInput") && document.activeElement !== $("serverAdminPasswordInput"))
    $("serverAdminPasswordInput").value = wikiAuth.adminPass || "";
}
function syncArchivePasswordInput() {
  if ($("archivePasswordInput") && document.activeElement !== $("archivePasswordInput"))
    $("archivePasswordInput").value = archiveAuth.password || "";
}
function wikiAuthHeaders(mode) {
  const headers = {};
  if (mode === "read") {
    if (wikiAuth.readPass) headers["X-Maybelle-Read-Pass"] = wikiAuth.readPass;
  } else if (mode === "write") {
    const pass = wikiAuth.writePass || wikiAuth.readPass;
    if (pass) headers["X-Maybelle-Write-Pass"] = pass;
  }
  return headers;
}
async function promptForWikiPass(mode) {
  const label = mode === "read" ? "read" : "write";
  const current =
    mode === "read"
      ? wikiAuth.readPass || ""
      : wikiAuth.writePass || wikiAuth.readPass || "";
  const pass =
    prompt(`Wiki ${label} password (leave blank to cancel):`, current) || "";
  if (!pass) return "";
  if (mode === "read") {
    wikiAuth.readPass = pass;
    if (!wikiAuth.writePass) wikiAuth.writePass = pass;
  } else {
    wikiAuth.writePass = pass;
  }
  saveWikiAuth();
  return pass;
}
async function backendRequest(path, options = {}, mode = "read", retry = true) {
  const r = await fetch(`${BACKEND_BASE_URL}${path}`, {
    cache: "no-store",
    ...options,
    headers: {
      ...(options.headers || {}),
      ...wikiAuthHeaders(mode),
    },
  });
  const d = await r.json().catch(() => ({}));
  const authError =
    typeof d.error === "string" && d.error.startsWith("Wiki ");
  if ((r.status === 401 || r.status === 403) && BACKEND_MODE && retry && authError) {
    const pass = await promptForWikiPass(mode);
    if (pass) return backendRequest(path, options, mode, false);
  }
  if (!r.ok || d.ok === false)
    throw new Error(d.error || `Backend returned HTTP ${r.status}`);
  return d;
}
function normalizeRootRecord(r, i) {
  return {
    id: stableImportedId("root", r, i),
    glyph: String(r?.glyph || ""),
    root_name: String(r?.root_name || r?.rootName || ""),
    description: String(r?.description || ""),
    notes: String(r?.notes || ""),
    canon: Boolean(r?.canon),
  };
}
function normalizeEntryRecord(e, i) {
  return {
    id: stableImportedId("entry", e, i),
    compound: String(e?.compound || e?.word || ""),
    description: String(e?.description || e?.meaning || ""),
    literal_meaning: String(e?.literal_meaning || e?.literalMeaning || ""),
    notes: String(e?.notes || ""),
    fields:
      e?.fields && typeof e.fields === "object" && !Array.isArray(e.fields)
        ? e.fields
        : {},
    canon: Boolean(e?.canon),
  };
}
function normalizeCheckpointRecord(cp, i) {
  const source = cp && typeof cp === "object" ? cp : {};
  const snapshot =
    source.snapshot && typeof source.snapshot === "object"
      ? source.snapshot
      : source;
  const normalizedSnapshot = repairDuplicateIdsInData({
    schema_version: 4,
    updated_at: String(snapshot.updated_at || snapshot.updatedAt || now()),
    roots: Array.isArray(snapshot.roots)
      ? snapshot.roots.map((r, n) => normalizeRootRecord(r, n))
      : [],
    dictionary: Array.isArray(snapshot.dictionary)
      ? snapshot.dictionary.map((e, n) => normalizeEntryRecord(e, n))
      : [],
    grammar_notes: String(
      snapshot.grammar_notes || snapshot.grammarNotes || "",
    ),
    frozen_root_ids: dedupeStrings(
      snapshot.frozen_root_ids || snapshot.frozenRootIds || [],
    ),
    checkpoint_buffer_size: clampInt(
      snapshot.checkpoint_buffer_size || snapshot.checkpointBufferSize,
      1,
      50,
      DEFAULT_CHECKPOINT_BUFFER_SIZE,
    ),
    next_checkpoint_at:
      snapshot.next_checkpoint_at || snapshot.nextCheckpointAt || null,
    checkpoints: [],
  });
  return {
    id: stableImportedId("checkpoint", source, i),
    created_at: String(
      source.created_at ||
        source.createdAt ||
        snapshot.created_at ||
        snapshot.createdAt ||
        now(),
    ),
    label: String(source.label || snapshot.label || ""),
    summary: String(source.summary || snapshot.summary || ""),
    snapshot: normalizedSnapshot,
  };
}
function repairDuplicateIdsInData(data) {
  const sr = new Set();
  data.roots.forEach((r, i) => {
    if (!r.id || sr.has(r.id))
      r.id = stableImportedId("root", { ...r, id: "", _repair: i }, i);
    sr.add(r.id);
  });
  const se = new Set();
  data.dictionary.forEach((e, i) => {
    if (!e.id || se.has(e.id))
      e.id = stableImportedId("entry", { ...e, id: "", _repair: i }, i);
    se.add(e.id);
  });
  if (!Array.isArray(data.checkpoints)) data.checkpoints = [];
  data.checkpoints = data.checkpoints.map((cp, i) => normalizeCheckpointRecord(cp, i));
  return data;
}
function repairDuplicateIds() {
  appData = repairDuplicateIdsInData(appData);
}
function createEmptyData() {
  return {
    schema_version: 4,
    updated_at: new Date().toISOString(),
    roots: [],
    dictionary: [],
    grammar_notes: "",
    frozen_root_ids: [],
    checkpoint_buffer_size: DEFAULT_CHECKPOINT_BUFFER_SIZE,
    next_checkpoint_at: new Date(Date.now() + CHECKPOINT_INTERVAL_MS).toISOString(),
    checkpoints: [],
  };
}
function normalizeImportedData(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("Wiki archive root must be an object");
  const roots = Array.isArray(raw.roots) ? raw.roots : [],
    dict = Array.isArray(raw.dictionary)
      ? raw.dictionary
      : Array.isArray(raw.entries)
        ? raw.entries
        : [],
    checkpoints = Array.isArray(raw.checkpoints) ? raw.checkpoints : [];
  const data = {
    schema_version: 4,
    imported_from_schema_version: Number(
      raw.schema_version || raw.schemaVersion || 1,
    ),
    updated_at: raw.updated_at || raw.updatedAt || new Date().toISOString(),
    roots: roots.map((r, i) => normalizeRootRecord(r, i)),
    dictionary: dict.map((e, i) => normalizeEntryRecord(e, i)),
    grammar_notes: String(raw.grammar_notes || raw.grammarNotes || ""),
    frozen_root_ids: dedupeStrings(
      raw.frozen_root_ids || raw.frozenRootIds || [],
    ),
    checkpoint_buffer_size: clampInt(
      raw.checkpoint_buffer_size || raw.checkpointBufferSize,
      1,
      50,
      DEFAULT_CHECKPOINT_BUFFER_SIZE,
    ),
    next_checkpoint_at: raw.next_checkpoint_at || raw.nextCheckpointAt || null,
    checkpoints: checkpoints.map((cp, i) => normalizeCheckpointRecord(cp, i)),
  };
  sortDictionary(data);
  return repairDuplicateIdsInData(data);
}
function sortDictionary(data = appData) {
  data.dictionary.sort((a, b) =>
    `${a.description || ""}\0${a.compound || ""}`
      .toLowerCase()
      .localeCompare(
        `${b.description || ""}\0${b.compound || ""}`.toLowerCase(),
      ),
  );
}
function setStatus(msg, type = "") {
  const s = $("status");
  s.className = "status" + (type ? " " + type : "");
  s.textContent = msg;
}
function escapeHtml(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function isBackendMode() {
  return BACKEND_MODE;
}
function setBackendBanner() {
  const b = $("backendModeBanner");
  if (BACKEND_MODE) {
    b.className = "status success";
    b.textContent =
      "Server mode: this wiki loads/saves through the Maybelle Python backend.";
  } else {
    b.className = "status warning";
    b.textContent =
      "Standalone mode: this wiki saves to this browser only. Open through the Python host for server saving.";
  }
}
async function loadFromBackend() {
  return normalizeImportedData(await backendRequest("/api/wiki", {}, "read"));
}
async function saveToBackend(show = true) {
  syncEditorsToData();
  const d = await backendRequest(
    "/api/wiki",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(appData),
    },
    "write",
  );
  if (show)
    setStatus(
      `Saved wiki to server file (${d.path || "wiki file"}).`,
      "success",
    );
  return d;
}
function autosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(async () => {
    try {
      syncEditorsToData();
      if (BACKEND_MODE) {
        await saveToBackend(false);
        setStatus("Maybelle wiki autosaved to server file.", "success");
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
        setStatus("Maybelle wiki autosaved locally.", "success");
      }
      updateAllViewsSoft();
    } catch (e) {
      console.error(e);
      setStatus(`Autosave failed: ${e.message || "unknown error"}`, "error");
    }
  }, 650);
}
async function saveLocal() {
  try {
    syncEditorsToData();
    if (BACKEND_MODE) await saveToBackend(true);
    else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
      setStatus("Maybelle wiki saved locally.", "success");
    }
    updateAllViewsSoft();
  } catch (e) {
    console.error(e);
    setStatus(`Save failed: ${e.message || "unknown error"}`, "error");
  }
}
async function loadLocal() {
  try {
    const stored = loadStoredWikiJson();
    appData = BACKEND_MODE
      ? await loadFromBackend()
      : normalizeImportedData(JSON.parse(stored || "{}"));
    repairDuplicateIds();
    preserveSelections();
    renderEverything();
    setStatus(
      BACKEND_MODE ? "Loaded wiki from server file." : "Loaded local wiki.",
      "success",
    );
  } catch (e) {
    console.error(e);
    setStatus(`Could not load wiki: ${e.message || "unknown error"}`, "error");
  }
}
function syncEditorsToData() {
  appData.updated_at = new Date().toISOString();
  appData.schema_version = 4;
  let r = appData.roots.find((x) => x.id === selectedRootId);
  if (r && !$("rootEditorFields").classList.contains("hidden")) {
    r.glyph = $("rootGlyphInput").value.trim();
    r.root_name = $("rootNameInput").value.trim();
    r.description = $("rootDescriptionInput").value.trim();
    r.notes = $("rootNotesInput").value.trim();
  }
  let e = appData.dictionary.find((x) => x.id === selectedEntryId);
  if (e && !$("entryEditorFields").classList.contains("hidden")) {
    e.compound = $("entryCompoundInput").value.trim();
    e.description = $("entryDescriptionInput").value.trim();
    e.literal_meaning = $("entryLiteralInput").value.trim();
    e.notes = $("entryNotesInput").value.trim();
    e.fields = collectExtraFields();
  }
  appData.grammar_notes = $("grammarNotesInput").value;
  if ($("checkpointBufferSizeInput")) {
    appData.checkpoint_buffer_size = clampInt(
      $("checkpointBufferSizeInput").value,
      1,
      50,
      DEFAULT_CHECKPOINT_BUFFER_SIZE,
    );
  } else {
    appData.checkpoint_buffer_size = clampInt(
      appData.checkpoint_buffer_size,
      1,
      50,
      DEFAULT_CHECKPOINT_BUFFER_SIZE,
    );
  }
  appData.frozen_root_ids = dedupeStrings(appData.frozen_root_ids || []);
  sortDictionary();
}
function collectExtraFields() {
  const f = {};
  document.querySelectorAll("#entryExtraFields .field-row").forEach((row) => {
    const k = row.querySelector(".fieldKey").value.trim(),
      v = row.querySelector(".fieldValue").value.trim();
    if (k) f[k] = v;
  });
  return f;
}
function preserveSelections() {
  if (!appData.roots.some((r) => r.id === selectedRootId))
    selectedRootId = appData.roots[0]?.id || null;
  if (!appData.dictionary.some((e) => e.id === selectedEntryId))
    selectedEntryId = appData.dictionary[0]?.id || null;
}
function updateAllViewsSoft() {
  renderSidebarQuickLists();
  renderStats();
  renderRootTablePreview();
  if (currentView === "archive") renderArchiveView();
  if (currentView === "server") renderServerView();
  if (currentView === "roots") renderRootList();
  if (currentView === "dictionary") renderEntryList();
}
function renderEverything() {
  sortDictionary();
  renderSidebarQuickLists();
  renderStats();
  renderRootTablePreview();
  renderRootList();
  renderEntryList();
  renderRootEditor();
  renderEntryEditor();
  $("grammarNotesInput").value = appData.grammar_notes || "";
  renderArchiveView();
  renderServerView();
  switchView(currentView, false);
}
function switchView(view, sync = true) {
  const target = $(`${view}View`);
  if (!target) return;
  if (sync) syncEditorsToData();
  currentView = view;
  document.querySelectorAll(".view").forEach((x) => x.classList.add("hidden"));
  target.classList.remove("hidden");
  document
    .querySelectorAll(".nav-button")
    .forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  const t = {
    home: ["Main Page", "A fluid local wiki for Maybelle."],
    roots: ["Root Glyphs", "Edit immutable and added root glyph meanings."],
    dictionary: ["Dictionary", "Create and expand Maybelle words."],
    grammar: [
      "Grammar Notes",
      "Track sentence rules, punctuation, accents, and usage.",
    ],
    threads: [
      "Threads",
      "Persistent named discussions through the Python host.",
    ],
    server: ["Server", "Store pull, push, and admin passwords."],
    archive: ["Archive", "Encrypt exports and manage checkpoints."],
  };
  $("viewTitle").textContent = t[view][0];
  $("viewSubtitle").textContent = t[view][1];
  if (view === "roots") {
    renderRootList();
    renderRootEditor();
  }
  if (view === "dictionary") {
    renderEntryList();
    renderEntryEditor();
  }
  if (view === "archive") renderArchiveView();
  if (view === "server") renderServerView();
  if (view === "threads" && window.refreshThreadsStatus)
    window.refreshThreadsStatus();
}
function renderStats() {
  $("rootCount").textContent = appData.roots.length;
  $("entryCount").textContent = appData.dictionary.length;
  $("fieldCount").textContent = appData.dictionary.reduce(
    (n, e) => n + Object.keys(e.fields || {}).length,
    0,
  );
}
function renderSidebarQuickLists() {
  const qr = $("quickRoots"),
    qe = $("quickEntries");
  qr.innerHTML = "";
  qe.innerHTML = "";
  appData.roots
    .slice(-8)
    .reverse()
    .forEach((r) => {
      const b = document.createElement("button");
      b.className = "quick-link";
      b.innerHTML = `<span class="quick-glyph">${escapeHtml(r.glyph || "·")}</span><span class="quick-name">${escapeHtml(r.root_name || "Unnamed root")}</span>`;
      b.onclick = () => {
        selectedRootId = r.id;
        switchView("roots");
      };
      qr.appendChild(b);
    });
  if (!appData.roots.length)
    qr.innerHTML = '<div class="muted">No roots yet.</div>';
  appData.dictionary.slice(0, 8).forEach((e) => {
    const b = document.createElement("button");
    b.className = "quick-link";
    b.innerHTML = `<span class="quick-glyph">${escapeHtml(e.compound || "·")}</span><span class="quick-name">${escapeHtml(e.description || "Unnamed word")}</span>`;
    b.onclick = () => {
      selectedEntryId = e.id;
      switchView("dictionary");
    };
    qe.appendChild(b);
  });
  if (!appData.dictionary.length)
    qe.innerHTML = '<div class="muted">No words yet.</div>';
}
function renderRootTablePreview() {
  const tb = $("rootTablePreview");
  tb.innerHTML = "";
  if (!appData.roots.length) {
    tb.innerHTML =
      '<tr><td colspan="3" class="muted">No root glyphs have been added yet.</td></tr>';
    return;
  }
  appData.roots.forEach((r) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td style="font-size:22px;text-align:center">${escapeHtml(r.glyph)}${r.canon ? '<span class="canon-pill">canon</span>' : ""}</td><td>${escapeHtml(r.root_name)}</td><td>${escapeHtml(r.description)}</td>`;
    tb.appendChild(tr);
  });
}
function renderRootList() {
  const list = $("rootList"),
    q = $("rootSearch").value.trim().toLowerCase();
  list.innerHTML = "";
  const roots = appData.roots.filter((r) =>
    [r.glyph, r.root_name, r.description, r.notes]
      .join(" ")
      .toLowerCase()
      .includes(q),
  );
  if (!roots.length) {
    list.innerHTML = '<div class="empty-state">No matching roots.</div>';
    return;
  }
  roots.forEach((r) => {
    const b = document.createElement("button");
    b.className = "list-row" + (r.id === selectedRootId ? " active" : "");
    b.innerHTML = `<span class="list-glyph">${escapeHtml(r.glyph || "·")}</span><span><span class="list-title">${escapeHtml(r.root_name || "Unnamed root")}</span><span class="list-subtitle">${escapeHtml(r.description || "No description")}</span></span>`;
    b.onclick = () => {
      syncEditorsToData();
      selectedRootId = r.id;
      renderRootList();
      renderRootEditor();
    };
    list.appendChild(b);
  });
}
function renderEntryList() {
  sortDictionary();
  const list = $("entryList"),
    q = $("entrySearch").value.trim().toLowerCase();
  list.innerHTML = "";
  const entries = appData.dictionary.filter((e) =>
    [
      e.compound,
      e.description,
      e.literal_meaning,
      e.notes,
      JSON.stringify(e.fields || {}),
    ]
      .join(" ")
      .toLowerCase()
      .includes(q),
  );
  if (!entries.length) {
    list.innerHTML = '<div class="empty-state">No matching words.</div>';
    return;
  }
  entries.forEach((e) => {
    const b = document.createElement("button");
    b.className = "list-row" + (e.id === selectedEntryId ? " active" : "");
    b.innerHTML = `<span class="list-glyph">${escapeHtml(e.compound || "·")}</span><span><span class="list-title">${escapeHtml(e.description || "Unnamed word")}</span><span class="list-subtitle">${escapeHtml(e.literal_meaning || "No details")}</span></span>`;
    b.onclick = () => {
      syncEditorsToData();
      selectedEntryId = e.id;
      renderEntryList();
      renderEntryEditor();
    };
    list.appendChild(b);
  });
}
function renderRootEditor() {
  const r = appData.roots.find((x) => x.id === selectedRootId);
  if (!r) {
    $("rootEmptyState").classList.remove("hidden");
    $("rootEditorFields").classList.add("hidden");
    $("rootEditorTitle").textContent = "Root Editor";
    ["rootGlyphInput", "rootNameInput", "rootDescriptionInput"].forEach(
      (id) => ($(id).disabled = false),
    );
    $("deleteRootButton").disabled = false;
    $("rootCanonNotice").classList.add("hidden");
    return;
  }
  const locked = r.canon && !$("unlockCanonRoots")?.checked;
  const frozen = isRootFrozen(r.id);
  $("rootEmptyState").classList.add("hidden");
  $("rootEditorFields").classList.remove("hidden");
  $("rootEditorTitle").textContent =
    (r.glyph || r.root_name || "Root Editor") + (r.canon ? " · canon" : "");
  $("rootGlyphInput").value = r.glyph || "";
  $("rootNameInput").value = r.root_name || "";
  $("rootDescriptionInput").value = r.description || "";
  $("rootNotesInput").value = r.notes || "";
  ["rootGlyphInput", "rootNameInput", "rootDescriptionInput"].forEach(
    (id) => ($(id).disabled = locked),
  );
  $("deleteRootButton").disabled = locked || frozen;
  $("rootCanonNotice").classList.toggle("hidden", !r.canon);
  $("rootCanonNotice").textContent = frozen
    ? "Frozen root: it cannot be deleted, but it can still be edited."
    : locked
      ? "Canon root: locked to preserve the stable Maybelle root table. Use Unlock canon root editing to change it."
      : "Canon root editing is unlocked.";
}
function rootBreakdown(compound) {
  return Array.from(compound || "")
    .filter((c) => c.trim())
    .map((c) => {
      const r = appData.roots.find((x) => x.glyph === c);
      return r
        ? `<div><b>${escapeHtml(c)}</b> — ${escapeHtml(r.root_name)}: ${escapeHtml(r.description)}</div>`
        : `<div><b>${escapeHtml(c)}</b> — <span class="muted">unknown root</span></div>`;
    })
    .join("");
}
function renderEntryEditor() {
  const e = appData.dictionary.find((x) => x.id === selectedEntryId);
  if (!e) {
    $("entryEmptyState").classList.remove("hidden");
    $("entryEditorFields").classList.add("hidden");
    $("entryEditorTitle").textContent = "Word Editor";
    $("entryBreakdown").querySelector(".box-body").innerHTML =
      '<span class="muted">No compound glyphs to analyze.</span>';
    $("entryValidation").querySelector(".box-body").innerHTML =
      '<span class="muted">Select a word to validate.</span>';
    $("builderRoots").innerHTML =
      '<span class="muted">Select a word to build a compound.</span>';
    return;
  }
  $("entryEmptyState").classList.add("hidden");
  $("entryEditorFields").classList.remove("hidden");
  $("entryEditorTitle").textContent =
    e.compound || e.description || "Word Editor";
  $("entryCompoundInput").value = e.compound || "";
  $("entryDescriptionInput").value = e.description || "";
  $("entryLiteralInput").value = e.literal_meaning || "";
  $("entryNotesInput").value = e.notes || "";
  $("entryExtraFields").innerHTML = "";
  Object.entries(e.fields || {}).forEach(([k, v]) => addExtraFieldRow(k, v));
  $("entryBreakdown").querySelector(".box-body").innerHTML =
    rootBreakdown(e.compound) ||
    '<span class="muted">No compound glyphs to analyze.</span>';
  renderEntryValidation(e);
  renderCompoundBuilder();
}
function cloneJson(v) {
  return JSON.parse(JSON.stringify(v));
}
function isRootFrozen(rootId) {
  return appData.frozen_root_ids.includes(rootId);
}
function renderArchiveRootsDisplay() {
  const host = $("archiveRootsDisplay");
  if (!host) return;
  if (!appData.roots.length) {
    host.innerHTML = '<span class="muted">No roots yet.</span>';
    return;
  }
  host.innerHTML = appData.roots
    .map(
      (r) =>
        `<span class="archive-root-chip" title="${escapeHtml(r.root_name || "")}">${escapeHtml(r.glyph || "·")}</span>`,
    )
    .join("");
}
function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0)
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
function nextCheckpointDate() {
  if (appData.next_checkpoint_at) {
    const next = new Date(appData.next_checkpoint_at);
    if (!Number.isNaN(next.getTime())) return next;
  }
  const fallback = new Date(Date.now() + CHECKPOINT_INTERVAL_MS);
  appData.next_checkpoint_at = fallback.toISOString();
  return fallback;
}
function setNextCheckpoint() {
  appData.next_checkpoint_at = new Date(
    Date.now() + CHECKPOINT_INTERVAL_MS,
  ).toISOString();
}
function trimCheckpointBuffer() {
  appData.checkpoint_buffer_size = clampInt(
    appData.checkpoint_buffer_size,
    1,
    50,
    DEFAULT_CHECKPOINT_BUFFER_SIZE,
  );
  if (
    Array.isArray(appData.checkpoints) &&
    appData.checkpoints.length > appData.checkpoint_buffer_size
  ) {
    appData.checkpoints = appData.checkpoints.slice(
      -appData.checkpoint_buffer_size,
    );
  }
}
function currentArchiveSnapshot() {
  return {
    roots: cloneJson(appData.roots || []),
    dictionary: cloneJson(appData.dictionary || []),
    grammar_notes: appData.grammar_notes || "",
    frozen_root_ids: cloneJson(appData.frozen_root_ids || []),
  };
}
function renderCheckpointList() {
  const host = $("checkpointList");
  if (!host) return;
  const checkpoints = Array.isArray(appData.checkpoints)
    ? [...appData.checkpoints].reverse()
    : [];
  if (!checkpoints.length) {
    host.innerHTML = '<div class="checkpoint-empty">No checkpoints yet.</div>';
    return;
  }
  host.innerHTML = checkpoints
    .map((cp) => {
      const snapshot = cp.snapshot || {};
      const summary =
        cp.summary ||
        `${(snapshot.roots || []).length} roots, ${(snapshot.dictionary || []).length} words`;
      return `<div class="checkpoint-row"><div><b>${escapeHtml(cp.created_at || "")}</b><small>${escapeHtml(summary)}</small></div><button data-checkpoint-id="${escapeHtml(cp.id)}">Revert</button></div>`;
    })
    .join("");
  host.querySelectorAll("[data-checkpoint-id]").forEach(
    (b) =>
      (b.onclick = () =>
        revertToCheckpoint(b.dataset.checkpointId).catch((e) =>
          setStatus(e.message || "Could not revert checkpoint.", "error"),
        )),
  );
}
function renderArchiveView() {
  if (!$("archiveView")) return;
  syncArchivePasswordInput();
  const bufferInput = $("checkpointBufferSizeInput");
  if (bufferInput && document.activeElement !== bufferInput)
    bufferInput.value = String(
      clampInt(
        appData.checkpoint_buffer_size,
        1,
        50,
        DEFAULT_CHECKPOINT_BUFFER_SIZE,
      ),
    );
  renderArchiveRootsDisplay();
  renderCheckpointList();
  const countdown = $("checkpointCountdown");
  if (countdown)
    countdown.textContent = formatDuration(
      nextCheckpointDate().getTime() - Date.now(),
    );
}
function renderServerView() {
  if (!$("serverView")) return;
  syncServerInputs();
}
function tickCheckpointTimer() {
  if (!$("checkpointCountdown")) return;
  const remaining = nextCheckpointDate().getTime() - Date.now();
  if (remaining <= 0) {
    makeCheckpoint(true).catch((e) =>
      setStatus(e.message || "Could not create checkpoint.", "error"),
    );
    return;
  }
  $("checkpointCountdown").textContent = formatDuration(remaining);
}
function startCheckpointTimer() {
  clearInterval(checkpointTimer);
  checkpointTimer = setInterval(() => {
    if (currentView === "archive") renderArchiveView();
    tickCheckpointTimer();
  }, 1000);
  tickCheckpointTimer();
}
async function makeCheckpoint(auto = false) {
  syncEditorsToData();
  trimCheckpointBuffer();
  const snapshot = currentArchiveSnapshot();
  const lastCheckpoint = appData.checkpoints?.[appData.checkpoints.length - 1];
  const fingerprint = JSON.stringify(snapshot);
  if (auto && lastCheckpoint && JSON.stringify(lastCheckpoint.snapshot || {}) === fingerprint) {
    setNextCheckpoint();
    if (BACKEND_MODE) await saveToBackend(false);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
    renderArchiveView();
    updateAllViewsSoft();
    return;
  }
  const checkpoint = {
    id: uid("checkpoint"),
    created_at: new Date().toISOString(),
    summary: `${snapshot.roots.length} roots, ${snapshot.dictionary.length} words`,
    snapshot,
  };
  appData.checkpoints = [...(appData.checkpoints || []), checkpoint];
  trimCheckpointBuffer();
  setNextCheckpoint();
  if (BACKEND_MODE) await saveToBackend(false);
  else localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
  renderArchiveView();
  updateAllViewsSoft();
  if (!auto)
    setStatus(
      "Checkpoint created.",
      "success",
    );
}
async function revertToCheckpoint(checkpointId) {
  const checkpoint = appData.checkpoints.find((cp) => cp.id === checkpointId);
  if (!checkpoint) throw new Error("Checkpoint not found");
  if (
    !(await showConfirm({
      title: "Revert Checkpoint",
      message: `Revert to checkpoint from ${checkpoint.created_at || "unknown time"}?`,
      confirmText: "Revert",
      danger: true,
    }))
  )
    return;
  const snapshot = checkpoint.snapshot || {};
  appData.roots = cloneJson(snapshot.roots || []);
  appData.dictionary = cloneJson(snapshot.dictionary || []);
  appData.grammar_notes = snapshot.grammar_notes || "";
  appData.frozen_root_ids = cloneJson(snapshot.frozen_root_ids || []);
  appData.updated_at = new Date().toISOString();
  setNextCheckpoint();
  trimCheckpointBuffer();
  repairDuplicateIds();
  preserveSelections();
  if (BACKEND_MODE) await saveToBackend(false);
  else localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
  renderEverything();
  setStatus("Reverted to checkpoint.", "success");
}
function addRoot() {
  syncEditorsToData();
  const r = {
    id: uid("root"),
    glyph: "",
    root_name: "",
    description: "",
    notes: "",
  };
  appData.roots.push(r);
  selectedRootId = r.id;
  switchView("roots", false);
  autosave();
}
function addEntry() {
  syncEditorsToData();
  const e = {
    id: uid("entry"),
    compound: "",
    description: "",
    literal_meaning: "",
    notes: "",
    fields: {},
  };
  appData.dictionary.push(e);
  selectedEntryId = e.id;
  switchView("dictionary", false);
  renderEntryList();
  renderEntryEditor();
  autosave();
}
async function deleteSelectedRoot() {
  if (!selectedRootId) return;
  const r = appData.roots.find((x) => x.id === selectedRootId);
  if (!r) return;
  if (isRootFrozen(r.id)) {
    setStatus("Frozen roots cannot be deleted.", "warning");
    return;
  }
  if (r.canon && !$("unlockCanonRoots")?.checked) {
    setStatus(
      "Canon roots are locked. Unlock canon root editing first.",
      "warning",
    );
    return;
  }
  if (
    !(await showConfirm({
      title: "Delete Root",
      message: `Delete root "${r.glyph || r.root_name || "unnamed"}"?`,
      confirmText: "Delete",
      danger: true,
    }))
  )
    return;
  appData.roots = appData.roots.filter((x) => x.id !== selectedRootId);
  selectedRootId = appData.roots[0]?.id || null;
  renderEverything();
  autosave();
}
async function deleteSelectedEntry() {
  if (!selectedEntryId) return;
  const e = appData.dictionary.find((x) => x.id === selectedEntryId);
  if (!e) return;
  if (
    !(await showConfirm({
      title: "Delete Word",
      message: `Delete word "${e.compound || e.description || "unnamed"}"?`,
      confirmText: "Delete",
      danger: true,
    }))
  )
    return;
  appData.dictionary = appData.dictionary.filter(
    (x) => x.id !== selectedEntryId,
  );
  selectedEntryId = appData.dictionary[0]?.id || null;
  renderEverything();
  autosave();
}
function addExtraFieldRow(k = "", v = "") {
  const row = document.createElement("div");
  row.className = "field-row";
  row.innerHTML =
    '<input class="fieldKey" placeholder="Field name"><input class="fieldValue" placeholder="Field value"><button class="deleteFieldButton danger small">Delete</button>';
  row.querySelector(".fieldKey").value = k;
  row.querySelector(".fieldValue").value = v;
  row.querySelector(".deleteFieldButton").onclick = () => {
    row.remove();
    autosave();
  };
  row.addEventListener("input", autosave);
  $("entryExtraFields").appendChild(row);
}
function renderJsonPreview() {}
function archivePasswordValue() {
  return String($("archivePasswordInput")?.value || "");
}
function persistArchivePassword() {
  archiveAuth.password = $("archivePasswordInput")?.value || "";
  saveArchiveAuth();
}
function bytesToBase64(bytes) {
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
}
function base64ToBytes(text) {
  const raw = atob(text);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}
async function deriveArchiveKey(password, salt, mode) {
  if (!crypto?.subtle) throw new Error("Archive encryption is unavailable.");
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 210000,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    [mode],
  );
}
async function encryptArchiveText(text, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveArchiveKey(password, salt, "encrypt");
  const payload = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(text),
  );
  return {
    format: "maybelle-encrypted-archive",
    version: 1,
    iterations: 210000,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(payload)),
  };
}
async function decryptArchiveText(payload, password) {
  if (!payload || typeof payload !== "object")
    throw new Error("Archive file is not valid.");
  if (payload.format !== "maybelle-encrypted-archive")
    return JSON.stringify(payload);
  if (!password) throw new Error("Archive password is required.");
  const salt = base64ToBytes(payload.salt || "");
  const iv = base64ToBytes(payload.iv || "");
  const ciphertext = base64ToBytes(payload.ciphertext || "");
  const key = await deriveArchiveKey(password, salt, "decrypt");
  const text = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext,
  );
  return new TextDecoder().decode(text);
}
async function saveArchiveFile() {
  syncEditorsToData();
  const password = archivePasswordValue();
  persistArchivePassword();
  const payload = JSON.stringify(appData, null, 2);
  if (password) {
    const encrypted = await encryptArchiveText(payload, password);
    downloadText(
      "maybelle_wiki_archive.encrypted.json",
      JSON.stringify(encrypted, null, 2),
    );
    setStatus("Encrypted archive saved.", "success");
    return;
  }
  downloadText("maybelle_wiki_archive.json", payload);
  setStatus("Archive saved without encryption.", "warning");
}
async function loadArchiveFile(file) {
  const text = await file.text();
  const parsed = JSON.parse(text);
  const password = archivePasswordValue();
  try {
    const restored = await decryptArchiveText(parsed, password);
    appData = normalizeImportedData(JSON.parse(restored));
    repairDuplicateIds();
    preserveSelections();
    if (BACKEND_MODE) await saveToBackend(false);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
    renderEverything();
    setStatus(
      parsed.format === "maybelle-encrypted-archive"
        ? "Encrypted archive loaded."
        : "Archive loaded.",
      "success",
    );
  } catch (e) {
    if (parsed.format === "maybelle-encrypted-archive") {
      throw new Error("Archive password is incorrect or the file is corrupted.");
    }
    throw e;
  }
}
async function openArchiveFilePicker() {
  const input = $("archiveFileInput");
  if (!input) return;
  input.value = "";
  input.click();
}
function saveServerPasswords() {
  wikiAuth.readPass = $("serverPullPasswordInput")?.value || "";
  wikiAuth.writePass = $("serverPushPasswordInput")?.value || "";
  wikiAuth.adminPass = $("serverAdminPasswordInput")?.value || "";
  if (wikiAuth.readPass && !wikiAuth.writePass) wikiAuth.writePass = wikiAuth.readPass;
  saveWikiAuth();
  syncServerInputs();
}
async function enterServerPassword() {
  saveServerPasswords();
  setStatus("Server passwords saved.", "success");
}
async function pullFromServer() {
  saveServerPasswords();
  await loadLocal();
}
async function pushToServer() {
  saveServerPasswords();
  await saveLocal();
}
function currentAdminPass() {
  return wikiAuth.adminPass || prompt("Admin password (leave blank if disabled):") || "";
}
async function emptyWiki() {
  if (
    !(await showConfirm({
      title: "Empty Maybelle Wiki",
      message: "Empty the Maybelle wiki?",
      confirmText: "Empty Wiki",
      danger: true,
    }))
  )
    return;
  appData = createEmptyData();
  selectedRootId = null;
  selectedEntryId = null;
  if (BACKEND_MODE) await saveToBackend(false);
  else localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
  renderEverything();
  setStatus("Maybelle wiki emptied.", "success");
}
function downloadText(fn, text) {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fn;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
function showConfirm(o = {}) {
  const m = $("confirmModal"),
    title = $("confirmModalTitle"),
    msg = $("confirmModalMessage"),
    ok = $("confirmOkButton"),
    cancel = $("confirmCancelButton");
  title.textContent = o.title || "Confirm";
  msg.textContent = o.message || "Are you sure?";
  ok.textContent = o.confirmText || "Confirm";
  ok.classList.toggle("danger", o.danger !== false);
  m.classList.add("open");
  return new Promise((res) => {
    function close(v) {
      m.classList.remove("open");
      ok.onclick = cancel.onclick = null;
      res(v);
    }
    ok.onclick = () => close(true);
    cancel.onclick = () => close(false);
    m.onclick = (e) => {
      if (e.target === m) close(false);
    };
  });
}
function buildKeyboard() {
  const rows = ["АБВГДЕЁЖЗИЙ", "КЛМНОПРСТУФ", "ХЦЧШЩЪЫЬЭЮЯ"];
  $("keyboardRows").innerHTML =
    rows
      .map(
        (r) =>
          `<div class="keyboard-row">${Array.from(r)
            .map(
              (c) => `<button class="key-button" data-key="${c}">${c}</button>`,
            )
            .join("")}</div>`,
      )
      .join("") +
    `<div class="keyboard-row"><button class="key-button wide" data-key=" ">Space</button><button class="key-button wide" data-action="delete">Delete</button><button class="key-button wide" data-key="〰">Question 〰</button></div>`;
}
function bindKeyboardEvents() {
  buildKeyboard();
  document.addEventListener("focusin", (e) => {
    if (e.target.matches("input,textarea,[contenteditable='true']"))
      activeTextField = e.target;
  });
  function insert(t) {
    const f = activeTextField;
    if (!f) return;
    if (f.isContentEditable) {
      document.execCommand("insertText", false, t);
      f.focus();
      return;
    }
    const s = f.selectionStart ?? f.value.length,
      en = f.selectionEnd ?? f.value.length;
    f.value = f.value.slice(0, s) + t + f.value.slice(en);
    f.focus();
    f.setSelectionRange(s + t.length, s + t.length);
    f.dispatchEvent(new Event("input", { bubbles: true }));
  }
  $("keyboardToggle").onclick = () => {
    $("cyrillicKeyboard").classList.toggle("open");
  };
  $("keyboardOpenTopButton").onclick = () =>
    $("cyrillicKeyboard").classList.add("open");
  $("closeKeyboardButton").onclick = () =>
    $("cyrillicKeyboard").classList.remove("open");
  $("cyrillicKeyboard").addEventListener("mousedown", (e) =>
    e.preventDefault(),
  );
  $("cyrillicKeyboard").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.key !== undefined) insert(b.dataset.key);
    if (b.dataset.action === "delete")
      document.execCommand("delete", false, null);
  });
}

function seedMaybelleCanon() {
  syncEditorsToData();
  let rootsAdded = 0,
    entriesAdded = 0;
  for (const [glyph, root_name, description] of CANON_ROOTS) {
    const existing = appData.roots.find((r) => r.glyph === glyph);
    if (existing) {
      existing.canon = true;
      continue;
    }
    appData.roots.push({
      id: uid("root"),
      glyph,
      root_name,
      description,
      notes: "",
      canon: true,
    });
    rootsAdded++;
  }
  for (const entry of CANON_ENTRIES) {
    const existing = appData.dictionary.find(
      (e) => e.compound === entry.compound,
    );
    if (existing) {
      existing.canon = true;
      continue;
    }
    appData.dictionary.push({
      id: uid("entry"),
      ...entry,
      fields: {},
      canon: true,
    });
    entriesAdded++;
  }
  sortDictionary();
  preserveSelections();
  renderEverything();
  autosave();
  setStatus(
    `Seeded Maybelle canon: ${rootsAdded} roots and ${entriesAdded} words added. Existing records were not overwritten.`,
    "success",
  );
}
function validateEntry(entry) {
  const warnings = [];
  if (!entry.description?.trim()) warnings.push("Description is empty.");
  const duplicates = appData.dictionary.filter(
    (e) => e.id !== entry.id && e.compound && e.compound === entry.compound,
  );
  if (duplicates.length) warnings.push("Duplicate compound already exists.");
  for (const ch of Array.from(entry.compound || "")) {
    if (ch === "〰") {
      if (!entry.compound.endsWith("〰"))
        warnings.push("Question marker 〰 should appear at the end.");
      continue;
    }
    if (!/[А-ЯЁ]/.test(ch)) warnings.push(`Non-Maybelle character: ${ch}`);
    else if (!appData.roots.some((r) => r.glyph === ch))
      warnings.push(`Unknown root glyph: ${ch}`);
  }
  return warnings;
}
function renderEntryValidation(entry) {
  const box = $("entryValidation").querySelector(".box-body"),
    warnings = validateEntry(entry);
  box.innerHTML = warnings.length
    ? `<ul class="validation-list">${warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join("")}</ul>`
    : '<span class="success">No validation warnings.</span>';
}
function renderCompoundBuilder() {
  const host = $("builderRoots");
  if (!host) return;
  host.innerHTML =
    appData.roots
      .map(
        (r) =>
          `<button class="builder-root" data-builder-glyph="${escapeHtml(r.glyph)}"><b>${escapeHtml(r.glyph)}</b><span>${escapeHtml(r.root_name || "Root")}</span></button>`,
      )
      .join("") ||
    '<span class="muted">Seed or add roots to build compounds.</span>';
  host.querySelectorAll("[data-builder-glyph]").forEach(
    (b) =>
      (b.onclick = () => {
        const input = $("entryCompoundInput");
        input.value += b.dataset.builderGlyph;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.focus();
      }),
  );
}
async function refreshBackups() {
  if (!BACKEND_MODE) {
    const browser = $("backupBrowser");
    if (browser)
      browser.innerHTML =
        '<div class="empty-state">Backup browser requires the Python host.</div>';
    return;
  }
  if (!$("backupBrowser")) return;
  const d = await backendRequest("/api/admin/backups", {}, "read");
  const backupRows = (d.backups || [])
    .map(
      (b) =>
        `<div class="backup-row"><button data-backup-name="${escapeHtml(b.name)}">View</button><span><b>${escapeHtml(b.name)}</b><br><small>${escapeHtml(b.created_at || "")} · pushes ${b.from_push || 0}-${b.to_push || 0} · ${b.change_count || 0} changes</small></span></div>`,
    )
    .join("");
  $("backupBrowser").innerHTML =
    `<h3>Backup Browser</h3><p class="muted">Pushes: ${d.state?.push_count || 0}; pending backup rows: ${d.pending_pushes || 0}</p>` +
    (backupRows || '<div class="empty-state">No backups yet.</div>');
  $("backupBrowser")
    .querySelectorAll("[data-backup-name]")
    .forEach((b) => (b.onclick = () => viewBackup(b.dataset.backupName)));
}
async function viewBackup(name) {
  if (!$("backupPreview")) return;
  const admin_pass = currentAdminPass();
  const d = await backendRequest(
    "/api/admin/backup/read",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, admin_pass }),
    },
    "read",
  );
  $("backupPreview").classList.remove("hidden");
  $("backupPreview").textContent = JSON.stringify(d.backup, null, 2);
}
async function forceBackup() {
  if (!BACKEND_MODE) {
    setStatus("Manual backups require the Python host.", "warning");
    return;
  }
  const admin_pass = currentAdminPass();
  const d = await backendRequest(
    "/api/admin/backup",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ admin_pass }),
    },
    "write",
  );
  setStatus(`Created backup: ${d.backup_path}`, "success");
  await refreshBackups();
}

function bindEvents() {
  document
    .querySelectorAll(".nav-button")
    .forEach((b) => (b.onclick = () => switchView(b.dataset.view)));
  document
    .querySelectorAll("[data-view-jump]")
    .forEach((b) => (b.onclick = () => switchView(b.dataset.viewJump)));
  $("saveLocalButton").onclick = saveLocal;
  $("archiveSaveButton").onclick = () =>
    saveArchiveFile().catch((e) => setStatus(e.message, "error"));
  $("archiveLoadButton").onclick = openArchiveFilePicker;
  $("archiveFileInput").onchange = (e) =>
    loadArchiveFile(e.target.files?.[0]).catch((err) =>
      setStatus(err.message || "Could not load archive.", "error"),
    );
  $("archivePasswordInput").addEventListener("input", persistArchivePassword);
  $("archiveFreezeButton").onclick = () =>
    (async () => {
      appData.frozen_root_ids = dedupeStrings(appData.roots.map((r) => r.id));
      trimCheckpointBuffer();
      if (BACKEND_MODE) await saveToBackend(false);
      else localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
      renderEverything();
      setStatus("Current roots are frozen against deletion.", "success");
    })().catch((e) => setStatus(e.message, "error"));
  $("makeCheckpointButton").onclick = () =>
    makeCheckpoint(false).catch((e) => setStatus(e.message, "error"));
  $("serverPullButton").onclick = () =>
    pullFromServer().catch((e) => setStatus(e.message, "error"));
  $("serverPushButton").onclick = () =>
    pushToServer().catch((e) => setStatus(e.message, "error"));
  $("serverEnterAdminButton").onclick = () =>
    enterServerPassword().catch((e) => setStatus(e.message, "error"));
  [
    "seedCanonHomeButton",
    "seedCanonRootsButton",
  ].forEach((id) => ($(id).onclick = seedMaybelleCanon));
  $("unlockCanonRoots").onchange = renderRootEditor;
  $("addRootButton").onclick = addRoot;
  $("homeAddRootButton").onclick = addRoot;
  $("deleteRootButton").onclick = deleteSelectedRoot;
  $("rootSearch").oninput = renderRootList;
  $("addEntryButton").onclick = addEntry;
  $("homeAddEntryButton").onclick = addEntry;
  $("deleteEntryButton").onclick = deleteSelectedEntry;
  $("entrySearch").oninput = renderEntryList;
  $("addExtraFieldButton").onclick = () => {
    addExtraFieldRow();
    autosave();
  };
  [
    "rootGlyphInput",
    "rootNameInput",
    "rootDescriptionInput",
    "rootNotesInput",
    "entryCompoundInput",
    "entryDescriptionInput",
    "entryLiteralInput",
    "entryNotesInput",
    "grammarNotesInput",
    "checkpointBufferSizeInput",
  ].forEach((id) =>
    $(id).addEventListener("input", () => {
      autosave();
      if (id === "entryCompoundInput") {
        const e = appData.dictionary.find((x) => x.id === selectedEntryId);
        if (e) {
          e.compound = $("entryCompoundInput").value.trim();
          renderEntryEditor();
        }
      }
    }),
  );
  bindKeyboardEvents();
}
async function boot() {
  bindEvents();
  setBackendBanner();
  if (window.initThreads) window.initThreads();
  try {
    const stored = loadStoredWikiJson();
    if (BACKEND_MODE) appData = await loadFromBackend();
    else if (stored) appData = normalizeImportedData(JSON.parse(stored));
    else appData = createEmptyData();
    repairDuplicateIds();
    trimCheckpointBuffer();
    if (!appData.next_checkpoint_at) setNextCheckpoint();
    appData.frozen_root_ids = dedupeStrings(appData.frozen_root_ids || []);
    setStatus(
      BACKEND_MODE ? "Loaded wiki from server file." : "Loaded local wiki.",
      "success",
    );
  } catch (e) {
    console.error(e);
    appData = createEmptyData();
    setStatus("Started empty after load failure.", "warning");
  }
  preserveSelections();
  syncServerInputs();
  syncArchivePasswordInput();
  startCheckpointTimer();
  renderEverything();
  setBackendBanner();
}
document.addEventListener("DOMContentLoaded", boot);

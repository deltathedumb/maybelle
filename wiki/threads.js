"use strict";
let threadUsernameToken =
    sessionStorage.getItem("maybelleThreadUsernameToken") || "",
  threadUsername = sessionStorage.getItem("maybelleThreadUsername") || "",
  selectedThreadId = sessionStorage.getItem("maybelleSelectedThreadId") || "",
  threadTimer = null,
  pendingThreadImages = [];
function threadsBaseUrl() {
  return isBackendMode() ? BACKEND_BASE_URL : "";
}
async function threadsRequest(path, options = {}, mode = "read") {
  const base = threadsBaseUrl();
  if (!base)
    throw new Error(
      "Threads require opening the editor through the Python host.",
    );
  const fetcher = typeof backendRequest === "function" ? backendRequest : null;
  if (fetcher) return fetcher(path, options, mode);
  const headers =
    typeof wikiAuthHeaders === "function" ? wikiAuthHeaders(mode) : {};
  const r = await fetch(base + path, {
    cache: "no-store",
    ...options,
    headers: {
      ...(options.headers || {}),
      ...headers,
    },
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.ok === false) throw new Error(d.error || `HTTP ${r.status}`);
  return d;
}
async function refreshThreadsStatus() {
  if (!isBackendMode()) {
    $("threadsStandaloneNotice").classList.remove("hidden");
    $("threadsDisabledNotice").classList.add("hidden");
    $("threadsMainPanel").classList.add("hidden");
    return;
  }
  $("threadsStandaloneNotice").classList.add("hidden");
  try {
    const s = await threadsRequest("/api/threads/status", {}, "read"),
      t = s.threads || {},
      disabled = !t.enabled;
    $("threadsDisabledNotice").classList.toggle("hidden", !disabled);
    $("threadsMainPanel").classList.toggle("hidden", disabled);
    if (disabled) return;
    $("threadPasswordInput").placeholder = t.password_required
      ? "Required"
      : "Not required";
    await refreshThreads();
  } catch (e) {
    console.error(e);
    setStatus(`Could not reach threads: ${e.message || "unknown"}`, "warning");
  }
}
async function claimThreadUsername() {
  const username = $("threadUsernameInput").value.trim(),
    password = $("threadPasswordInput").value;
  const r = await threadsRequest("/api/threads/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  }, "write");
  threadUsernameToken = r.token;
  threadUsername = r.username;
  sessionStorage.setItem("maybelleThreadUsernameToken", threadUsernameToken);
  sessionStorage.setItem("maybelleThreadUsername", threadUsername);
  setStatus(`Claimed username ${threadUsername}.`, "success");
  await refreshThreads();
}
async function createThread() {
  try {
    if (!threadUsernameToken) await claimThreadUsername();
    const name = $("threadNameInput").value.trim();
    const r = await threadsRequest("/api/threads/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: threadUsernameToken, name }),
    }, "write");
    selectedThreadId = r.thread.id;
    sessionStorage.setItem("maybelleSelectedThreadId", selectedThreadId);
    $("threadNameInput").value = "";
    renderThreads(r);
    await loadThread(selectedThreadId);
    setStatus("Thread created.", "success");
  } catch (e) {
    console.error(e);
    setStatus(e.message || "Could not create thread.", "error");
  }
}
async function refreshThreads() {
  const r = await threadsRequest("/api/threads", {}, "read");
  renderThreads(r);
  if (selectedThreadId) await loadThread(selectedThreadId);
}
function renderThreads(data) {
  const threads = data.threads || [],
    list = $("threadList");
  if (!threads.length) {
    list.innerHTML = '<div class="empty-state">No threads yet.</div>';
    $("selectedThreadTitle").textContent = "No thread selected";
    $("threadMessages").innerHTML =
      '<div class="muted">Create a thread to begin.</div>';
    return;
  }
  if (!selectedThreadId || !threads.some((t) => t.id === selectedThreadId)) {
    selectedThreadId = threads[0].id;
    sessionStorage.setItem("maybelleSelectedThreadId", selectedThreadId);
  }
  list.innerHTML = threads
    .map(
      (t) =>
        `<button class="thread-row ${t.id === selectedThreadId ? "active" : ""}" data-thread-id="${escapeHtml(t.id)}"><span class="thread-row-title">${escapeHtml(t.name)}</span><span class="thread-row-meta">${escapeHtml(t.created_by || "Unknown")} · ${t.message_count || 0} messages</span></button>`,
    )
    .join("");
  list.querySelectorAll("[data-thread-id]").forEach(
    (b) =>
      (b.onclick = async () => {
        selectedThreadId = b.dataset.threadId;
        sessionStorage.setItem("maybelleSelectedThreadId", selectedThreadId);
        await refreshThreads();
      }),
  );
}
async function loadThread(id) {
  const r = await threadsRequest("/api/threads/thread", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ thread_id: id }),
  }, "read");
  renderThread(r.thread);
}
function renderThread(thread) {
  $("selectedThreadTitle").textContent = thread.name || "Thread";
  const msgs = thread.messages || [];
  $("threadMessages").innerHTML = msgs.length
    ? msgs.map(renderThreadMessage).join("")
    : '<div class="muted">No messages yet.</div>';
  $("threadMessages").scrollTop = $("threadMessages").scrollHeight;
  document
    .querySelectorAll("[data-delete-message]")
    .forEach(
      (b) => (b.onclick = () => deleteThreadMessage(b.dataset.deleteMessage)),
    );
  document
    .querySelectorAll("[data-edit-message]")
    .forEach(
      (b) => (b.onclick = () => editThreadMessage(b.dataset.editMessage)),
    );
}
function renderThreadMessage(m) {
  const imgs = Array.isArray(m.images) ? m.images : [];
  const imgHtml = imgs.length
    ? `<div class="thread-images">${imgs.map((i) => `<img class="thread-image" src="${escapeHtml(i.data_url)}" alt="${escapeHtml(i.name || "image")}">`).join("")}</div>`
    : "";
  return `<div class="thread-message"><div class="thread-message-meta"><span class="thread-message-name">${escapeHtml(m.username || "Unknown")}</span> · ${escapeHtml(m.created_at || "")} · <button class="small" data-edit-message="${escapeHtml(m.id)}">Edit</button> <button class="small danger" data-delete-message="${escapeHtml(m.id)}">Delete</button></div><div class="thread-message-body">${m.html || ""}</div>${m.edited_at ? `<div class="thread-edited">edited ${escapeHtml(m.edited_at)}</div>` : ""}${imgHtml}</div>`;
}
async function sendThreadMessage() {
  try {
    if (!selectedThreadId) {
      setStatus("Select or create a thread first.", "warning");
      return;
    }
    if (!threadUsernameToken) await claimThreadUsername();
    const html = $("threadRichEditor").innerHTML.trim(),
      hasText = $("threadRichEditor").textContent.trim().length > 0,
      hasImages = pendingThreadImages.length > 0;
    if (!hasText && !hasImages) return;
    const r = await threadsRequest("/api/threads/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: threadUsernameToken,
        thread_id: selectedThreadId,
        html,
        images: pendingThreadImages,
      }),
    }, "write");
    $("threadRichEditor").innerHTML = "";
    $("threadImageInput").value = "";
    pendingThreadImages = [];
    renderThreadImagePreview();
    renderThreads(r);
    await loadThread(selectedThreadId);
  } catch (e) {
    console.error(e);
    setStatus(e.message || "Could not send message.", "error");
  }
}
async function handleThreadImages(e) {
  const files = Array.from(e.target.files || []),
    max = 2 * 1024 * 1024;
  for (const f of files.slice(0, 5)) {
    if (!f.type.startsWith("image/")) continue;
    if (f.size > max) {
      setStatus(`Image ${f.name} is too large. Max 2 MB.`, "warning");
      continue;
    }
    pendingThreadImages.push({
      name: f.name,
      type: f.type,
      data_url: await readFileAsDataUrl(f),
    });
  }
  renderThreadImagePreview();
}
function readFileAsDataUrl(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result || ""));
    r.onerror = () => rej(r.error || new Error("Could not read file"));
    r.readAsDataURL(file);
  });
}
function renderThreadImagePreview() {
  $("threadImagePreview").innerHTML = pendingThreadImages
    .map(
      (i, n) =>
        `<span>${escapeHtml(i.name)} <button class="small danger" data-remove-image="${n}">x</button></span>`,
    )
    .join("");
  $("threadImagePreview")
    .querySelectorAll("[data-remove-image]")
    .forEach(
      (b) =>
        (b.onclick = () => {
          pendingThreadImages.splice(Number(b.dataset.removeImage), 1);
          renderThreadImagePreview();
        }),
    );
}
function runRichCommand(cmd) {
  document.execCommand(cmd, false, null);
  $("threadRichEditor").focus();
}
async function addRichLink() {
  const url = await showPrompt({
    title: "Insert Link",
    message: "Enter a URL for the link.",
    value: "",
    placeholder: "https://example.com",
    confirmText: "Insert",
  });
  if (url) document.execCommand("createLink", false, url);
  $("threadRichEditor").focus();
}
async function renameSelectedThread() {
  if (!selectedThreadId) return;
  const name = await showPrompt({
    title: "Rename Thread",
    message: "Enter a new thread name.",
    value:
      $("selectedThreadTitle")?.textContent &&
      $("selectedThreadTitle").textContent !== "No thread selected"
        ? $("selectedThreadTitle").textContent
        : "",
    placeholder: "Thread name",
    confirmText: "Rename",
  });
  if (name === null || !name.trim()) return;
  const admin_pass = typeof currentAdminPass === "function" ? currentAdminPass() : "";
  const r = await threadsRequest("/api/threads/rename", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ thread_id: selectedThreadId, name, admin_pass }),
  }, "write");
  renderThreads(r);
  await loadThread(selectedThreadId);
}
async function deleteSelectedThread() {
  if (!selectedThreadId) return;
  if (
    !(await showConfirm({
      title: "Delete Thread",
      message: "Delete this thread?",
      confirmText: "Delete",
      danger: true,
    }))
  )
    return;
  const admin_pass =
    typeof currentAdminPass === "function" ? currentAdminPass() : "";
  const r = await threadsRequest("/api/threads/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ thread_id: selectedThreadId, admin_pass }),
  }, "write");
  selectedThreadId = "";
  sessionStorage.removeItem("maybelleSelectedThreadId");
  renderThreads(r);
}
async function editThreadMessage(message_id) {
  const current =
    document
      .querySelector(`[data-edit-message="${CSS.escape(message_id)}"]`)
      ?.closest(".thread-message")
      ?.querySelector(".thread-message-body")?.innerHTML || "";
  const html = await showPrompt({
    title: "Edit Message",
    message: "Edit the message HTML.",
    value: current,
    multiline: true,
    confirmText: "Save",
  });
  if (html === null) return;
  const admin_pass =
    typeof currentAdminPass === "function" ? currentAdminPass() : "";
  const r = await threadsRequest("/api/threads/message/edit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      thread_id: selectedThreadId,
      message_id,
      html,
      admin_pass,
    }),
  }, "write");
  renderThreads(r);
  await loadThread(selectedThreadId);
}
async function deleteThreadMessage(message_id) {
  if (
    !(await showConfirm({
      title: "Delete Message",
      message: "Delete this message?",
      confirmText: "Delete",
      danger: true,
    }))
  )
    return;
  const admin_pass =
    typeof currentAdminPass === "function" ? currentAdminPass() : "";
  const r = await threadsRequest("/api/threads/message/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      thread_id: selectedThreadId,
      message_id,
      admin_pass,
    }),
  }, "write");
  renderThreads(r);
  await loadThread(selectedThreadId);
}
function startThreadPolling() {
  clearInterval(threadTimer);
  threadTimer = setInterval(() => {
    if (currentView === "threads") refreshThreadsStatus();
  }, 4000);
}
function initThreads() {
  $("threadUsernameInput").value = threadUsername;
  $("claimThreadUsernameButton").onclick = () =>
    claimThreadUsername().catch((e) => setStatus(e.message, "error"));
  $("createThreadButton").onclick = createThread;
  $("refreshThreadsButton").onclick = () =>
    refreshThreadsStatus().catch((e) => setStatus(e.message, "error"));
  $("sendThreadMessageButton").onclick = sendThreadMessage;
  $("threadImageInput").onchange = handleThreadImages;
  document
    .querySelectorAll("[data-rich-command]")
    .forEach((b) => (b.onclick = () => runRichCommand(b.dataset.richCommand)));
  $("richLinkButton").onclick = addRichLink;
  $("threadAdminControls").innerHTML =
    '<button id="renameThreadButton">Rename Thread</button><button id="deleteThreadButton" class="danger">Delete Thread</button>';
  $("renameThreadButton").onclick = () =>
    renameSelectedThread().catch((e) => setStatus(e.message, "error"));
  $("deleteThreadButton").onclick = () =>
    deleteSelectedThread().catch((e) => setStatus(e.message, "error"));
  startThreadPolling();
}
window.refreshThreadsStatus = refreshThreadsStatus;
window.initThreads = initThreads;

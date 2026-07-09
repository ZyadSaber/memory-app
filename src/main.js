import "./style.css";
import exifr from "exifr";

const app = document.getElementById("app");

setupUploadModal();
const noteModal = setupNoteModal();

if (!__MEMORIES_FOLDER_EXISTS__) {
  app.innerHTML = `
    <div class="header">
      <h1>\u{1F9F8} Our Memories</h1>
    </div>
    <div class="empty-state">
      <span class="big-emoji">\u{26A0}\u{FE0F}</span>
      The <code>memories</code> folder is missing. Create a <code>memories</code> folder in the project root
      (with date subfolders like <code>memories/DD-MM-YYYY/photos</code> and <code>videos</code>), then restart the dev server,
      or upload your first memories below.
    </div>
    <div class="upload-cta">
      <button id="upload-btn">\u{1F4E4} Upload Memories</button>
    </div>
  `;
} else {
  renderApp(noteModal);
}

function renderApp(noteModal) {
  const messageFiles = import.meta.glob("/memories/*/message.md", {
    eager: true,
    query: "?raw",
    import: "default",
  });
  const messages = {};
  for (const [filePath, content] of Object.entries(messageFiles)) {
    const match = filePath.match(/\/memories\/([^/]+)\/message\.md$/);
    if (match) messages[match[1]] = content;
  }

  const photoFiles = import.meta.glob(
    [
      "/memories/*/photos/*",
      "!**/.gitkeep",
      "!**/*.heic",
      "!**/*.HEIC",
      "!**/*.heif",
      "!**/*.HEIF",
    ],
    { eager: true, query: "?url", import: "default" }
  );
  const videoFiles = import.meta.glob(["/memories/*/videos/*", "!**/.gitkeep"], {
    eager: true,
    query: "?url",
    import: "default",
  });

  const DATE_FOLDER_RE = /\/memories\/([^/]+)\/(photos|videos)\//;

  function buildMemoryIndex() {
    const index = {};
    for (const [filePath, url] of Object.entries({ ...photoFiles, ...videoFiles })) {
      const match = filePath.match(DATE_FOLDER_RE);
      if (!match) continue;
      const [, dateKey, kind] = match;
      if (!index[dateKey]) index[dateKey] = { photos: [], videos: [] };
      index[dateKey][kind].push(url);
    }
    return index;
  }

  const memories = buildMemoryIndex();
  const dateKeys = Object.keys(memories);

  function parseDateKey(key) {
    const [d, m, y] = key.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function formatPretty(key) {
    return parseDateKey(key).toLocaleDateString(undefined, {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  function formatShort(key) {
    return parseDateKey(key).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  const sortedDateKeys = [...dateKeys].sort((a, b) => parseDateKey(b) - parseDateKey(a));

  app.innerHTML = `
    <div class="header">
      <h1>\u{1F9F8} Our Memories</h1>
      <p>A cozy little archive of the moments we've kept</p>
    </div>
    <div class="controls">
      <div class="date-list" id="date-list"></div>
      <div class="control-buttons">
        <button id="random-date-btn">\u{1F3B2} Random Date</button>
        <button id="random-memories-btn" class="secondary">✨ Random Memories</button>
        <button id="upload-btn">\u{1F4E4} Upload Memories</button>
      </div>
    </div>
    <h2 class="section-title" id="section-title"></h2>
    <div id="note-section" class="note-section"></div>
    <div id="gallery" class="gallery"></div>
    <footer class="note">${dateKeys.length} day${dateKeys.length === 1 ? "" : "s"} of memories saved so far</footer>
  `;

  const dateList = document.getElementById("date-list");
  const gallery = document.getElementById("gallery");
  const sectionTitle = document.getElementById("section-title");
  const noteSection = document.getElementById("note-section");

  function renderNote(dateKey) {
    if (!dateKey) {
      noteSection.innerHTML = "";
      return;
    }
    const content = messages[dateKey];
    const hasNote = !!content && content.trim().length > 0;
    noteSection.innerHTML = `
      <div class="note-card">
        <div class="note-body"></div>
        <button class="note-edit-btn" data-date="${dateKey}">${hasNote ? "\u{270F}\u{FE0F} Edit note" : "\u{1F4DD} Add a note"}</button>
      </div>
    `;
    const bodyEl = noteSection.querySelector(".note-body");
    if (hasNote) {
      const p = document.createElement("p");
      p.className = "note-text";
      p.textContent = content;
      bodyEl.appendChild(p);
    } else {
      const p = document.createElement("p");
      p.className = "note-placeholder";
      p.textContent = "No note for this day yet \u{1F4AC}";
      bodyEl.appendChild(p);
    }
  }

  noteSection.addEventListener("click", (event) => {
    const editBtn = event.target.closest(".note-edit-btn");
    if (!editBtn) return;
    const dateKey = editBtn.dataset.date;
    noteModal.open(dateKey, messages[dateKey] || "");
  });

  function renderDateList(activeKey) {
    if (sortedDateKeys.length === 0) {
      dateList.innerHTML = `<span class="date-list-empty">No dates yet</span>`;
      return;
    }
    dateList.innerHTML = sortedDateKeys
      .map(
        (key) =>
          `<button class="date-chip${key === activeKey ? " active" : ""}" data-date="${key}">${formatShort(key)}</button>`
      )
      .join("");
  }

  function selectDate(dateKey) {
    renderDateList(dateKey);
    renderDate(dateKey);
  }

  function renderEmpty(message, emoji = "\u{1F4ED}") {
    gallery.innerHTML = `
      <div class="empty-state" style="grid-column: 1/-1">
        <span class="big-emoji">${emoji}</span>
        ${message}
      </div>
    `;
  }

  function renderDate(dateKey) {
    if (!dateKey || !memories[dateKey]) {
      sectionTitle.textContent = "";
      renderNote(null);
      renderEmpty("No memories for this date yet \u{1F49B}", "\u{1F4ED}");
      return;
    }
    const { photos, videos } = memories[dateKey];
    sectionTitle.textContent = formatPretty(dateKey);
    renderNote(dateKey);
    if (photos.length === 0 && videos.length === 0) {
      renderEmpty("This day is empty so far \u{1F49B}");
      return;
    }
    gallery.innerHTML = [
      ...photos.map((url) => `
        <div class="memory-card">
          <img src="${url}" loading="lazy" alt="Memory from ${formatPretty(dateKey)}" />
        </div>
      `),
      ...videos.map((url) => `
        <div class="memory-card">
          <span class="video-badge">\u{1F3AC} video</span>
          <video src="${url}" controls preload="metadata"></video>
        </div>
      `),
    ].join("");
  }

  function renderRandomMemories(count = 12) {
    const pool = [];
    for (const dateKey of dateKeys) {
      const { photos, videos } = memories[dateKey];
      photos.forEach((url) => pool.push({ url, dateKey, type: "photo" }));
      videos.forEach((url) => pool.push({ url, dateKey, type: "video" }));
    }
    renderDateList(null);
    renderNote(null);
    if (pool.length === 0) {
      sectionTitle.textContent = "Random Memories";
      renderEmpty("No memories saved yet \u{1F49B}", "✨");
      return;
    }
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const picks = pool.slice(0, count);
    sectionTitle.textContent = "A few surprises ✨";
    gallery.innerHTML = picks
      .map(({ url, dateKey, type }) =>
        type === "photo"
          ? `<div class="memory-card">
              <img src="${url}" loading="lazy" alt="Memory from ${formatPretty(dateKey)}" />
              <span class="caption">${formatPretty(dateKey)}</span>
            </div>`
          : `<div class="memory-card">
              <span class="video-badge">\u{1F3AC} video</span>
              <video src="${url}" controls preload="metadata"></video>
              <span class="caption">${formatPretty(dateKey)}</span>
            </div>`
      )
      .join("");
  }

  dateList.addEventListener("click", (event) => {
    const chip = event.target.closest(".date-chip");
    if (!chip) return;
    selectDate(chip.dataset.date);
  });

  document.getElementById("random-date-btn").addEventListener("click", () => {
    if (dateKeys.length === 0) {
      renderEmpty("No memory folders exist yet \u{1F49B}", "\u{1F3B2}");
      sectionTitle.textContent = "";
      renderNote(null);
      return;
    }
    const randomKey = dateKeys[Math.floor(Math.random() * dateKeys.length)];
    selectDate(randomKey);
  });

  document.getElementById("random-memories-btn").addEventListener("click", () => {
    renderRandomMemories();
  });

  if (sortedDateKeys.length > 0) {
    selectDate(sortedDateKeys[0]);
  } else {
    renderDateList(null);
    renderNote(null);
    renderEmpty(
      "Add a folder under <code>memories/DD-MM-YYYY/photos</code> or <code>videos</code> to get started \u{1F49B}",
      "\u{1F9F8}"
    );
  }
}

function setupUploadModal() {
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.multiple = true;
  fileInput.hidden = true;
  document.body.appendChild(fileInput);

  const overlay = document.createElement("div");
  overlay.className = "upload-modal-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="upload-modal">
      <h3>\u{1F4E4} Upload Memories</h3>
      <p id="upload-file-count"></p>
      <label for="upload-date-input">Date</label>
      <input type="date" id="upload-date-input" />
      <p id="upload-status" class="upload-status" hidden></p>
      <div class="upload-modal-actions">
        <button id="upload-cancel-btn" class="secondary" type="button">Cancel</button>
        <button id="upload-confirm-btn" type="button">Upload</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const dateInput = overlay.querySelector("#upload-date-input");
  const fileCountEl = overlay.querySelector("#upload-file-count");
  const statusEl = overlay.querySelector("#upload-status");
  const confirmBtn = overlay.querySelector("#upload-confirm-btn");
  const cancelBtn = overlay.querySelector("#upload-cancel-btn");

  let pendingFiles = [];

  function closeModal() {
    overlay.hidden = true;
    fileInput.value = "";
    pendingFiles = [];
    statusEl.hidden = true;
    confirmBtn.disabled = false;
    confirmBtn.textContent = "Upload";
  }

  async function detectSuggestedDate(files) {
    for (const file of files) {
      try {
        const exif = await exifr.parse(file, ["DateTimeOriginal", "CreateDate"]);
        const detected = exif?.DateTimeOriginal || exif?.CreateDate;
        if (detected instanceof Date && !Number.isNaN(detected.getTime())) return detected;
      } catch {
        // not a parseable image, or no EXIF date — try the next file
      }
    }
    const times = files.map((f) => f.lastModified).filter(Boolean);
    return times.length > 0 ? new Date(Math.min(...times)) : new Date();
  }

  function toDateInputValue(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  document.body.addEventListener("click", (event) => {
    if (event.target.closest("#upload-btn")) {
      fileInput.click();
    }
  });

  fileInput.addEventListener("change", async () => {
    const files = Array.from(fileInput.files || []);
    if (files.length === 0) return;
    pendingFiles = files;
    fileCountEl.textContent = `${files.length} file${files.length === 1 ? "" : "s"} selected`;
    const suggested = await detectSuggestedDate(files);
    dateInput.value = toDateInputValue(suggested);
    overlay.hidden = false;
  });

  cancelBtn.addEventListener("click", closeModal);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeModal();
  });

  confirmBtn.addEventListener("click", async () => {
    if (!dateInput.value || pendingFiles.length === 0) return;
    confirmBtn.disabled = true;
    confirmBtn.textContent = "Uploading...";
    statusEl.hidden = true;

    const formData = new FormData();
    formData.append("date", dateInput.value);
    pendingFiles.forEach((file) => formData.append("files", file));

    try {
      const response = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Upload failed");
      }
      statusEl.hidden = false;
      statusEl.textContent = "Uploaded! Refreshing... \u{1F49B}";
      confirmBtn.textContent = "Done";
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      statusEl.hidden = false;
      statusEl.textContent = err.message || "Something went wrong";
      confirmBtn.disabled = false;
      confirmBtn.textContent = "Upload";
    }
  });
}

function setupNoteModal() {
  const overlay = document.createElement("div");
  overlay.className = "upload-modal-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="upload-modal note-modal">
      <h3>\u{1F4DD} Day Note</h3>
      <textarea id="note-textarea" rows="6" placeholder="Write something about this day..."></textarea>
      <p id="note-status" class="upload-status" hidden></p>
      <div class="upload-modal-actions">
        <button id="note-cancel-btn" class="secondary" type="button">Cancel</button>
        <button id="note-save-btn" type="button">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const textarea = overlay.querySelector("#note-textarea");
  const statusEl = overlay.querySelector("#note-status");
  const saveBtn = overlay.querySelector("#note-save-btn");
  const cancelBtn = overlay.querySelector("#note-cancel-btn");

  let activeDateKey = null;

  function closeModal() {
    overlay.hidden = true;
    statusEl.hidden = true;
    saveBtn.disabled = false;
    saveBtn.textContent = "Save";
  }

  cancelBtn.addEventListener("click", closeModal);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeModal();
  });

  saveBtn.addEventListener("click", async () => {
    if (!activeDateKey) return;
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";
    statusEl.hidden = true;

    try {
      const response = await fetch("/api/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: activeDateKey, message: textarea.value }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Save failed");
      }
      statusEl.hidden = false;
      statusEl.textContent = "Saved! Refreshing... \u{1F49B}";
      saveBtn.textContent = "Done";
      setTimeout(() => window.location.reload(), 1000);
    } catch (err) {
      statusEl.hidden = false;
      statusEl.textContent = err.message || "Something went wrong";
      saveBtn.disabled = false;
      saveBtn.textContent = "Save";
    }
  });

  return {
    open(dateKey, currentText) {
      activeDateKey = dateKey;
      textarea.value = currentText || "";
      overlay.hidden = false;
      textarea.focus();
    },
  };
}

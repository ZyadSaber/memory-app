import "./style.css";

const app = document.getElementById("app");

if (!__MEMORIES_FOLDER_EXISTS__) {
  app.innerHTML = `
    <div class="header">
      <h1>\u{1F9F8} Our Memories</h1>
    </div>
    <div class="empty-state">
      <span class="big-emoji">\u{26A0}\u{FE0F}</span>
      The <code>memories</code> folder is missing. Create a <code>memories</code> folder in the project root
      (with date subfolders like <code>memories/DD-MM-YYYY/photos</code> and <code>videos</code>), then restart the dev server.
    </div>
  `;
} else {
  renderApp();
}

function renderApp() {
  const photoFiles = import.meta.glob(
    "/memories/*/photos/*.{jpg,JPG,jpeg,JPEG,png,PNG,gif,GIF,webp,WEBP,avif,AVIF}",
    { eager: true, query: "?url", import: "default" }
  );
  const videoFiles = import.meta.glob(
    "/memories/*/videos/*.{mp4,MP4,webm,WEBM,mov,MOV,m4v,M4V}",
    { eager: true, query: "?url", import: "default" }
  );

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
      </div>
    </div>
    <h2 class="section-title" id="section-title"></h2>
    <div id="gallery" class="gallery"></div>
    <footer class="note">${dateKeys.length} day${dateKeys.length === 1 ? "" : "s"} of memories saved so far</footer>
  `;

  const dateList = document.getElementById("date-list");
  const gallery = document.getElementById("gallery");
  const sectionTitle = document.getElementById("section-title");

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
      renderEmpty("No memories for this date yet \u{1F49B}", "\u{1F4ED}");
      return;
    }
    const { photos, videos } = memories[dateKey];
    sectionTitle.textContent = formatPretty(dateKey);
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
    renderEmpty(
      "Add a folder under <code>memories/DD-MM-YYYY/photos</code> or <code>videos</code> to get started \u{1F49B}",
      "\u{1F9F8}"
    );
  }
}

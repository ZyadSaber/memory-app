import "dotenv/config";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import busboy from "busboy";
import { convertHeicFiles } from "../scripts/convert-heic.mjs";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const memoriesDir = path.join(rootDir, "memories");
const distDir = path.join(rootDir, "dist");

fs.mkdirSync(memoriesDir, { recursive: true });

const AUTH_USER = process.env.AUTH_USER;
const AUTH_PASS = process.env.AUTH_PASS;
if (!AUTH_USER || !AUTH_PASS) {
  console.error(
    "AUTH_USER and AUTH_PASS environment variables are required. Copy .env.example to .env and set them."
  );
  process.exit(1);
}

function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

const SESSION_COOKIE = "memories_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const sessions = new Map();

function createSession() {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  return token;
}

function isValidSession(token) {
  if (!token) return false;
  const expires = sessions.get(token);
  if (!expires) return false;
  if (Date.now() > expires) {
    sessions.delete(token);
    return false;
  }
  return true;
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const cookies = {};
  for (const part of header.split(";")) {
    const sepIndex = part.indexOf("=");
    if (sepIndex === -1) continue;
    const key = part.slice(0, sepIndex).trim();
    if (!key) continue;
    cookies[key] = decodeURIComponent(part.slice(sepIndex + 1).trim());
  }
  return cookies;
}

function loginPageHtml({ error } = {}) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Our Memories</title>
<style>
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: "Nunito", sans-serif;
    color: #5a3d33;
    background: radial-gradient(circle at 15% 10%, #f6c9c6 0%, transparent 45%),
      radial-gradient(circle at 85% 0%, #fbe9d7 0%, transparent 40%),
      radial-gradient(circle at 50% 100%, #fbe9d7 0%, transparent 50%),
      #fff6ec;
  }
  form {
    background: #fff;
    padding: 2.5rem 2rem;
    border-radius: 16px;
    box-shadow: 0 10px 30px rgba(163, 95, 66, 0.15);
    width: 100%;
    max-width: 320px;
  }
  h1 {
    margin: 0 0 1.5rem;
    font-size: 1.5rem;
    color: #a35f42;
    text-align: center;
  }
  label {
    display: block;
    font-size: 0.9rem;
    margin-bottom: 0.3rem;
  }
  input {
    width: 100%;
    padding: 0.6rem 0.7rem;
    margin-bottom: 1rem;
    border: 1px solid #f6c9c6;
    border-radius: 8px;
    font-size: 1rem;
    box-sizing: border-box;
  }
  button {
    width: 100%;
    padding: 0.7rem;
    border: none;
    border-radius: 8px;
    background: #c17a5a;
    color: #fff;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
  }
  button:hover {
    background: #a35f42;
  }
  .error {
    color: #a33;
    font-size: 0.85rem;
    margin: -0.8rem 0 1rem;
    text-align: center;
  }
</style>
</head>
<body>
  <form method="POST" action="/login">
    <h1>Our Memories</h1>
    ${error ? '<p class="error">Incorrect username or password.</p>' : ""}
    <label for="username">Username</label>
    <input type="text" id="username" name="username" autocomplete="username" required autofocus />
    <label for="password">Password</label>
    <input type="password" id="password" name="password" autocomplete="current-password" required />
    <button type="submit">Log in</button>
  </form>
</body>
</html>`;
}

function authMiddleware(req, res, next) {
  if (req.path === "/login") return next();
  const cookies = parseCookies(req);
  if (isValidSession(cookies[SESSION_COOKIE])) return next();
  if (req.path.startsWith("/api/") || req.path.startsWith("/memories/")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  res.redirect(302, "/login");
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_FOLDER_RE = /^\d{1,2}-\d{1,2}-\d{4}$/;
const HEIC_RE = /\.(heic|heif)$/i;
const MAX_FILE_SIZE = 300 * 1024 * 1024;

function listMediaFiles(dateKey, kind) {
  const dir = path.join(memoriesDir, dateKey, kind);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name !== ".gitkeep")
    .map((entry) => `/memories/${dateKey}/${kind}/${entry.name}`);
}

function listMemories() {
  const result = {};
  if (!fs.existsSync(memoriesDir)) return result;
  for (const entry of fs.readdirSync(memoriesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dateKey = entry.name;
    const photos = listMediaFiles(dateKey, "photos").filter((url) => !HEIC_RE.test(url));
    const videos = listMediaFiles(dateKey, "videos");

    let message = "";
    const messagePath = path.join(memoriesDir, dateKey, "message.md");
    if (fs.existsSync(messagePath)) {
      message = fs.readFileSync(messagePath, "utf-8");
    }

    if (photos.length === 0 && videos.length === 0 && !message.trim()) continue;
    result[dateKey] = { photos, videos, message };
  }
  return result;
}

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.get("/login", (req, res) => {
  res.status(200).send(loginPageHtml({ error: req.query.error === "1" }));
});

app.post("/login", (req, res) => {
  const { username, password } = req.body || {};
  if (
    typeof username === "string" &&
    typeof password === "string" &&
    timingSafeEqualStr(username, AUTH_USER) &&
    timingSafeEqualStr(password, AUTH_PASS)
  ) {
    const token = createSession();
    res.set(
      "Set-Cookie",
      `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
    );
    res.redirect(302, "/");
    return;
  }
  res.redirect(302, "/login?error=1");
});

app.post("/logout", (req, res) => {
  const cookies = parseCookies(req);
  sessions.delete(cookies[SESSION_COOKIE]);
  res.set("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  res.redirect(302, "/login");
});

app.use(authMiddleware);
app.use("/memories", express.static(memoriesDir));

app.get("/api/memories", (req, res) => {
  res.json(listMemories());
});

app.post("/api/upload", (req, res) => {
  const bb = busboy({ headers: req.headers, limits: { fileSize: MAX_FILE_SIZE } });
  let dateValue = null;
  let truncated = false;
  let hadError = false;
  const writePromises = [];

  const fail = (status, message) => {
    if (hadError) return;
    hadError = true;
    res.status(status).json({ error: message });
  };

  bb.on("field", (name, value) => {
    if (name === "date") dateValue = value;
  });

  bb.on("file", (_name, fileStream, info) => {
    if (!dateValue || !ISO_DATE_RE.test(dateValue)) {
      fileStream.resume();
      return;
    }
    const kind = (info.mimeType || "").startsWith("video/") ? "videos" : "photos";
    const [y, m, d] = dateValue.split("-").map(Number);
    const folderName = `${d}-${m}-${y}`;
    const destDir = path.join(memoriesDir, folderName, kind);
    fs.mkdirSync(destDir, { recursive: true });
    const destPath = path.join(destDir, path.basename(info.filename));
    const writeStream = fs.createWriteStream(destPath);
    fileStream.on("limit", () => {
      truncated = true;
    });
    fileStream.pipe(writeStream);
    writePromises.push(
      new Promise((resolve, reject) => {
        writeStream.on("finish", resolve);
        writeStream.on("error", reject);
      })
    );
  });

  bb.on("error", (err) => fail(500, err.message));

  bb.on("close", async () => {
    if (hadError) return;
    try {
      await Promise.all(writePromises);
      if (truncated) {
        fail(400, "One or more files exceeded the size limit and were not fully saved.");
        return;
      }
      await convertHeicFiles(memoriesDir);
      res.json({ ok: true, memories: listMemories() });
    } catch (err) {
      fail(500, err.message);
    }
  });

  req.pipe(bb);
});

app.post("/api/message", (req, res) => {
  const { date, message } = req.body || {};
  if (!date || !DATE_FOLDER_RE.test(date) || typeof message !== "string") {
    res.status(400).json({ error: "Missing or invalid date/message" });
    return;
  }
  const destDir = path.join(memoriesDir, date);
  fs.mkdirSync(destDir, { recursive: true });
  fs.writeFileSync(path.join(destDir, "message.md"), message, "utf-8");
  res.json({ ok: true, memories: listMemories() });
});

if (process.env.NODE_ENV === "production") {
  app.use(express.static(distDir));
}

const PORT = process.env.PORT || (process.env.NODE_ENV === "production" ? 3000 : 3001);
app.listen(PORT, () => {
  console.log(`Our Memories server listening on http://localhost:${PORT}`);
});

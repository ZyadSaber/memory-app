import { defineConfig } from "vite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import busboy from "busboy";
import { convertHeicFiles } from "./scripts/convert-heic.mjs";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const memoriesDir = path.join(rootDir, "memories");
const memoriesFolderExists = fs.existsSync(memoriesDir);

function uploadPlugin() {
  return {
    name: "memories-upload",
    configureServer(server) {
      server.middlewares.use("/api/upload", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("Method not allowed");
          return;
        }

        const bb = busboy({ headers: req.headers });
        let dateValue = null;
        const writePromises = [];
        let hadError = false;

        const fail = (status, message) => {
          if (hadError) return;
          hadError = true;
          res.statusCode = status;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: message }));
        };

        bb.on("field", (name, value) => {
          if (name === "date") dateValue = value;
        });

        bb.on("file", (_name, fileStream, info) => {
          if (!dateValue || !/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
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
            await convertHeicFiles(memoriesDir);
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true }));
            await server.restart();
          } catch (err) {
            fail(500, err.message);
          }
        });

        req.pipe(bb);
      });
    },
  };
}

export default defineConfig({
  plugins: [uploadPlugin()],
  define: {
    __MEMORIES_FOLDER_EXISTS__: JSON.stringify(memoriesFolderExists),
  },
  server: {
    watch: {
      ignored: ["**/memories/**"],
    },
  },
});

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import heicConvert from "heic-convert";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const memoriesDir = path.join(rootDir, "memories");

function findHeicFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findHeicFiles(fullPath));
    } else if (/\.heic$/i.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

async function convertAll() {
  const heicFiles = findHeicFiles(memoriesDir);
  if (heicFiles.length === 0) return;

  for (const heicPath of heicFiles) {
    const jpgPath = heicPath.replace(/\.heic$/i, ".jpg");
    if (fs.existsSync(jpgPath)) continue;
    try {
      const inputBuffer = fs.readFileSync(heicPath);
      const outputBuffer = await heicConvert({ buffer: inputBuffer, format: "JPEG", quality: 0.9 });
      fs.writeFileSync(jpgPath, outputBuffer);
      console.log(`[convert-heic] ${path.relative(rootDir, heicPath)} -> ${path.basename(jpgPath)}`);
    } catch (err) {
      console.error(`[convert-heic] failed for ${path.relative(rootDir, heicPath)}:`, err.message);
    }
  }
}

await convertAll();

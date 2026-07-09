import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import heicConvert from "heic-convert";

const HEIC_RE = /\.(heic|heif)$/i;

export function findHeicFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findHeicFiles(fullPath));
    } else if (HEIC_RE.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

export async function convertHeicFiles(memoriesDir) {
  const heicFiles = findHeicFiles(memoriesDir);

  for (const heicPath of heicFiles) {
    const jpgPath = heicPath.replace(HEIC_RE, ".jpg");
    if (fs.existsSync(jpgPath)) continue;
    try {
      const inputBuffer = fs.readFileSync(heicPath);
      const outputBuffer = await heicConvert({ buffer: inputBuffer, format: "JPEG", quality: 0.9 });
      fs.writeFileSync(jpgPath, outputBuffer);
      console.log(`[convert-heic] ${path.basename(heicPath)} -> ${path.basename(jpgPath)}`);
    } catch (err) {
      console.error(`[convert-heic] failed for ${path.basename(heicPath)}:`, err.message);
    }
  }
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  await convertHeicFiles(path.join(rootDir, "memories"));
}

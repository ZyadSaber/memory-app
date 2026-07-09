import { defineConfig } from "vite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const memoriesFolderExists = fs.existsSync(path.join(rootDir, "memories"));

export default defineConfig({
  define: {
    __MEMORIES_FOLDER_EXISTS__: JSON.stringify(memoriesFolderExists),
  },
  server: {
    watch: {
      ignored: ["**/memories/**"],
    },
  },
});

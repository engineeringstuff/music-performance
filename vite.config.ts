import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/**
 * Emit a build-time precache manifest for the production service worker.
 * The cache version includes the content lock so content-only updates also
 * invalidate the installed cache.
 */
function serviceWorkerPrecache(): Plugin {
  return {
    name: "music-performance-sw-precache",
    apply: "build",
    generateBundle(_options, bundle) {
      if (this.environment?.name && this.environment.name !== "client") {
        return;
      }
      const hashedAssets = Object.keys(bundle)
        .filter((fileName) => fileName.endsWith(".js") || fileName.endsWith(".css"))
        .map((fileName) => `/${fileName}`)
        .sort();

      let contentVersion = "";
      const lockPath = path.resolve(import.meta.dirname, "content/content.lock.json");
      if (existsSync(lockPath)) {
        contentVersion = createHash("sha256")
          .update(readFileSync(lockPath))
          .digest("hex")
          .slice(0, 16);
      }

      const cacheVersion = createHash("sha256")
        .update(`${hashedAssets.join("|")}|${contentVersion}`)
        .digest("hex")
        .slice(0, 20);

      const template = readFileSync(
        path.resolve(import.meta.dirname, "src/client/sw-template.js"),
        "utf8",
      );
      const serviceWorker = template
        .replace("__CACHE_VERSION__", `mp-${cacheVersion}`)
        .replace("__PRECACHE__", JSON.stringify(hashedAssets));
      this.emitFile({ type: "asset", fileName: "sw.js", source: serviceWorker });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare(), serviceWorkerPrecache()],
});

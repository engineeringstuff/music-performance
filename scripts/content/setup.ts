import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { SOUNDFONT, SOUNDFONT_SHA } from "./model.ts";

const SOUNDFONT_URL =
  "https://raw.githubusercontent.com/musescore/MuseScore/main/share/sound/FluidR3Mono_GM.sf3";

function hash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

async function main(): Promise<void> {
  if (existsSync(SOUNDFONT)) {
    const existing = hash(readFileSync(SOUNDFONT));
    if (existing === SOUNDFONT_SHA) {
      console.log(`Soundfont already present and verified: ${SOUNDFONT}`);
      return;
    }
    console.warn(`Soundfont exists but has the wrong hash (${existing}); replacing it.`);
  }

  console.log(`Downloading ${SOUNDFONT_URL}…`);
  const response = await fetch(SOUNDFONT_URL);
  if (!response.ok) {
    throw new Error(`Download failed (${response.status}). See content/SOUNDFONT-LICENSE.md.`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const actual = hash(buffer);
  if (actual !== SOUNDFONT_SHA) {
    throw new Error(
      `Soundfont SHA-256 mismatch.\nExpected ${SOUNDFONT_SHA}\nActual   ${actual}\nSee content/SOUNDFONT-LICENSE.md.`,
    );
  }

  mkdirSync(path.dirname(SOUNDFONT), { recursive: true });
  writeFileSync(SOUNDFONT, buffer);
  console.log(`Verified and wrote ${SOUNDFONT}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

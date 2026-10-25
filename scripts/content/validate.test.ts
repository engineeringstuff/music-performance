import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "../..");
const TSX = path.join(ROOT, "node_modules", ".bin", "tsx");
const EXCLUDED_TOP = new Set([
  "node_modules",
  ".git",
  "dist",
  ".wrangler",
  "coverage",
  "test-results",
  "playwright-report",
  ".playwright",
  ".content-build",
]);

let baseCopy: string;
let cloneCounter = 0;

function cloneRepo(): string {
  const directory = mkdtempSync(path.join(tmpdir(), `mp-validate-${cloneCounter}-`));
  cloneCounter += 1;
  cpSync(baseCopy, directory, { recursive: true });
  symlinkSync(path.join(ROOT, "node_modules"), path.join(directory, "node_modules"), "dir");
  return directory;
}

function runValidator(directory: string): string {
  return execFileSync(TSX, ["scripts/content/validate.ts"], {
    cwd: directory,
    encoding: "utf8",
    stdio: "pipe",
  });
}

function expectInvalid(directory: string, expected: RegExp): void {
  try {
    runValidator(directory);
    throw new Error("validator unexpectedly passed");
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr ?? "";
    const stdout = (error as { stdout?: string }).stdout ?? "";
    expect(`${stderr}${stdout}`).toMatch(expected);
  }
}

beforeAll(() => {
  baseCopy = mkdtempSync(path.join(tmpdir(), "mp-validate-base-"));
  cpSync(ROOT, baseCopy, {
    recursive: true,
    filter: (source) => {
      const relative = path.relative(ROOT, source);
      const top = relative.split(path.sep)[0] ?? "";
      if (EXCLUDED_TOP.has(top)) {
        return false;
      }
      if (relative.startsWith(`content${path.sep}soundfont`)) {
        return false;
      }
      return true;
    },
  });
}, 30_000);

afterAll(() => {
  rmSync(baseCopy, { recursive: true, force: true });
});

describe("content validator gate", () => {
  it("accepts the committed content", () => {
    const directory = cloneRepo();
    try {
      expect(runValidator(directory)).toMatch(/Content valid: 4 tracks/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects a tampered chart", () => {
    const directory = cloneRepo();
    try {
      const chartPath = path.join(directory, "public/charts/ode-to-joy.json");
      const chart = JSON.parse(readFileSync(chartPath, "utf8")) as {
        notes: { midi: number }[];
      };
      const first = chart.notes[0];
      if (!first) {
        throw new Error("chart has no notes");
      }
      first.midi = 60;
      writeFileSync(chartPath, JSON.stringify(chart));
      expectInvalid(directory, /chart hash mismatch|chart/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects replaced audio, catalogue, render config, voices and notices", () => {
    const mutations: Array<{ mutate: (directory: string) => void; expected: RegExp }> = [
      {
        mutate: (directory) => {
          cpSync(
            path.join(directory, "public/audio/twinkle.backing.mp3"),
            path.join(directory, "public/audio/ode-to-joy.backing.mp3"),
          );
        },
        expected: /backing MP3 hash mismatch/,
      },
      {
        mutate: (directory) => {
          const catalogPath = path.join(directory, "src/worker/catalog.generated.ts");
          const source = readFileSync(catalogPath, "utf8");
          writeFileSync(
            catalogPath,
            source.replace('"licence": "Public domain"', '"licence": "All rights reserved"'),
          );
        },
        expected: /generated catalogue entry/,
      },
      {
        mutate: (directory) => {
          const manifestPath = path.join(directory, "content/tracks/twinkle/track.json");
          const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { program: number };
          manifest.program = 11;
          writeFileSync(manifestPath, JSON.stringify(manifest));
        },
        expected: /render configuration changed/,
      },
      {
        mutate: (directory) => {
          const voicesPath = path.join(directory, "content/tracks/twinkle/voices.json");
          const voices = JSON.parse(readFileSync(voicesPath, "utf8")) as {
            voices: { melody: { midi: number }[] };
          };
          const first = voices.voices.melody[0];
          if (!first) {
            throw new Error("voices have no melody notes");
          }
          first.midi = 61;
          writeFileSync(voicesPath, JSON.stringify(voices));
        },
        expected: /source hash mismatch for voices.json|voices.json hash mismatch/,
      },
      {
        mutate: (directory) => {
          const noticesPath = path.join(directory, "public/THIRD_PARTY_NOTICES.txt");
          writeFileSync(
            noticesPath,
            readFileSync(noticesPath, "utf8").replace("Twinkle, Twinkle, Little Star", "Twinkle"),
          );
        },
        expected: /third-party notices do not mention/,
      },
    ];

    for (const mutation of mutations) {
      const directory = cloneRepo();
      try {
        mutation.mutate(directory);
        expectInvalid(directory, mutation.expected);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    }
  }, 60_000);
});

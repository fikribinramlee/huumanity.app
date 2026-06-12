#!/usr/bin/env node
/**
 * Post-build step for `npm run tauri:release`.
 *
 * After Tauri produces a DMG under
 *   src-tauri/target/release/bundle/dmg/huumanity_<version>_<arch>.dmg
 * this script copies the newest matching file to
 *   public/downloads/huu-mac.dmg
 * so the website's download route always serves the latest build.
 *
 * The website's `app/download/page.tsx` references `huu-mac.dmg` directly;
 * keeping a stable filename means we never have to edit website code per
 * release — just rebuild.
 */

import { readdirSync, statSync, copyFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..");

const DMG_DIR = join(REPO_ROOT, "src-tauri", "target", "release", "bundle", "dmg");
const DEST_DIR = join(REPO_ROOT, "public", "downloads");
const DEST = join(DEST_DIR, "huu-mac.dmg");

if (!existsSync(DMG_DIR)) {
  console.error(
    `[copy-tauri-bundle] No build folder at ${DMG_DIR}.\n` +
      `Run \`npm run tauri:build\` first, or use \`npm run tauri:release\` ` +
      `to build and copy in one step.`
  );
  process.exit(1);
}

const candidates = readdirSync(DMG_DIR)
  .filter((name) => name.endsWith(".dmg"))
  .map((name) => {
    const full = join(DMG_DIR, name);
    return { name, full, mtime: statSync(full).mtimeMs };
  })
  .sort((a, b) => b.mtime - a.mtime);

if (candidates.length === 0) {
  console.error(`[copy-tauri-bundle] No .dmg files found in ${DMG_DIR}.`);
  process.exit(1);
}

const { name, full } = candidates[0];

if (!existsSync(DEST_DIR)) mkdirSync(DEST_DIR, { recursive: true });
copyFileSync(full, DEST);

console.log(`[copy-tauri-bundle] Copied ${name}`);
console.log(`[copy-tauri-bundle]      → ${DEST}`);
console.log(`[copy-tauri-bundle] Ready to deploy: \`git add public/downloads/huu-mac.dmg && git commit && git push\``);

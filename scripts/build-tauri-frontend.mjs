import { cp, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nextAppDir = path.join(root, ".next", "server", "app");
const staticDir = path.join(root, ".next", "static");
const publicDir = path.join(root, "public");
const outDir = path.join(root, "out");

const routes = [
  { source: "index.html", destination: "index.html" },
  { source: "editor.html", destination: "editor/index.html" },
  { source: "selector.html", destination: "selector/index.html" },
  { source: "download.html", destination: "download/index.html" },
];

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function copyRoute({ source, destination }) {
  const sourcePath = path.join(nextAppDir, source);
  if (!(await exists(sourcePath))) {
    throw new Error(`Missing prerendered route: ${sourcePath}`);
  }

  const destinationPath = path.join(outDir, destination);
  await mkdir(path.dirname(destinationPath), { recursive: true });
  await cp(sourcePath, destinationPath);
}

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

if (await exists(publicDir)) {
  await cp(publicDir, outDir, { recursive: true });
}

await mkdir(path.join(outDir, "_next"), { recursive: true });
await cp(staticDir, path.join(outDir, "_next", "static"), { recursive: true });

for (const route of routes) {
  await copyRoute(route);
}

console.log("Desktop frontend written to ./out");

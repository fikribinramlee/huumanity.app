# Step 2 — Tauri added to your Next.js project

Tauri is now wired into this repo. In **dev mode**, the desktop app opens a window that loads your existing Next.js site from `http://localhost:3000`.

## What was added

```
src-tauri/          ← Rust desktop shell
  tauri.conf.json   ← points at your Next.js dev server
  src/lib.rs        ← app entry
  icons/            ← app icons
```

New npm scripts:

| Command | What it does |
|---------|----------------|
| `npm run tauri:dev` | Starts Next.js + opens the desktop window |
| `npm run tauri:build` | Builds a `.dmg` installer (production — more setup needed) |

## Run the desktop app (Step 3 preview)

1. **Stop** any existing `npm run dev` server (only one can use port 3000).
2. In Terminal (from the project folder):

```bash
source "$HOME/.cargo/env"
npm run tauri:dev
```

3. The **first run takes 5–10 minutes** — Rust compiles everything from scratch. Later runs are much faster.
4. A desktop window titled **huu** should open showing your landing page.

## How it works

```
npm run tauri:dev
    │
    ├─► npm run dev        (Next.js on localhost:3000)
    │
    └─► Tauri window       (loads http://localhost:3000)
```

Your React components, API routes, and Clerk auth all still run through Next.js — Tauri is just the native window around them.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `command not found: cargo` | Run `source "$HOME/.cargo/env"` |
| Port 3000 in use | Kill the other `next dev` process |
| Blank window | Wait for Next.js to finish starting, then refresh (Cmd+R) |
| Build fails on icons | Icons are already in `src-tauri/icons/` |

## Production builds (later)

`npm run tauri:build` needs a static frontend export or a bundled Next.js server. Your app uses API routes (`/api/humanize`), so production packaging is a separate step we'll handle after the dev window works.

For now, focus on `npm run tauri:dev`.

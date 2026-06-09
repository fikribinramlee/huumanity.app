@AGENTS.md

# huu — project context for Claude

## Project overview

**huu** is an AI text rewriter that makes AI-generated copy sound more human. It has two surfaces:

1. **Web app** — landing page with an in-browser scratchpad selector (highlight text → yellow button → tone popup → rewrite).
2. **Desktop app (macOS)** — Tauri app that watches for text selections anywhere on the desktop (TextEdit, Chrome, WhatsApp, etc.), shows a floating yellow selector button, rewrites via the same API, and either pastes back (`Accept`) or copies (`Copy`).

The product goal is a Wispr Flow–style universal desktop rewriter with Clerk auth, platform-aware download CTAs, and a real `.dmg` install flow.

**Bundle ID:** `com.huumanity.huu`  
**Product name:** `huu`  
**Installed path:** `/Applications/huu.app`

---

## Tech stack

### Frontend (web + desktop UI)
| Layer | Technology | Version / notes |
|-------|-----------|---------------|
| Framework | Next.js (App Router) | 16.2.6 — **breaking changes vs older Next**; read `node_modules/next/dist/docs/` before changing routing/APIs |
| UI | React | 19.2.4 |
| Styling | Tailwind CSS v4 | via `@tailwindcss/postcss` |
| Fonts | Young Serif + Nunito | loaded in `app/layout.tsx` |
| Auth | Clerk (`@clerk/nextjs`) | sign-in/sign-up, middleware protection |
| Desktop bridge | `@tauri-apps/api` | `invoke()` for Rust commands |

### Backend / API
| Layer | Technology | Notes |
|-------|-----------|-------|
| Rewrite API | `app/api/humanize/route.ts` | Anthropic Claude via `@anthropic-ai/sdk` |
| Auth on API | Clerk `auth()` | usage limits for signed-in users |
| CORS | `OPTIONS` + `Access-Control-Allow-Origin: *` | required for packaged Tauri app calling hosted API |

### Desktop (native)
| Layer | Technology | Notes |
|-------|-----------|-------|
| Shell | Tauri 2 | `src-tauri/` |
| Language | Rust 2021 | `src-tauri/src/lib.rs` |
| Clipboard | `arboard` | read/write clipboard |
| Keyboard sim | `enigo` | Cmd+C / Cmd+V on macOS |
| Accessibility | `core-foundation`, `core-graphics` | macOS AX APIs for selection detection |
| Transparent overlay | `macos-private-api` feature | selector floating window |

### Tooling
- **ESLint** — `eslint.config.mjs`, `npm run lint`
- **TypeScript** — `tsconfig.json`
- **Tauri CLI** — `@tauri-apps/cli` 2.11.2
- **Desktop build script** — `scripts/build-tauri-frontend.mjs` copies Next prerender output to `out/`

### Environment variables (`.env.local`)
| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Claude API for `/api/humanize` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` | Clerk auth |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` / `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/sign-in`, `/sign-up` |
| `NEXT_PUBLIC_CLERK_*_FALLBACK_REDIRECT_URL` | redirect to `/download` after auth |
| `NEXT_PUBLIC_DOWNLOAD_URL` | DMG URL for download page (e.g. `/downloads/huu-v0.1.0.dmg`) |
| `NEXT_PUBLIC_HUMANIZE_API_URL` | desktop rewrite endpoint; `https://huumanity.app/api/humanize` (production) or `http://localhost:3000/api/humanize` for local testing |

---

## Folder structure

```
ai-humanizer/
├── app/                          # Next.js App Router
│   ├── page.tsx                  # Landing page + in-browser selector demo
│   ├── layout.tsx                # Root layout, ClerkProvider, fonts
│   ├── globals.css               # Tailwind v4 theme, .huu-shimmer, selection color
│   ├── api/humanize/route.ts     # Rewrite API (Anthropic + CORS + usage limits)
│   ├── components/
│   │   ├── ScratchpadEditor.tsx  # In-app scratchpad selector (website + editor)
│   │   └── ExternalRewritePanel.tsx  # Fallback rewrite panel for captured external text
│   ├── editor/page.tsx           # Desktop app home + onboarding + selector health
│   ├── selector/page.tsx         # Transparent floating selector window UI
│   ├── download/
│   │   ├── page.tsx              # Download page (server component)
│   │   └── DownloadPageClient.tsx # Auto-download + install steps + manual fallback
│   ├── sign-in/[[...sign-in]]/page.tsx
│   └── sign-up/[[...sign-up]]/page.tsx
├── src-tauri/                    # Tauri / Rust native layer
│   ├── src/
│   │   ├── main.rs               # Entry point
│   │   └── lib.rs                # All Tauri commands, selection watcher, macOS AX
│   ├── Cargo.toml                # Rust deps (huu crate)
│   ├── tauri.conf.json           # App config, bundle ID, windows, build commands
│   ├── capabilities/default.json # Permissions for main + selector windows
│   └── icons/                    # App icons (.icns, .png, etc.)
├── scripts/
│   └── build-tauri-frontend.mjs  # Copies `.next/` prerendered HTML → `out/` for Tauri
├── public/
│   └── downloads/
│       └── huu-v0.1.0.dmg        # Real desktop installer (~70MB)
├── docs/
│   ├── TAURI_STEP_1.md           # Rust / Xcode setup guide
│   └── TAURI_STEP_2.md           # Tauri integration notes
├── proxy.ts                      # Clerk middleware (public routes list)
├── next.config.ts
├── package.json                  # npm scripts
├── AGENTS.md                     # Next.js 16 agent rules (referenced above)
└── CLAUDE.md                     # This file
```

**Tauri build output (not in repo):**
- `out/` — static frontend dist consumed by Tauri (`frontendDist` in `tauri.conf.json`)
- `src-tauri/target/release/bundle/macos/huu.app`
- `src-tauri/target/release/bundle/dmg/huu_0.1.0_aarch64.dmg`

**Runtime logs:**
- `/tmp/huu-selector.log` — native selection watcher debug log

---

## What's been built so far

### Web app (`app/page.tsx`)
- Landing page with hero, pricing, FAQ, etc.
- In-browser text selection → yellow floating button → 4 tone buttons (Humanize, Unpolished, Controversial, Direct)
- Popup stages: `select` → `loading` → `result` with Back, Copy, and tone caching (`generatedSignature`)
- Platform-aware download CTAs (macOS / Windows / Linux) with Apple logo on Mac
- Clerk `SignUpButton` / `SignInButton` with `forceRedirectUrl="/download"`
- Signed-in users go directly to `/download`

### Rewrite API (`app/api/humanize/route.ts`)
- POST endpoint calling Anthropic with detailed anti-AI prompt rules
- Four tone instructions: Humanize, Unpolished, Controversial, Direct
- Clerk auth + free usage limits (`FREE_LIMIT = 8`)
- CORS headers for desktop app cross-origin requests
- `OPTIONS` handler for preflight

### Auth & routing (`proxy.ts`, `app/layout.tsx`)
- Clerk middleware protects non-public routes
- Public routes: `/`, `/download`, `/downloads/*`, `/editor`, `/selector`, `/sign-in`, `/sign-up`, `/api/humanize`
- Sign-up/sign-in fallback redirects to `/download`

### Download flow (`app/download/`)
- Auto-download DMG on page load (Wispr Flow style)
- 3-step install instructions (open DMG → drag to Applications → open huu)
- Manual "Download Here" fallback button
- DMG served from `public/downloads/huu-v0.1.0.dmg`

### Desktop app — editor (`app/editor/page.tsx`)
- First-run onboarding (3 steps): allow Accessibility → test selection → finish setup
- `localStorage` key `huu_desktop_setup_complete` tracks setup completion
- Main editor shell with sidebar nav (Home, Scratchpad, etc.)
- **Selector health card** showing:
  - Accessibility: Allowed / Blocked
  - Watcher: Running / Not running
  - Selection: detected / not detected
  - Mode: Text box (Copy + Accept) vs Read-only (Copy only)
  - API: Connected / Disconnected
- "Fix Accessibility" button opens System Settings
- Fallback "Try it out" / `capture_selected_text` for manual capture

### Desktop app — floating selector (`app/selector/page.tsx`)
- Transparent always-on-top Tauri window (`selector`)
- Collapsed: yellow circular button
- Expanded: tone selection popup matching website UX
- Result actions depend on `canReplace`:
  - **Editable text box:** Back + Copy + Accept
  - **Read-only selection:** Back + Copy only (no Accept)
- API URL resolution: `NEXT_PUBLIC_HUMANIZE_API_URL` → localhost fallback for Tauri origin
- Tone caching via `generatedSignature`
- Close on outside click / blur

### Native layer (`src-tauri/src/lib.rs`)
**Tauri commands exposed to frontend:**
| Command | Purpose |
|---------|---------|
| `capture_selected_text` | Cmd+C clipboard capture fallback |
| `paste_text` | Set clipboard + Cmd+V |
| `paste_text_into_source` | Hide selector, activate source app by PID, then paste |
| `check_accessibility_permission` | Returns bool |
| `request_accessibility_permission` | Prompt macOS trust dialog |
| `open_accessibility_settings` | Opens System Settings → Accessibility |
| `get_current_selection` | Live AX selection probe |
| `get_selector_payload` | Last stored selection for selector UI |
| `get_selector_health` | Diagnostics struct for health card |
| `show_selector_window` | Position + show yellow button |
| `expand_selector_window` | Expand to full popup |
| `hide_selector_window` | Hide selector overlay |

**Background selection watcher:**
- Thread polls every 350ms via `platform_current_selection_probe()`
- On new selection, calls `show_selector_for_selection()`
- Logs to `/tmp/huu-selector.log`

**macOS Accessibility module (`mod macos_accessibility`):**
- `AXSelectedText`, `AXBoundsForRange`, element tree walk (depth 3, up to 80 children)
- `can_replace_selection()` — checks `AXEditable` or role (`AXTextArea`, `AXTextField`, etc.)
- `DesktopSelection` includes `sourcePid` and `canReplace`
- Selector window: `visible_on_all_workspaces`, `always_on_top`, transparent

### Desktop build pipeline
- `npm run build:tauri-frontend` → Next build + `scripts/build-tauri-frontend.mjs` → `out/`
- `npm run tauri:build` → produces `.app` + `.dmg`
- Post-install codesign: `codesign --force --deep --sign - --identifier "com.huumanity.huu" /Applications/huu.app`

---

## Current active task and status

### Active: macOS Accessibility trust for desktop selector

**Goal:** Yellow selector button appears when user highlights text in any app.

**Status:** Code is complete and app is rebuilt/installed. Blocked on macOS TCC (Transparency, Consent, and Control) — the native log shows `accessibility not trusted` until the user manually enables huu in System Settings.

**What works:**
- Selector health card in `app/editor/page.tsx` surfaces the exact failure reason
- Watcher starts on app launch
- App signed with stable identifier `com.huumanity.huu`
- DMG updated at `public/downloads/huu-v0.1.0.dmg`

**What the user must do (cannot be automated):**
1. System Settings → Privacy & Security → Accessibility
2. Enable `/Applications/huu.app` (not a DMG copy or build folder copy)
3. If broken after rebuild: `tccutil reset Accessibility com.huumanity.huu` then re-enable
4. Confirm health card shows **Accessibility: Allowed** before testing TextEdit

**Recently completed in this task:**
- Selector health check UI + `get_selector_health` command
- Dual selection modes (`canReplace` / copy-only vs Accept)
- Accept paste fix via `paste_text_into_source` (activate source PID before paste)
- Rebuild + reinstall + DMG update

---

## Conventions and patterns

### Next.js
- App Router only (`app/` directory); no `pages/` router
- Read `node_modules/next/dist/docs/` before assuming Next.js APIs — this is v16 with breaking changes
- Client components use `"use client"` directive
- Prefer `next/link` over `<a>` for internal navigation
- `proxy.ts` is the Clerk middleware file (not `middleware.ts`)

### UI / design
- Brand yellow: `#fff700` (Tailwind: `bg-[#fff700]`, `border-[#fff700]`)
- Display font: `.font-display` (Young Serif)
- Body font: Nunito via `--font-nunito`
- Popup pattern: `PopupStage = "select" | "loading" | "result"`
- Tones constant: `["Humanize", "Unpolished", "Controversial", "Direct"]`
- Loading state uses `.huu-shimmer` class from `app/globals.css`
- Buttons: rounded-full, font-black/bold, black + yellow contrast

### Selector / rewrite logic
- Tone caching: `generatedSignature = \`${text}\n---huu-tones---\n${tones.join("|")}\`` — skip API call if unchanged
- `closePopup` / `resetPopup` as function declarations (not const arrows) to avoid ESLint hoisting errors
- Defer `setState` in effects via `setTimeout(..., 0)` where React compiler complains

### Desktop / Tauri
- Rust structs use `#[serde(rename_all = "camelCase")]` — frontend uses camelCase (`sourcePid`, `canReplace`)
- All native commands registered in `invoke_handler` in `src-tauri/src/lib.rs`
- Selector window label: `"selector"` — must be in `src-tauri/capabilities/default.json`
- API calls from desktop: use `NEXT_PUBLIC_HUMANIZE_API_URL` (baked in at build time)
- Local dev: run `npm run dev:desktop` (port 3000) alongside `npm run tauri:dev`

### Auth / download
- New users: sign up → `/download` (via `forceRedirectUrl` and `fallbackRedirectUrl`)
- Signed-in users: download button → `/download` directly
- Download page auto-triggers download via hidden `<a>` click

### Git / commits
- Only commit when explicitly asked
- Do not commit `.env.local` or secrets

---

## What needs to be done next

### Immediate (blocking desktop selector)
1. **User re-enables Accessibility** for `/Applications/huu.app` and verifies health card
2. **Real-world selector testing** across apps: TextEdit (editable), Safari/Chrome (read-only copy-only), WhatsApp, full-screen TextEdit
3. **Fix download filename mismatch** — `app/download/page.tsx` still references `huu-v1.mvp.dmg` but actual file is `public/downloads/huu-v0.1.0.dmg` and `.env.local` points to `huu-v0.1.0.dmg`

### Short-term product
4. **Production API URL** — set `NEXT_PUBLIC_HUMANIZE_API_URL` to deployed domain before shipping desktop builds to real users (currently `http://localhost:3000/api/humanize`)
5. **Deploy website** — so desktop app and download page work without local dev server
6. **Improve read-only selection detection** — verify `can_replace_selection()` works across browsers, PDFs, static text; may need clipboard fallback for apps that don't expose AX selection
7. **Global keyboard shortcut** — e.g. Option+H as alternative trigger (mentioned in early spec, not yet implemented)

### Distribution / signing
8. **Apple Developer ID signing + notarization** — stops Accessibility trust being revoked on every ad-hoc rebuild; required for production distribution outside dev
9. **Automate post-build codesign** in build script or CI
10. **Windows / Linux builds** — CTAs exist on website but native selector is macOS-only

### App features (not yet built)
11. Editor sidebar items (Rewrites, History, Presets, Style) are UI placeholders only
12. Usage tracking / Pro tier — "5 rewrites left" is static UI
13. Clerk auth inside desktop app (currently editor is public route)
14. Auto-update mechanism for desktop app

---

## Key commands

```bash
# Web dev
npm run dev

# Web + desktop dev (Next on :3000 + Tauri hot reload)
npm run tauri:dev

# Build desktop frontend only
npm run build:tauri-frontend

# Full desktop production build (.app + .dmg)
npm run tauri:build

# Lint
npm run lint

# Install built app to Applications
ditto src-tauri/target/release/bundle/macos/huu.app /Applications/huu.app
codesign --force --deep --sign - --identifier "com.huumanity.huu" /Applications/huu.app

# Reset Accessibility trust (after rebuild)
tccutil reset Accessibility com.huumanity.huu

# Check selector log
tail -f /tmp/huu-selector.log
```

---

## Known issues

| Issue | Detail |
|-------|--------|
| Accessibility trust lost on rebuild | Ad-hoc signed builds change hash; macOS revokes TCC. Fix: Developer ID signing or re-enable after each install |
| Download page filename drift | `app/download/page.tsx` `DOWNLOAD_FILE` may not match `public/downloads/` or `.env.local` |
| Desktop API requires local server | Without production `NEXT_PUBLIC_HUMANIZE_API_URL`, packaged app needs `npm run dev:desktop` running |
| `ExternalRewritePanel` uses `/api/humanize` | Works in dev/Tauri with local server; won't work in fully offline packaged mode without env var |
| Editor polling duplicates watcher | `app/editor/page.tsx` has its own 500ms `show_selector_window` poll in addition to Rust watcher — redundant but harmless |

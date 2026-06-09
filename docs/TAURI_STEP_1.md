# Step 1 — Install Rust and Tauri prerequisites (macOS)

You are on a Mac. Tauri needs **Rust**, **Xcode Command Line Tools**, and a few system libraries before we can add Tauri to this project.

Rust is **not installed yet** on your machine — that's normal. Follow these steps in order.

---

## 1. Install Xcode Command Line Tools

Open **Terminal** and run:

```bash
xcode-select --install
```

A popup will appear. Click **Install** and wait until it finishes (can take 5–15 minutes).

Verify it worked:

```bash
xcode-select -p
```

You should see something like:

```
/Applications/Xcode.app/Contents/Developer
```

or

```
/Library/Developer/CommandLineTools
```

---

## 2. Install Rust

Run the official installer:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

When prompted, press **1** (default install).

Then reload your shell so `cargo` and `rustc` are on your PATH:

```bash
source "$HOME/.cargo/env"
```

Verify:

```bash
rustc --version
cargo --version
```

You should see version numbers (e.g. `rustc 1.xx.x`).

---

## 3. Install Tauri system dependencies (macOS)

Tauri on Mac also needs a few native tools. Install Homebrew first if you don't have it:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Then install the libraries Tauri expects:

```bash
brew install libappindicator openssl
```

> **Note:** On Apple Silicon Macs, Homebrew may ask you to add it to your PATH. Follow the instructions it prints in the terminal.

---

## 4. Quick checklist

Run all of these. Every command should succeed:

```bash
xcode-select -p
rustc --version
cargo --version
node --version
npm --version
```

You already have Node.js (this Next.js project uses it). Once all checks pass, you're ready for **Step 2: Add Tauri to the project**.

---

## 5. What we built on the website (already done)

While you install Rust, the web app now has:

- **`/download`** — Wispr Flow–style download page
- **Auto-download** — starts `huu-v0.1.0.dmg` when the page loads
- **Sign up / sign in** — both redirect to `/download` after auth
- **All download CTAs** — point to `/download`

Placeholder file lives at:

```
public/downloads/huu-v0.1.0.dmg
```

Replace this with your real Tauri `.dmg` build when Step 3 is done.

---

## Troubleshooting

| Problem | Fix |
|--------|-----|
| `command not found: rustc` | Run `source "$HOME/.cargo/env"` or open a new terminal |
| `xcode-select: error` | Run `xcode-select --install` again |
| Homebrew not found | Install from https://brew.sh |
| Download page doesn't auto-download | Check `NEXT_PUBLIC_DOWNLOAD_URL` in `.env.local` |

---

## Next step

When Step 1 is complete, tell me and we'll do **Step 2: Add Tauri to your existing Next.js project** and **Step 3: Open a desktop window showing your app**.

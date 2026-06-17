import type { Metadata } from "next";
import { DownloadPageClient } from "./DownloadPageClient";

export const metadata: Metadata = {
  title: "Download huumanity desktop app",
  description:
    "Download the huumanity desktop app and humanize text anywhere on your computer.",
};

// Fallback URLs: kept in sync with the version in src-tauri/tauri.conf.json.
// The client component also fetches the GitHub API on mount to resolve the
// real latest URLs, so stale fallbacks only matter if GitHub API is down.
// When bumping the app version, update both filenames here + tauri.conf.json.
const RELEASES_BASE =
  "https://github.com/fikribinramlee/huumanity.app/releases/download/v0.2.9";
const MAC_URL = `${RELEASES_BASE}/huumanity_0.2.9_aarch64.dmg`;
const WIN_URL = `${RELEASES_BASE}/huumanity_0.2.9_x64-setup.exe`;

// Static page: the OS is detected client-side (navigator.userAgent) so this
// route stays prerendered. The desktop app's Tauri build copies the prerendered
// download.html, so it must NOT become a dynamic (headers-based) route.
export default function DownloadPage() {
  return <DownloadPageClient macUrl={MAC_URL} winUrl={WIN_URL} />;
}

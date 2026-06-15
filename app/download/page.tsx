import type { Metadata } from "next";
import { DownloadPageClient } from "./DownloadPageClient";

export const metadata: Metadata = {
  title: "Download huumanity desktop app",
  description:
    "Download the huumanity desktop app and humanize text anywhere on your computer.",
};

// GitHub's `/releases/latest/download/<asset>` permalink ALWAYS resolves to the
// newest published (non-draft, non-prerelease) release's asset. As long as the
// internal app version (and therefore the asset filename) stays stable, these
// URLs auto-update the moment a new release goes live — no Vercel env-var edit,
// no redeploy needed per release. This is the permanent fix for the recurring
// "download page still serves the old version" problem.
//
// These are intentionally HARDCODED (not read from Vercel env vars): the old
// NEXT_PUBLIC_DOWNLOAD_URL_* vars are pinned to a specific tag and would shadow
// this auto-updating permalink. To pin a version in future, edit these two lines.
const RELEASES_BASE =
  "https://github.com/fikribinramlee/huumanity.app/releases/latest/download";
const MAC_URL = `${RELEASES_BASE}/huumanity_0.1.0_aarch64.dmg`;
const WIN_URL = `${RELEASES_BASE}/huumanity_0.1.0_x64-setup.exe`;

// Static page: the OS is detected client-side (navigator.userAgent) so this
// route stays prerendered. The desktop app's Tauri build copies the prerendered
// download.html, so it must NOT become a dynamic (headers-based) route.
export default function DownloadPage() {
  return <DownloadPageClient macUrl={MAC_URL} winUrl={WIN_URL} />;
}

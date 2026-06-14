import type { Metadata } from "next";
import { DownloadPageClient } from "./DownloadPageClient";

export const metadata: Metadata = {
  title: "Download huumanity desktop app",
  description:
    "Download the huumanity desktop app and humanize text anywhere on your computer.",
};

// Set these in Vercel → Settings → Environment Variables after each release.
//   NEXT_PUBLIC_DOWNLOAD_URL_MAC  → GitHub Release .dmg URL
//   NEXT_PUBLIC_DOWNLOAD_URL_WIN  → GitHub Release .exe URL (NSIS installer)
// NEXT_PUBLIC_DOWNLOAD_URL is kept as a legacy fallback for the Mac build.
const MAC_URL =
  process.env.NEXT_PUBLIC_DOWNLOAD_URL_MAC ??
  process.env.NEXT_PUBLIC_DOWNLOAD_URL ??
  "";
const WIN_URL = process.env.NEXT_PUBLIC_DOWNLOAD_URL_WIN ?? "";

// Static page: the OS is detected client-side (navigator.userAgent) so this
// route stays prerendered. The desktop app's Tauri build copies the prerendered
// download.html, so it must NOT become a dynamic (headers-based) route.
export default function DownloadPage() {
  return <DownloadPageClient macUrl={MAC_URL} winUrl={WIN_URL} />;
}

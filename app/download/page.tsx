import type { Metadata } from "next";
import { DownloadPageClient } from "./DownloadPageClient";

export const metadata: Metadata = {
  title: "Download huumanity desktop app",
  description:
    "Download the huumanity desktop app and humanize text anywhere on your Mac.",
};

// The DMG is too large for Vercel's static file limit (~100 MB compressed).
// It must be hosted on GitHub Releases (or R2/S3).
// Set NEXT_PUBLIC_DOWNLOAD_URL in Vercel dashboard → Settings → Environment Variables
// to the GitHub Release asset download URL, e.g.:
//   https://github.com/fikribinramlee/huumanity.app/releases/download/v0.1.0/huumanity_0.1.0_aarch64.dmg
const DOWNLOAD_FILE = "huu-mac.dmg";
const DOWNLOAD_URL = process.env.NEXT_PUBLIC_DOWNLOAD_URL ?? "";

export default function DownloadPage() {
  return (
    <DownloadPageClient
      downloadUrl={DOWNLOAD_URL}
      downloadFileName={DOWNLOAD_FILE}
    />
  );
}

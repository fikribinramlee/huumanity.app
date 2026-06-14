import { headers } from "next/headers";
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
const MAC_URL = process.env.NEXT_PUBLIC_DOWNLOAD_URL_MAC ?? process.env.NEXT_PUBLIC_DOWNLOAD_URL ?? "";
const WIN_URL = process.env.NEXT_PUBLIC_DOWNLOAD_URL_WIN ?? "";

function detectOS(ua: string): "mac" | "windows" | "other" {
  const u = ua.toLowerCase();
  if (u.includes("windows")) return "windows";
  if (u.includes("mac")) return "mac";
  return "other";
}

export default async function DownloadPage() {
  const headersList = await headers();
  const ua = headersList.get("user-agent") ?? "";
  const os = detectOS(ua);

  const downloadUrl = os === "windows" ? WIN_URL : MAC_URL;
  const downloadFileName =
    os === "windows" ? "huu-setup.exe" : "huu-mac.dmg";

  return (
    <DownloadPageClient
      downloadUrl={downloadUrl}
      downloadFileName={downloadFileName}
      detectedOs={os}
    />
  );
}

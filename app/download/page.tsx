import type { Metadata } from "next";
import { DownloadPageClient } from "./DownloadPageClient";

export const metadata: Metadata = {
  title: "Download huumanity desktop app",
  description:
    "Download the huumanity desktop app and humanize text anywhere on your Mac.",
};

const DOWNLOAD_FILE = "huu-v1.mvp.dmg";
const DOWNLOAD_URL =
  process.env.NEXT_PUBLIC_DOWNLOAD_URL ?? `/downloads/${DOWNLOAD_FILE}`;

export default function DownloadPage() {
  return (
    <DownloadPageClient
      downloadUrl={DOWNLOAD_URL}
      downloadFileName={DOWNLOAD_FILE}
    />
  );
}

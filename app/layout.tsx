import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Huumanity — make AI copy sound human",
  description:
    "Select any text. Pick a tone. Watch your AI copy and outreach sound human.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${geistSans.variable} antialiased`}>
      <body className="min-h-screen bg-[#f5f5f4] text-black">{children}</body>
    </html>
  );
}

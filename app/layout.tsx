import type { Metadata } from "next";
import { Young_Serif, Jost, Caveat } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const youngSerif = Young_Serif({
  variable: "--font-young-serif",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

const jost = Jost({
  variable: "--font-nunito",
  subsets: ["latin"],
  display: "swap",
});

const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "huumanity: make your AI copy sound human",
  description:
    "Select any text. Pick a style. Watch it sound human. Built for cold outreach, posts, and scripts.",
};

// Preconnect to Clerk's API and CDN so the browser starts the DNS + TLS
// handshake immediately on any page load, not just when the SignIn component
// mounts. Saves 300–600ms on the sign-in / sign-up flow.
export const viewport = {
  width: "device-width",
  initialScale: 1,
};

// Inject <link rel="preconnect"> into every page's <head>.
// Next.js reads this from metadata.other or from a head export — the simplest
// way for App Router is to add it directly in the layout's <head>.
function PreconnectHints() {
  return (
    <>
      <link rel="preconnect" href="https://clerk.huumanity.app" />
      <link rel="preconnect" href="https://img.clerk.com" />
      <link rel="dns-prefetch" href="https://accounts.google.com" />
    </>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${youngSerif.variable} ${jost.variable} ${caveat.variable} antialiased`}
    >
      <head>
        <PreconnectHints />
      </head>
      <body className="min-h-screen bg-white text-black">
        <ClerkProvider
          signInFallbackRedirectUrl="/download"
          signUpForceRedirectUrl="/download"
        >
          {children}
          <Analytics />
        </ClerkProvider>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Young_Serif, Nunito, Caveat } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

const youngSerif = Young_Serif({
  variable: "--font-young-serif",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

const nunito = Nunito({
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${youngSerif.variable} ${nunito.variable} ${caveat.variable} antialiased`}
    >
      <body className="min-h-screen bg-white text-black">
        <ClerkProvider
          signInFallbackRedirectUrl="/download"
          signUpFallbackRedirectUrl="/download"
        >
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}

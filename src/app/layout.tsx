import type { Metadata } from "next";
import { Barlow, Crimson_Text, Dancing_Script, Inter } from "next/font/google";
import "./globals.css";
import WebPhoneProvider from "@/components/webphone/WebPhone";
import SyncProvider from "@/lib/sync/SyncProvider";
import { ParseJobsProvider } from "@/lib/parseJobs/ParseJobsProvider";

/** Load fonts via next/font (self-hosted) so a blocked Google Fonts @import can’t nuke the whole CSS bundle. */
const barlow = Barlow({
  subsets: ["latin"],
  variable: "--font-barlow",
  weight: ["400", "500", "700"],
  display: "swap",
});

const crimsonText = Crimson_Text({
  subsets: ["latin"],
  variable: "--font-crimson",
  weight: ["400", "700"],
  display: "swap",
});

const dancingScript = Dancing_Script({
  subsets: ["latin"],
  variable: "--font-dancing",
  weight: ["400", "700"],
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Gostwrk.io",
  description: "Minimalist anti-CRM for individual salespeople",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${barlow.variable} ${crimsonText.variable} ${dancingScript.variable} ${inter.variable} font-sans antialiased`}
      >
        <SyncProvider>
          <ParseJobsProvider>
            <WebPhoneProvider>{children}</WebPhoneProvider>
          </ParseJobsProvider>
        </SyncProvider>
      </body>
    </html>
  );
}

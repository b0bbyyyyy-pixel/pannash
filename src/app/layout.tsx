import type { Metadata } from "next";
import { Barlow, Crimson_Text, Dancing_Script, Inter, Roboto_Mono } from "next/font/google";
import "./globals.css";
import WebPhoneProvider from "@/components/webphone/WebPhone";
import SmsDripProcessor from "@/components/SmsDripProcessor";

/** Load fonts via next/font (self-hosted) so a blocked Google Fonts @import can’t nuke the whole CSS bundle. */
const barlow = Barlow({
  subsets: ["latin"],
  variable: "--font-barlow",
  weight: ["400", "500", "700"],
});

const crimsonText = Crimson_Text({
  subsets: ["latin"],
  variable: "--font-crimson",
  weight: ["400", "700"],
});

const dancingScript = Dancing_Script({
  subsets: ["latin"],
  variable: "--font-dancing",
  weight: ["400", "700"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const robotoMono = Roboto_Mono({
  subsets: ["latin"],
  variable: "--font-roboto-mono",
  weight: ["400", "700"],
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
        className={`${barlow.variable} ${crimsonText.variable} ${dancingScript.variable} ${inter.variable} ${robotoMono.variable} font-sans antialiased`}
      >
        <SmsDripProcessor />
        <WebPhoneProvider>{children}</WebPhoneProvider>
      </body>
    </html>
  );
}

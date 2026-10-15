import type { Metadata, Viewport } from "next";
import { Nunito, Vazirmatn } from "next/font/google";
import { Toaster } from "@/components/ui/toaster";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

const vazirmatn = Vazirmatn({
  variable: "--font-vazirmatn",
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "oniLibrary — Your stories. In one place.",
  description:
    "oniLibrary is a modern reader for manga, manhwa, webtoons, comics, PDFs and e-books. More sources. More stories.",
  applicationName: "oniLibrary",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/logo-mark.svg",
    apple: "/logo-mark.svg",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "oniLibrary",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#f7f1e8",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${nunito.variable} ${vazirmatn.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}

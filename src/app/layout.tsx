import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const description =
  "Compares utilities' public construction plans and flags where their work overlaps in space, time and resources.";

export const metadata: Metadata = {
  metadataBase: new URL("https://beforewebuildlets.compare"),
  title: "GridSync · Utility construction coordination",
  description,
  alternates: { canonical: "/" },
  openGraph: { url: "/", siteName: "GridSync", title: "GridSync", description },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="h-full overflow-hidden">{children}</body>
    </html>
  );
}

import localFont from "next/font/local";
import "./globals.css";

// Self-hosted so `next build` never fetches from Google Fonts.
const inter = localFont({ src: "./fonts/inter-latin.woff2", weight: "400 700", display: "swap" });

export const metadata = {
  title: "CueFX",
  description: "Clip, cue, and stand-in editor",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="dark">
      <body className={inter.className}>{children}</body>
    </html>
  );
}

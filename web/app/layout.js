import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap" });

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

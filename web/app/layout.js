import localFont from "next/font/local";
import "./globals.css";

// Inter: one family for the UI and the headings. Self-hosted so
// `next build` never fetches from Google Fonts.
const inter = localFont({ src: "./fonts/inter-latin.woff2", weight: "100 900", variable: "--font-ui", display: "swap" });

export const metadata = {
  title: "CueFX · Make the effect follow the move",
  description: "Directed VFX on your own footage. CueFX tracks the body, you draw where the effect goes, ComfyUI and LTX render it.",
  openGraph: {
    title: "CueFX",
    description: "Directed VFX on your own footage. CueFX tracks the body, you draw where the effect goes, ComfyUI and LTX render it.",
    images: ["/cuefx-social.png"],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="dark" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}

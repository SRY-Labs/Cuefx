import localFont from "next/font/local";
import "./globals.css";

// VestraPath type system: Outfit for UI and body, Plus Jakarta Sans for the single display role.
// Self-hosted so `next build` never fetches from Google Fonts.
const outfit = localFont({ src: "./fonts/outfit-latin.woff2", weight: "400 600", variable: "--font-ui", display: "swap" });
const jakarta = localFont({ src: "./fonts/plus-jakarta-sans-latin-700.woff2", weight: "700", variable: "--font-display", display: "swap" });

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
    <html lang="en" data-theme="dark" className={`${outfit.variable} ${jakarta.variable}`}>
      <body>{children}</body>
    </html>
  );
}

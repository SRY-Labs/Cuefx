import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: root,
  devIndicators: false,
  experimental: { proxyTimeout: 300_000 },
  async rewrites() {
    const api = process.env.CUEFX_API_ORIGIN || "https://cuefx-app.graypond-7635469c.southindia.azurecontainerapps.io" || "http://127.0.0.1:8000";
    return [{ source: "/api/v1/:path*", destination: `${api}/api/v1/:path*` }];
  },
};

export default nextConfig;

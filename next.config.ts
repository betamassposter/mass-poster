import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for Docker. Outputs `.next/standalone/server.js`
  // that runs without needing the full node_modules tree.
  output: "standalone",
  // ffmpeg-static, fluent-ffmpeg, and playwright ship native binaries — keep
  // them as external so Next doesn't try to bundle them client-side.
  serverExternalPackages: ["ffmpeg-static", "fluent-ffmpeg", "playwright"],
};

export default nextConfig;

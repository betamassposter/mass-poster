import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for Docker. Outputs `.next/standalone/server.js`
  // that runs without needing the full node_modules tree.
  output: "standalone",
  // ffmpeg-static, fluent-ffmpeg, and playwright ship native binaries — keep
  // them as external so Next doesn't try to bundle them client-side.
  // proxy-chain + socks-proxy-agent use raw net sockets / http internals
  // that Turbopack can't safely tree-shake; bundle them externally too or
  // the in-process SOCKS5→HTTP bridge breaks at runtime.
  serverExternalPackages: [
    "ffmpeg-static",
    "fluent-ffmpeg",
    "playwright",
    "playwright-core",
    "proxy-chain",
    "socks-proxy-agent",
    "socks",
  ],
};

export default nextConfig;

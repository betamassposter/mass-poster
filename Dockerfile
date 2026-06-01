# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────
# Mass Poster — production Docker image for Render / Fly.io
#
# Base: Playwright official image (Ubuntu Noble + Chromium 1.60.0 + all
# system deps for headless Chrome). Adds FFmpeg + DejaVu fonts on top.
# Builds Next.js, runs in production mode.
#
# Expected build time on Render free tier: ~5-8 min first time, ~2 min
# subsequent (cached layers).
# ─────────────────────────────────────────────────────────────

FROM mcr.microsoft.com/playwright:v1.60.0-noble AS base

# Add FFmpeg + brand-consistent fonts (DejaVu Sans Bold used by our
# burn-subtitles + drawtext pipeline) on top of the Playwright base.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg \
      fonts-dejavu \
      fonts-noto-color-emoji \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Enable pnpm (corepack ships with Node ≥16). Pin to the same major as local
# to avoid lockfile drift.
RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

# ─────────────────────────────────────────────────────────────
# Stage: deps — install node_modules with deterministic lockfile
# ─────────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Skip lifecycle scripts (esbuild postinstall, sharp build) — they auto-run
# at first import and we don't need them at install time.
RUN pnpm install --frozen-lockfile --ignore-scripts

# ─────────────────────────────────────────────────────────────
# Stage: build — produce .next + standalone server
# ─────────────────────────────────────────────────────────────
FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Build-time Supabase env: the build inlines NEXT_PUBLIC_* vars into client
# bundles. Render injects them via UI before build runs.
RUN pnpm build

# ─────────────────────────────────────────────────────────────
# Stage: runtime — slimmer image that just runs the server
# ─────────────────────────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

WORKDIR /app

# Next.js standalone output (set in next.config.ts) bundles only the modules
# the server actually imports + a minimal server.js. Pair it with .next/static
# and public/.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

# Standalone's pruned node_modules misses Playwright runtime files
# (browsers.json + Chromium driver). Copy the FULL node_modules from build
# so the browserleaks IP gate can launch headless Chrome through the
# Multilogin SOCKS5 proxy at validation time. Image bloats ~1GB but it's
# the reliable fix vs fighting Next.js outputFileTracingIncludes globs.
COPY --from=build /app/node_modules ./node_modules

# Copy migrations + scripts so the running container can apply pending DB
# changes via `pnpm db:apply` (needs SUPABASE_DB_PASSWORD env at run time).
COPY --from=build /app/supabase ./supabase
COPY --from=build /app/scripts ./scripts

# Playwright also needs its browser binaries (downloaded by the Playwright
# base image during the deps stage). Carry them over too.
COPY --from=build /ms-playwright /ms-playwright
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

EXPOSE 3000

# The standalone bundle's entry is server.js next to .next/standalone root.
CMD ["node", "server.js"]

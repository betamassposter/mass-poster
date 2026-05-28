# Mass Poster

SaaS interno multi-tenant per generare contenuti short-form con AI e pubblicarli in massa su social (IG, TikTok, YouTube Shorts, X, LinkedIn) da N account farmati, drenando traffico verso qualsiasi offer.

## Documentazione

Le specs prodotto vivono nel vault Obsidian sorella:
- `../Mass Poster/SPECS/` — product overview, architettura, data model, tech stack, roadmap
- `../Mass Poster/98-docs-pdf/` — i 4 PDF strategici di riferimento

Quando lavori sul codice, parti da `../Mass Poster/SPECS/04-roadmap.md` per capire a che blocco siamo.

## Stack

- **Next.js 16** (App Router) + TypeScript + Tailwind v4 + Turbopack
- **Supabase** (Postgres + Auth magic-link + Storage + Realtime)
- **Anthropic Claude Sonnet 4.6** (text gen) · **FAL.AI Kling 2.5** (video gen) · **ElevenLabs Turbo v2.5** (voice gen)
- **AdsPower** (antidetect browser, scelto vs Multilogin per mobile fingerprinting + free tier + price) · **iProyal/Soax** (residential proxy)
- **Zernio** (posting, abstraction-ready) · **Browser-Use Cloud** (signup automation, futuro)
- **ForwardEmail** + **Cloudflare** (email factory, futuro)
- **PostHog** (analytics, futuro) · **Sentry** (errors, futuro)
- **FFmpeg 6** static binary (no Docker)

## Struttura

```
src/
├── app/
│   ├── (auth)
│   │   ├── login/                Magic-link form
│   │   └── auth/{send,callback,logout}
│   ├── api/
│   │   ├── content/generate      Claude pipeline
│   │   ├── account/create        Orchestrator
│   │   ├── proxy/rent            Mock-rent
│   │   └── tracking-link/create
│   ├── l/[slug]/                 Bridge redirect (public)
│   ├── accounts/                 Account farm UI
│   ├── links/                    Tracking links UI
│   ├── brands/[slug]/            Brand detail + generate
│   ├── login/                    Login page
│   └── page.tsx                  Home + KPI
├── lib/
│   ├── ai/                       Claude provider + content pipeline
│   ├── voice/                    ElevenLabs provider + clone + TTS
│   ├── video-gen/                FAL Kling provider
│   ├── video/                    FFmpeg editor (concat+audio+overlay+export)
│   ├── accounts/                 AdsPower wrapper + orchestrator + proxy pool
│   ├── posting/                  Zernio adapter + scheduler
│   ├── analytics/                Tracking links + UTM
│   ├── auth/                     Session helpers (RLS-aware)
│   ├── brand/                    Brand config Zod schema + repository
│   ├── db/                       Supabase clients (server, admin, workspace)
│   ├── reel-pipeline.ts          End-to-end orchestrator: idea→video→voice→edit
│   └── env.ts                    Zod-validated env vars
├── middleware.ts                 Auth gate (everything except /login, /auth, /l)
supabase/
├── migrations/                   10 SQL migrations
└── seed.sql                      Workspace seed
scripts/                          22 CLI tools (db, brand, content, video, voice, reel, account, post, auth)
```

## Setup locale

```bash
pnpm install

# .env.local already populated with Supabase + provider keys.
# Add your keys when ready:
#   ANTHROPIC_API_KEY (key OK, balance needs topup)
#   FAL_KEY (key OK, balance needs topup)
#   ELEVENLABS_API_KEY (LIVE on free tier)
#   ZERNIO_API_KEY (when you get it)

# Apply DB migrations (one-off, requires SUPABASE_DB_PASSWORD)
SUPABASE_DB_PASSWORD='your-pwd' pnpm db:apply

# Seed the brand
pnpm brand:seed

# Invite yourself
pnpm auth:invite your@email.com

# Start dev
pnpm dev               # → localhost:3000 (or first free port)
# Sign in at /login with the email above (magic link in inbox)
```

## CLI (22 comandi)

### Database
```
pnpm db:apply       # Apply pending SQL migrations
pnpm db:verify      # Healthcheck + row counts
```

### Brand
```
pnpm brand:seed     # Seed Maplo brand
pnpm brand:test     # Verify Zod schema roundtrip
```

### Content
```
pnpm content:gen <brand-slug> [count] [platform]   # Claude → N ideas → DB
```

### Video editing
```
pnpm video:test                       # Sintetico FFmpeg test
pnpm video-gen:test [prompt]          # FAL Kling video gen
pnpm voice:test [text] [voice]        # ElevenLabs TTS
pnpm voice:list                       # List ElevenLabs voices
pnpm voice:clone <name> <sample.mp3>  # Instant voice clone
pnpm reel:gen [brand] [count] [platform]  # Full E2E: idea→video→voice→edit
```

### Account farm
```
pnpm account:health             # AdsPower app reachable?
pnpm account:proxies <count>    # Rent N mock proxies
pnpm account:create <platform>  # Create 1 account (proxy + AdsPower profile)
pnpm account:list               # All accounts
pnpm account:start <id>         # Open browser
```

### Posting
```
pnpm post:schedule <content_id> <account_id> [min_from_now]
pnpm post:tick                  # Process due posts
pnpm post:list
```

### Auth
```
pnpm auth:invite <email>        # Attach to workspace + create user
```

## Stato (2026-05-28)

| Blocco | Status | Note |
|---|---|---|
| 0 Specs + scaffold | ✅ | Next.js 16 + Supabase + Tailwind v4 |
| 1 DB schema | ✅ | 18 tabelle live + RLS |
| 2 Brand config | ✅ | Zod schema + Maplo seedato |
| 4 Account orchestrator | ✅ | AdsPower wrapper + proxy pool |
| 5a Text pipeline | ✅ | Claude Sonnet 4.6 + caching 1h TTL |
| 5b FAL video | 🟡 | Engine ready, balance topup needed |
| 5c ElevenLabs voice | ✅ | LIVE su free tier |
| 5d Pipeline E2E reel | ✅ | idea→video→voice→edit in 1.5s con mock |
| 6 FFmpeg editor | ✅ | 9:16 + drawtext + audio ducking |
| 7 Posting + scheduler | ✅ | Mock LIVE, Zernio engine ready |
| 8 Bridge link analytics | ✅ | UTM + click counter |
| 10 Frontend dashboard | ✅ | 4 pagine + 5 API |
| 11 Auth magic link | ✅ | Middleware + login + invite CLI |
| 3 Email factory | ⏳ | Richiede acquisto 2 domini ~€20 |
| 9 Dogfood pilot | ⏳ | Quando tutto on |
| 12 Billing Stripe | ⏳ | Quando commercializzazione |

**Per dogfood live** (10 account che postano da soli): topup Claude $5 + FAL $5 + acquisto domini €20 + iProyal €60/mese = **€90 una tantum + €60/mese**.

Vedi `../Mass Poster/SPECS/04-roadmap.md` per roadmap completa.

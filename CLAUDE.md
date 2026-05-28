# CLAUDE.md — Mass Poster App

## Contesto rapido

Questo repo è il **codice** del prodotto **Mass Poster** (SaaS interno multi-tenant).
La documentazione strategica/prodotto vive nel vault Obsidian sorella `../Mass Poster/`.

Prima di scrivere codice, leggi sempre in ordine:
1. `../Mass Poster/SPECS/04-roadmap.md` — qual è il blocco corrente
2. `../Mass Poster/SPECS/01-architecture.md` — dove vive il componente che stai modificando
3. `../Mass Poster/SPECS/02-data-model.md` — quando tocchi DB

## Convenzioni

- **Multi-tenant**: ogni query SU TABELLE TENANT (`brand`, `account`, `content`, `post`, …) DEVE filtrare per `workspace_id`. Usa sempre RLS-aware client (`getSupabaseServer()`), NON service role salvo che in worker.
- **API routes**: validare input con Zod prima di toccare il DB.
- **Provider AI/posting**: passano sempre attraverso l'interfaccia in `src/lib/{ai,posting}/`. NON chiamare SDK direttamente dalle route.
- **Env vars**: leggi via `src/lib/env.ts` (Zod-parsed). NON `process.env.X` sparso nel codice.
- **Costi**: ogni provider call DEVE loggare `cost_eur` su `content.generation_meta` o equivalente.
- **Job lunghi (>10s)**: metti in queue, mai sync.

## Stack scelto

Vedi `../Mass Poster/SPECS/03-tech-stack.md`. Sintesi:
- Next.js 16 + Supabase + Tailwind v4 + Inngest (TBD Blocco 7)
- FFmpeg worker headless su Fly.io (separato)
- Provider abstraction per swap futuri

## Cose da NON fare

- ❌ Hardcoded brand voice o offer — tutto da `brand_config` JSON
- ❌ Chiamare provider AI dal client (browser) — sempre server-side
- ❌ Salvare API key dei provider in chiaro su DB — usa Supabase Vault
- ❌ Posting senza tracking link UTM-tagged
- ❌ Aprire account senza warmup 7gg (anche programmatico)

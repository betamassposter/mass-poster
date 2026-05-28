#!/usr/bin/env node
/**
 * Seed: crea il brand di test "Maplo AI" + 1 offer primary nel workspace
 * di Daniele. Idempotente (usa upsertBySlug).
 *
 * Uso: pnpm brand:seed
 */

import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(__dirname, '..', '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const WORKSPACE_ID = '11111111-1111-1111-1111-111111111111';

const brandPayload = {
  workspace_id: WORKSPACE_ID,
  slug: 'maplo',
  name: 'Maplo',
  niche: 'B2B lead generation for web agencies, freelancers & closers (Italy-first)',
  voice_config: {
    tone: 'edgy',
    formality: 2,
    pov: 'second',
    emoji_policy: 'sparse',
    vocab_pref: [
      'dream outcome',
      'proof stack',
      'no AI-slop',
      'real quotes',
      'closer',
      'in 60 seconds',
      'all-in-one',
      'agency-grade',
    ],
    banned_words: [
      'amazing',
      'game-changer',
      'revolutionize',
      'synergy',
      'leverage',
      'unleash',
      'best-in-class',
    ],
    signature_phrases: [
      "Stop wasting hours on Maps.",
      "Scrape, score, send — done.",
      "Lead in, deal out.",
      "From CSV limbo to closed deals.",
    ],
    answers: {
      what_we_sell:
        'AI-powered lead engine: scrape Google Maps in real-time + personalized outreach (WhatsApp, Email, LinkedIn) + CRM kanban — all in one app.',
      who_we_help:
        'Web agency founders (1-3 ppl, €50-300k), freelance designers/devs (Italy), and senior B2B closers selling to local SMBs.',
      what_we_believe:
        'Personalization at scale beats spray-and-pray; quality lead filters beat database size; one tool beats five.',
      what_we_hate:
        'AI-slop messages, generic CSV exports, tool stacks costing €267/mese for what should be one app.',
      tone_in_3_words: 'sharp, blunt, builder-first',
      what_we_never_say:
        'fluffy marketing buzzwords; never promise "infinite leads"; never imitate ChatGPT-style copy',
      reference_brand: 'Alex Hormozi / Acquisition.com (dream-outcome framework)',
      anti_reference_brand: 'Apollo (too generic, too global, too SaaS-bloat)',
      taboo_topics: 'politics, religion, get-rich-quick',
      humor_level: 'dry sarcasm, mostly serious',
      preferred_format: 'short reels with rapid hook + concrete proof + clear CTA',
      catchphrases: 'In 60 seconds; No AI-slop; Stop the CSV limbo',
    },
  },
  target_personas: [
    {
      name: 'Mario, Web Agency Founder',
      role: 'Owner / Founder',
      company_size: '1-10',
      industry: 'Web design / SMMA',
      age_range: '30-45',
      pain_points: [
        '10-15 ore a settimana di prospecting manuale su Google Maps',
        'Stack di 5 tool (Apollo+Outscraper+Lemlist+Hunter+Notion) a €267/mese',
        'Lead di qualità bassa: tante demo, poche chiusure',
        'CSV limbo tra tool diversi, dati si perdono',
      ],
      desires: [
        'Pipeline costante senza dover prospettare manualmente',
        'Lead "ready to buy" (no sito, sito vecchio, builder rilevato)',
        'Outreach personalizzato senza scrivere 200 messaggi diversi',
        'Workflow unico dalla scoperta alla chiusura',
      ],
      triggers: [
        'Vedere demo da 60 secondi',
        'Comparison con costi attuali del loro stack',
        'Garanzia 30 giorni money-back',
      ],
      objections: [
        '"Sembra troppo bello per essere vero"',
        '"Posso farlo gratis con Outscraper"',
        '"Già uso Apollo"',
      ],
      platforms_active_on: ['instagram', 'tiktok', 'linkedin', 'x'],
    },
    {
      name: 'Luca, Freelance Designer/Dev',
      role: 'Solopreneur',
      company_size: 'Solo',
      industry: 'Web design / dev freelance',
      age_range: '25-40',
      pain_points: [
        'Pipeline incostante (mesi pieni, mesi vuoti)',
        'Più tempo a cercare clienti che a lavorare',
        'Difficoltà a scalare oltre 3-4 progetti/mese',
      ],
      desires: [
        'Trovare 5-10 lead qualificati al mese senza time-sink',
        'Outreach che converte senza fare il commerciale',
        'Strumento "agency-grade" senza prezzo agency',
      ],
      triggers: [
        'Free tier (100 lead) senza carta',
        '"Built for solopreneurs like you"',
      ],
      objections: [
        '"€99/mese è troppo per un freelance"',
        '"Funziona davvero per chi vende design?"',
      ],
      platforms_active_on: ['instagram', 'tiktok', 'x', 'linkedin'],
    },
    {
      name: 'Carlo, B2B Closer/Setter',
      role: 'Senior Closer',
      company_size: '11-50',
      industry: 'B2B sales (high-ticket)',
      age_range: '25-40',
      pain_points: [
        'Le liste fornite sono di bassa qualità (lead freddi)',
        'Personalizzazione a scala richiede ore o team junior',
        'Niente tracking unificato tra outreach e CRM',
      ],
      desires: [
        'Lead filtrati per "ready to buy" signals',
        'Messaggi AI personalizzati che NON sembrano AI',
        'Dashboard unica con metriche di chiusura',
      ],
      triggers: [
        'Proof stack con quote di altri closer',
        'Esempio reale di messaggio personalizzato vs generico',
      ],
      objections: [
        '"AI message = spam"',
        '"Già abbiamo Lemlist"',
      ],
      platforms_active_on: ['linkedin', 'x', 'instagram'],
    },
  ],
  default_platforms: ['instagram', 'tiktok', 'youtube_shorts', 'linkedin', 'x'],
  status: 'active',
};

const offerPayload = {
  workspace_id: WORKSPACE_ID,
  type: 'saas',
  name: 'Maplo Hunter (€99/mese)',
  url: 'https://trymaplo.com',
  tracking_base_url: 'https://trymaplo.com',
  pitch_1_sentence:
    "Trova 1.000+ attività locali senza sito (o con sito obsoleto) in 60 secondi e invia messaggi personalizzati AI su WhatsApp, Email e LinkedIn — tutto in un'unica app.",
  pitch_3_sentences:
    "Agenzie e freelance perdono 10-15 ore a settimana a cercare lead manualmente su Google Maps con uno stack di 5 tool a €267/mese. Maplo fa scrape real-time con filtri avanzati (no sito, sito vecchio, builder, SSL, rating) e genera messaggi AI che combaciano col contesto tecnico del prospect senza odorare di automation. Risultato: lead qualificati → outreach personalizzata → CRM kanban → chiusure tracciabili, a €99/mese.",
  pitch_1_paragraph:
    "Maplo è il primo \"AI Lead Engine\" pensato per chi vende a PMI locali italiane (e globali). In 60 secondi puoi: 1) scrappare Google Maps con filtri tecnici (sito assente, sito obsoleto, builder rilevato, SSL, performance, rating, review), 2) generare messaggi personalizzati AI che NON sembrano AI-slop, 3) inviare su WhatsApp/Email/LinkedIn dallo stesso pannello, 4) gestire tutto in un CRM kanban a 5 stage. Sostituisce Apollo+Outscraper+Lemlist+Hunter+Notion. Garanzia 30 giorni money-back unconditional, free tier 100 lead/mese senza carta.",
  cta_collection: [
    { label: 'Get started — 100 leads free', weight: 10 },
    { label: 'Start now', weight: 7 },
    { label: 'Watch 2-min demo', weight: 6 },
    { label: 'Try it free', weight: 5 },
    { label: 'Start saving today', weight: 4 },
  ],
  pricing_info: {
    starts_from_eur: 0,
    tier_labels: ['Free (100 lead)', 'Starter €39', 'Hunter €99', 'Scale €199'],
    has_free_tier: true,
    has_trial: true,
  },
  is_primary: true,
  active: true,
};

async function run() {
  console.log('🌱 Seeding Maplo brand…\n');

  // upsert brand by (workspace_id, slug)
  const { data: existingBrand } = await supabase
    .from('brand')
    .select('id')
    .eq('workspace_id', WORKSPACE_ID)
    .eq('slug', brandPayload.slug)
    .maybeSingle();

  let brandId;
  if (existingBrand) {
    console.log(`♻️  Brand "maplo" già esiste (${existingBrand.id}), update…`);
    const { error } = await supabase
      .from('brand')
      .update(brandPayload)
      .eq('id', existingBrand.id);
    if (error) throw new Error(`update brand: ${error.message}`);
    brandId = existingBrand.id;
  } else {
    const { data, error } = await supabase
      .from('brand')
      .insert(brandPayload)
      .select('id')
      .single();
    if (error) throw new Error(`insert brand: ${error.message}`);
    brandId = data.id;
    console.log(`✅ Brand creato: ${brandId}`);
  }

  // upsert primary offer
  const { data: existingOffer } = await supabase
    .from('offer')
    .select('id')
    .eq('workspace_id', WORKSPACE_ID)
    .eq('brand_id', brandId)
    .eq('is_primary', true)
    .maybeSingle();

  if (existingOffer) {
    console.log(`♻️  Offer primary esiste (${existingOffer.id}), update…`);
    const { error } = await supabase
      .from('offer')
      .update({ ...offerPayload, brand_id: brandId })
      .eq('id', existingOffer.id);
    if (error) throw new Error(`update offer: ${error.message}`);
  } else {
    const { data, error } = await supabase
      .from('offer')
      .insert({ ...offerPayload, brand_id: brandId })
      .select('id')
      .single();
    if (error) throw new Error(`insert offer: ${error.message}`);
    console.log(`✅ Offer creato: ${data.id}`);
  }

  console.log('\n🎉 Maplo brand seeded.');
}

run().catch((err) => {
  console.error('\n💥 Seed failed:', err);
  process.exit(1);
});

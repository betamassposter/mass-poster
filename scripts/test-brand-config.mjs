#!/usr/bin/env node
/**
 * Test: legge il brand "maplo" dal DB, lo valida contro lo Zod schema,
 * mostra summary leggibile.
 *
 * Verifica che:
 *  - il brand sia inseribile via service_role
 *  - il voice_config jsonb roundtrip correttamente
 *  - lo Zod schema validi il payload reale
 *
 * Uso: pnpm brand:test
 */

import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brandConfigSchema, offerSchema } from '../src/lib/brand/schema.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(__dirname, '..', '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const WORKSPACE_ID = '11111111-1111-1111-1111-111111111111';

console.log('🔍 Test brand config (load + validate)…\n');

const { data: brand, error } = await supabase
  .from('brand')
  .select('*')
  .eq('workspace_id', WORKSPACE_ID)
  .eq('slug', 'maplo')
  .single();

if (error || !brand) {
  console.error('❌ Brand "maplo" non trovato. Lancia prima `pnpm brand:seed`.');
  process.exit(1);
}

// Valida contro Zod schema
const validated = brandConfigSchema.parse({
  slug: brand.slug,
  name: brand.name,
  niche: brand.niche,
  voice_config: brand.voice_config,
  target_personas: brand.target_personas,
  default_platforms: brand.default_platforms,
  status: brand.status,
});

console.log('✅ Zod validation OK\n');
console.log('📋 Brand summary:');
console.log(`   Slug:       ${validated.slug}`);
console.log(`   Name:       ${validated.name}`);
console.log(`   Niche:      ${validated.niche}`);
console.log(`   Tone:       ${validated.voice_config.tone}`);
console.log(`   Platforms:  ${validated.default_platforms.join(', ')}`);
console.log(`   Personas:   ${validated.target_personas.length}`);
validated.target_personas.forEach((p, i) => {
  console.log(`     ${i + 1}. ${p.name} — ${p.role}`);
});
console.log(`   Banned:     ${validated.voice_config.banned_words.slice(0, 3).join(', ')}…`);
console.log(`   Status:     ${validated.status}`);

// Carica offers
const { data: offers, error: offersErr } = await supabase
  .from('offer')
  .select('*')
  .eq('brand_id', brand.id)
  .eq('workspace_id', WORKSPACE_ID);

if (offersErr) {
  console.error('❌ Errore lettura offers:', offersErr.message);
  process.exit(1);
}

console.log(`\n📦 Offers (${offers.length}):`);
for (const o of offers) {
  const validatedOffer = offerSchema.parse({
    type: o.type,
    name: o.name,
    url: o.url ?? undefined,
    tracking_base_url: o.tracking_base_url ?? undefined,
    pitch_1_sentence: o.pitch_1_sentence ?? undefined,
    pitch_3_sentences: o.pitch_3_sentences ?? undefined,
    pitch_1_paragraph: o.pitch_1_paragraph ?? undefined,
    cta_collection: o.cta_collection ?? [],
    pricing_info: o.pricing_info ?? {},
    is_primary: o.is_primary,
    active: o.active,
  });
  console.log(
    `   • ${validatedOffer.is_primary ? '⭐' : '  '} ${validatedOffer.name}`,
  );
  console.log(`     URL: ${validatedOffer.url}`);
  console.log(`     Pitch: ${validatedOffer.pitch_1_sentence?.slice(0, 80)}…`);
  console.log(
    `     CTAs (${validatedOffer.cta_collection.length}): ${validatedOffer.cta_collection
      .slice(0, 3)
      .map((c) => `"${c.label}"`)
      .join(', ')}…`,
  );
}

console.log('\n🎉 Brand config + offer validati. Pronto per pipeline AI (Blocco 5).');

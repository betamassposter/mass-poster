'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea, Select } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { ChevronRight, ChevronLeft, Sparkles, Mic, Users, Award, Check } from 'lucide-react';

const STEPS = [
  { id: 'identity', label: 'Identity', icon: Sparkles },
  { id: 'voice', label: 'Voice', icon: Mic },
  { id: 'personas', label: 'Personas', icon: Users },
  { id: 'offer', label: 'Offer', icon: Award },
];

interface Persona {
  name: string;
  role: string;
  pain_points: string;
  desires: string;
}

export function BrandCreatorWizard() {
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [isPending, startTransition] = useTransition();

  // Step 1 — Identity
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [niche, setNiche] = useState('');

  // Step 2 — Voice
  const [tone, setTone] = useState<'expert' | 'friendly' | 'edgy' | 'inspirational'>('edgy');
  const [vocabPref, setVocabPref] = useState('');
  const [bannedWords, setBannedWords] = useState('');
  const [signaturePhrases, setSignaturePhrases] = useState('');

  // Step 3 — Personas
  const [personas, setPersonas] = useState<Persona[]>([
    { name: '', role: '', pain_points: '', desires: '' },
  ]);

  // Step 4 — Offer
  const [offerName, setOfferName] = useState('');
  const [offerUrl, setOfferUrl] = useState('');
  const [pitch, setPitch] = useState('');
  const [ctas, setCtas] = useState('');

  const canNext = () => {
    if (step === 0) return name && slug && niche;
    if (step === 1) return tone;
    if (step === 2) return personas.some((p) => p.name && p.role);
    if (step === 3) return offerName;
    return false;
  };

  const submit = () => {
    startTransition(async () => {
      try {
        const res = await fetch('/api/brand', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slug,
            name,
            niche,
            voice_config: {
              tone,
              formality: 3,
              pov: 'second',
              emoji_policy: 'sparse',
              vocab_pref: vocabPref.split(',').map((s) => s.trim()).filter(Boolean),
              banned_words: bannedWords.split(',').map((s) => s.trim()).filter(Boolean),
              signature_phrases: signaturePhrases.split('|').map((s) => s.trim()).filter(Boolean),
              answers: {},
            },
            target_personas: personas
              .filter((p) => p.name && p.role)
              .map((p) => ({
                name: p.name,
                role: p.role,
                pain_points: p.pain_points.split(',').map((s) => s.trim()).filter(Boolean),
                desires: p.desires.split(',').map((s) => s.trim()).filter(Boolean),
                triggers: [],
                objections: [],
                platforms_active_on: [],
              })),
            default_platforms: ['instagram', 'tiktok'],
            status: 'draft',
            offer: {
              type: 'saas',
              name: offerName,
              url: offerUrl || undefined,
              pitch_1_sentence: pitch,
              cta_collection: ctas.split('|').map((s) => s.trim()).filter(Boolean).map((label) => ({ label, weight: 5 })),
              is_primary: true,
              active: true,
            },
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Request failed');
        toast.success('Brand created', `${name} is ready for content generation`);
        router.push(`/brands/${slug}`);
      } catch (e) {
        toast.error('Failed to create brand', (e as Error).message);
      }
    });
  };

  return (
    <div className="max-w-3xl">
      {/* Stepper */}
      <div className="flex items-center mb-8">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const isDone = i < step;
          const isActive = i === step;
          return (
            <div key={s.id} className="flex items-center flex-1 last:flex-none">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => i <= step && setStep(i)}
                  disabled={i > step}
                  className={`
                    h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all
                    ${
                      isDone
                        ? 'bg-[color:var(--status-success)] text-bg-canvas'
                        : isActive
                          ? 'bg-[color:var(--accent)] text-bg-canvas'
                          : 'bg-bg-elevated text-text-muted border border-border-subtle'
                    }
                  `}
                >
                  {isDone ? <Check size={14} /> : <Icon size={14} />}
                </button>
                <span
                  className={`text-[12px] font-medium ${
                    isActive ? 'text-text-primary' : 'text-text-muted'
                  }`}
                >
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`flex-1 h-px mx-3 ${i < step ? 'bg-[color:var(--status-success)]' : 'bg-border-subtle'}`}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="surface-card p-6">
        {step === 0 && (
          <div className="space-y-5">
            <Field label="Brand name" required hint="Display name (e.g. 'Maplo', 'Acme Sales')">
              <Input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!slug) setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
                }}
                placeholder="Maplo"
              />
            </Field>
            <Field label="Slug" required hint="Used in URLs and DB queries (lowercase, dashes only)">
              <Input
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="maplo"
                className="font-mono"
              />
            </Field>
            <Field label="Niche" required hint="What this brand is about — used to inform AI content generation">
              <Textarea
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                placeholder="B2B lead generation for web agencies, freelancers & closers (Italy-first)"
                rows={3}
              />
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <Field label="Tone" required>
              <Select value={tone} onChange={(e) => setTone(e.target.value as typeof tone)}>
                <option value="edgy">Edgy — provocative, no-bullshit, opinionated</option>
                <option value="expert">Expert — authoritative, data-driven, precise</option>
                <option value="friendly">Friendly — conversational, warm, second-person</option>
                <option value="inspirational">Inspirational — storytelling, motivating</option>
              </Select>
            </Field>
            <Field label="Preferred vocabulary" hint="Comma-separated. AI will favor these words.">
              <Input value={vocabPref} onChange={(e) => setVocabPref(e.target.value)} placeholder="dream outcome, proof stack, no AI-slop, agency-grade" />
            </Field>
            <Field label="Banned words" hint="Comma-separated. AI will never use these.">
              <Input
                value={bannedWords}
                onChange={(e) => setBannedWords(e.target.value)}
                placeholder="amazing, game-changer, revolutionize, synergy, leverage"
              />
            </Field>
            <Field label="Signature phrases" hint="Pipe-separated (|). AI uses these occasionally as taglines.">
              <Input
                value={signaturePhrases}
                onChange={(e) => setSignaturePhrases(e.target.value)}
                placeholder="Stop wasting hours on Maps. | Lead in, deal out."
              />
            </Field>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            {personas.map((p, i) => (
              <div key={i} className="surface-elevated rounded-lg p-4 relative">
                {personas.length > 1 && (
                  <button
                    onClick={() => setPersonas((prev) => prev.filter((_, idx) => idx !== i))}
                    className="absolute top-3 right-3 text-text-muted hover:text-[color:var(--status-danger)] text-xs"
                  >
                    Remove
                  </button>
                )}
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <Field label="Name" required>
                    <Input
                      value={p.name}
                      onChange={(e) =>
                        setPersonas((prev) => prev.map((x, idx) => (idx === i ? { ...x, name: e.target.value } : x)))
                      }
                      placeholder="Mario, Web Agency Founder"
                    />
                  </Field>
                  <Field label="Role" required>
                    <Input
                      value={p.role}
                      onChange={(e) =>
                        setPersonas((prev) => prev.map((x, idx) => (idx === i ? { ...x, role: e.target.value } : x)))
                      }
                      placeholder="Owner / Founder"
                    />
                  </Field>
                </div>
                <Field label="Pain points" hint="Comma-separated">
                  <Input
                    value={p.pain_points}
                    onChange={(e) =>
                      setPersonas((prev) => prev.map((x, idx) => (idx === i ? { ...x, pain_points: e.target.value } : x)))
                    }
                    placeholder="10-15h/week manually scraping Maps, fragmented tool stack..."
                  />
                </Field>
                <div className="mt-3">
                  <Field label="Desires" hint="Comma-separated">
                    <Input
                      value={p.desires}
                      onChange={(e) =>
                        setPersonas((prev) => prev.map((x, idx) => (idx === i ? { ...x, desires: e.target.value } : x)))
                      }
                      placeholder="Pipeline costante, lead qualificati, workflow unico..."
                    />
                  </Field>
                </div>
              </div>
            ))}
            <button
              onClick={() => setPersonas((prev) => [...prev, { name: '', role: '', pain_points: '', desires: '' }])}
              className="
                w-full p-3 rounded-md border border-dashed border-border-default
                text-text-muted hover:text-[color:var(--accent)] hover:border-[color:var(--accent)]/50
                transition-colors text-sm
              "
            >
              + Add another persona
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <Field label="Offer name" required hint="What you're selling (or promoting)">
              <Input value={offerName} onChange={(e) => setOfferName(e.target.value)} placeholder="Maplo Hunter (€99/month)" />
            </Field>
            <Field label="Offer URL" hint="Where Mass Poster will direct traffic">
              <Input type="url" value={offerUrl} onChange={(e) => setOfferUrl(e.target.value)} placeholder="https://trymaplo.com" />
            </Field>
            <Field label="One-sentence pitch" required hint="The hook for your reels — what your product does in 1 sentence">
              <Textarea
                value={pitch}
                onChange={(e) => setPitch(e.target.value)}
                rows={3}
                placeholder="Find 1,000+ local businesses without a website in 60 seconds and send personalized AI messages — all in one app."
              />
            </Field>
            <Field label="CTAs" required hint="Pipe-separated (|). These are rotated across reels.">
              <Input
                value={ctas}
                onChange={(e) => setCtas(e.target.value)}
                placeholder="Get started — 100 leads free | Watch 2-min demo | Try it free"
              />
            </Field>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mt-6">
        <Button
          variant="ghost"
          icon={<ChevronLeft size={13} />}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0 || isPending}
        >
          Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button
            variant="accent"
            iconRight={<ChevronRight size={13} />}
            onClick={() => setStep((s) => s + 1)}
            disabled={!canNext()}
          >
            Next
          </Button>
        ) : (
          <Button variant="accent" onClick={submit} loading={isPending} disabled={!canNext()}>
            Create brand
          </Button>
        )}
      </div>
    </div>
  );
}

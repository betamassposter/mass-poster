'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import { Tabs } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import {
  Building2,
  CreditCard,
  Bell,
  Sparkles,
  Users,
  Webhook,
  KeyRound,
  ExternalLink,
} from 'lucide-react';

interface Workspace {
  id: string;
  name: string;
  plan: string;
  monthly_budget_eur: number;
  settings: Record<string, unknown> | null;
}

interface Brand {
  id: string;
  slug: string;
  name: string;
  niche: string | null;
  status: string;
  created_at: string;
}

const TABS = [
  { id: 'workspace', label: 'Workspace', icon: Building2 },
  { id: 'brands', label: 'Brands', icon: Sparkles },
  { id: 'team', label: 'Team', icon: Users },
  { id: 'billing', label: 'Billing', icon: CreditCard },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'developer', label: 'Developer', icon: Webhook },
];

export function SettingsTabs({
  initialTab,
  workspace,
  memberCount,
  brandCount,
  currentUserEmail,
  brands,
}: {
  initialTab: string;
  workspace: Workspace | null;
  memberCount: number;
  brandCount: number;
  currentUserEmail: string;
  brands: Brand[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const active = TABS.some((t) => t.id === initialTab) ? initialTab : 'workspace';

  const setActive = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', id);
    router.push(`?${params.toString()}`);
  };

  return (
    <div className="space-y-6">
      <Tabs tabs={TABS} active={active} onChange={setActive} />

      {active === 'workspace' && <WorkspaceTab workspace={workspace} />}
      {active === 'brands' && <BrandsTab brands={brands} brandCount={brandCount} />}
      {active === 'team' && <TeamTab memberCount={memberCount} currentUserEmail={currentUserEmail} />}
      {active === 'billing' && <BillingTab workspace={workspace} />}
      {active === 'notifications' && <NotificationsTab />}
      {active === 'developer' && <DeveloperTab />}
    </div>
  );
}

function WorkspaceTab({ workspace }: { workspace: Workspace | null }) {
  const toast = useToast();
  const [name, setName] = useState(workspace?.name ?? '');
  const [budget, setBudget] = useState(workspace?.monthly_budget_eur ?? 250);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/workspace', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, monthly_budget_eur: Number(budget) }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      toast.success('Workspace updated');
    } catch (e) {
      toast.error('Save failed', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard title="Workspace identity" description="The name appears in the sidebar + on shared links.">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
        <Field label="Workspace name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Workspace ID" hint="Used for support tickets">
          <Input value={workspace?.id ?? ''} disabled className="font-mono text-[12px]" />
        </Field>
        <Field label="Monthly budget cap" hint="EUR — pipeline aborts AI calls past this">
          <Input type="number" value={budget} onChange={(e) => setBudget(Number(e.target.value))} />
        </Field>
        <Field label="Current plan">
          <Input value={workspace?.plan ?? 'internal'} disabled className="font-mono uppercase text-[12px]" />
        </Field>
      </div>
      <div className="mt-5 flex justify-end">
        <Button onClick={save} variant="accent" loading={busy}>
          Save changes
        </Button>
      </div>
    </SectionCard>
  );
}

function BrandsTab({ brands, brandCount }: { brands: Brand[]; brandCount: number }) {
  return (
    <SectionCard
      title="Brands"
      description="Each brand is a creative unit with its own voice, personas, and content stream."
      action={
        <Link
          href="/brands/new"
          className="inline-flex h-8 items-center px-3 rounded-md bg-[color:var(--accent)] text-bg-canvas text-[12px] font-medium hover:bg-[color:var(--accent-strong)] transition-colors"
        >
          New brand
        </Link>
      }
    >
      {brandCount === 0 ? (
        <p className="text-sm text-text-muted py-4">No brands yet. Click <strong>New brand</strong> to create one.</p>
      ) : (
        <div className="divide-y divide-border-subtle">
          {brands.map((b) => (
            <div key={b.id} className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <div
                  className="h-9 w-9 rounded-md flex items-center justify-center font-bold text-sm text-bg-canvas"
                  style={{ background: 'var(--lime)' }}
                >
                  {b.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <Link
                    href={`/brands/${b.slug}`}
                    className="text-[13px] font-medium hover:text-[color:var(--accent)] transition-colors"
                  >
                    {b.name}
                  </Link>
                  <div className="text-[11px] text-text-muted">/{b.slug} · {b.niche?.slice(0, 60) ?? 'No niche'}</div>
                </div>
              </div>
              <span
                className="text-[10px] uppercase tracking-wider font-medium px-2 py-0.5 rounded-full"
                style={{
                  color: b.status === 'active' ? 'var(--status-success)' : 'var(--text-muted)',
                  background: b.status === 'active' ? 'var(--status-success-bg)' : 'var(--bg-hover)',
                }}
              >
                {b.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function TeamTab({ memberCount, currentUserEmail }: { memberCount: number; currentUserEmail: string }) {
  return (
    <SectionCard
      title="Team members"
      description="Invite others to collaborate on this workspace. Multi-user mode is internal-only for now."
    >
      <div className="divide-y divide-border-subtle">
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-3">
            <div
              className="h-9 w-9 rounded-full flex items-center justify-center font-mono text-xs font-bold text-bg-canvas"
              style={{ background: 'var(--lime)' }}
            >
              {currentUserEmail.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <div className="text-[13px] font-medium">{currentUserEmail}</div>
              <div className="text-[11px] text-text-muted">You · joined first</div>
            </div>
          </div>
          <span className="text-[10px] uppercase tracking-wider font-medium text-[color:var(--accent)]">
            owner
          </span>
        </div>
      </div>
      <p className="text-xs text-text-muted mt-4">
        {memberCount} member{memberCount === 1 ? '' : 's'} total · invite flow opens with billing tier (coming with public launch).
      </p>
    </SectionCard>
  );
}

function BillingTab({ workspace }: { workspace: Workspace | null }) {
  return (
    <SectionCard
      title="Billing"
      description="Mass Poster runs in internal mode — no billing required. Stripe integration ships with public launch."
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="surface-elevated rounded-lg p-4">
          <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1">Plan</div>
          <div className="text-lg font-semibold capitalize">{workspace?.plan ?? 'internal'}</div>
          <div className="text-[11px] text-text-muted mt-1">No charges</div>
        </div>
        <div className="surface-elevated rounded-lg p-4">
          <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1">Monthly budget</div>
          <div className="text-lg font-semibold tabular-nums">€{workspace?.monthly_budget_eur ?? 250}</div>
          <div className="text-[11px] text-text-muted mt-1">Soft cap on AI spend</div>
        </div>
        <div className="surface-elevated rounded-lg p-4">
          <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1">Provider costs</div>
          <div className="text-lg font-semibold tabular-nums text-[color:var(--accent)]">via Claude · FAL · ElevenLabs</div>
          <div className="text-[11px] text-text-muted mt-1">Pay direct providers</div>
        </div>
      </div>
      <div className="mt-4 surface-elevated rounded-lg p-4 text-[12px] text-text-secondary leading-relaxed">
        <strong className="text-text-primary">Heads up:</strong> when launching publicly, Mass Poster will offer tiered
        billing ($97 Starter, $297 Pro, $697 Agency). Each tier bundles a generous monthly AI budget — overages billed to
        your card via Stripe. Current usage will count toward the new tier seamlessly.
      </div>
    </SectionCard>
  );
}

function NotificationsTab() {
  const [emailDigest, setEmailDigest] = useState(true);
  const [accountBan, setAccountBan] = useState(true);
  const [viral, setViral] = useState(true);
  const [postFailed, setPostFailed] = useState(false);

  return (
    <SectionCard
      title="Notification preferences"
      description="Choose which events trigger emails. Webhooks let you wire alerts elsewhere (see Developer tab)."
    >
      <div className="space-y-3 max-w-xl">
        <Toggle label="Weekly digest" description="Summary of posts, clicks, account health" value={emailDigest} onChange={setEmailDigest} />
        <Toggle label="Account banned" description="Get an email when one of your accounts gets banned" value={accountBan} onChange={setAccountBan} />
        <Toggle label="Viral velocity detected" description="A post is performing 5× baseline in first 6h" value={viral} onChange={setViral} />
        <Toggle label="Post failed (dead-letter)" description="A scheduled post exhausted all retries" value={postFailed} onChange={setPostFailed} />
      </div>
      <p className="text-xs text-text-faint mt-4">
        Email delivery is currently best-effort. For mission-critical alerts, use webhooks → Slack/Telegram/Discord.
      </p>
    </SectionCard>
  );
}

function DeveloperTab() {
  return (
    <SectionCard
      title="Developer tools"
      description="REST API, webhooks, signed payloads."
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Link
          href="/api-keys"
          className="surface-elevated rounded-lg p-4 hover:border-[color:var(--accent)]/40 transition-colors group"
        >
          <div className="flex items-start justify-between mb-2">
            <KeyRound size={16} className="text-[color:var(--accent)]" />
            <ExternalLink size={12} className="text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="text-sm font-semibold">API Keys</div>
          <div className="text-xs text-text-muted mt-1">Bearer tokens for /api/v1/*</div>
        </Link>
        <Link
          href="/webhooks"
          className="surface-elevated rounded-lg p-4 hover:border-[color:var(--accent)]/40 transition-colors group"
        >
          <div className="flex items-start justify-between mb-2">
            <Webhook size={16} className="text-[color:var(--accent)]" />
            <ExternalLink size={12} className="text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="text-sm font-semibold">Webhooks</div>
          <div className="text-xs text-text-muted mt-1">Outbound events with HMAC signature</div>
        </Link>
      </div>

      <div className="mt-6 surface-elevated rounded-lg p-4 font-mono text-[11px] text-text-muted overflow-x-auto">
        <p className="text-text-secondary mb-2 font-sans">Quickstart:</p>
        <pre>{`curl https://your-app/api/v1/content?brand=maplo \\
  -H "Authorization: Bearer mp_live_..." \\
  | jq .`}</pre>
      </div>
    </SectionCard>
  );
}

// ─── Helpers ───

function SectionCard({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="surface-card p-6">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="font-semibold">{title}</h2>
          {description && <p className="text-xs text-text-muted mt-1">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Toggle({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-4 cursor-pointer py-2">
      <div className="min-w-0">
        <div className="text-[13px] font-medium">{label}</div>
        {description && <div className="text-[11px] text-text-muted mt-0.5">{description}</div>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`
          relative inline-flex h-5 w-9 rounded-full transition-colors flex-shrink-0 mt-0.5
          ${value ? 'bg-[color:var(--accent)]' : 'bg-bg-active'}
        `}
        role="switch"
        aria-checked={value}
      >
        <span
          className={`
            inline-block h-4 w-4 rounded-full bg-white transition-transform absolute top-0.5
            ${value ? 'translate-x-[18px]' : 'translate-x-0.5'}
          `}
        />
      </button>
    </label>
  );
}

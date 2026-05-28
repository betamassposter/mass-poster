import type { SupabaseClient } from '@supabase/supabase-js';
import { getAntidetectProvider, getProxyProvider } from './client.ts';
import type {
  AccountStatus,
  CreateAccountRequest,
  CreateAccountResult,
  DeviceProfile,
  Platform,
} from './types.ts';

/**
 * Account orchestrator.
 *
 * Coordinates the antidetect (AdsPower) + proxy + DB to:
 *  - create an account row (status=creating)
 *  - assign a proxy from the pool
 *  - create a browser profile in AdsPower
 *  - link them on `account.adspower_profile_id` + `account.proxy_id`
 *  - update `account.status` through warmup → active → ban transitions
 *
 * Signup itself (filling forms on IG/TT) is NOT here — that comes from
 * Browser-Use Cloud in Blocco 7. This orchestrator just sets up the
 * infrastructure layer (profile + proxy ready to be driven).
 */

const DEVICE_FOR_PLATFORM: Record<Platform, DeviceProfile> = {
  instagram: 'mobile_ios',
  tiktok: 'mobile_ios',
  youtube_shorts: 'mobile_ios',
  x: 'desktop',
  linkedin: 'desktop',
  facebook: 'desktop',
};

export class AccountOrchestrator {
  private supabase: SupabaseClient;
  private workspaceId: string;

  constructor(supabase: SupabaseClient, workspaceId: string) {
    this.supabase = supabase;
    this.workspaceId = workspaceId;
  }

  /**
   * Provision the proxy pool from a provider (or skip if already done).
   * Rents N proxies and inserts into `proxy` table as status='available'.
   */
  async provisionProxyPool(count: number, country = 'IT') {
    const provider = getProxyProvider();
    const proxies = await provider.rentProxies(count, country);
    const rows = proxies.map((p) => ({
      workspace_id: this.workspaceId,
      provider: p.provider,
      host: p.host,
      port: p.port,
      username: p.username ?? null,
      password_encrypted: p.password ?? null, // TODO: encrypt with pgsodium when prod
      country: p.country ?? null,
      city: p.city ?? null,
      status: 'available' as const,
    }));
    const { data, error } = await this.supabase
      .from('proxy')
      .insert(rows)
      .select('id, host, port, country, status');
    if (error) throw new Error(`Failed to insert proxies: ${error.message}`);
    return data ?? [];
  }

  /**
   * Create an account end-to-end:
   *  1. pick an available proxy (or use provided one)
   *  2. insert `account` row with status='creating'
   *  3. create AdsPower profile bound to the proxy
   *  4. update `account` with adspower_profile_id, mark warmup-eligible
   */
  async createAccount(req: CreateAccountRequest): Promise<CreateAccountResult> {
    if (req.workspace_id !== this.workspaceId) {
      throw new Error('Workspace mismatch — orchestrator scoped to a single workspace');
    }
    const antidetect = await getAntidetectProvider();

    // 1) Pick proxy
    let proxyRow: {
      id: string;
      host: string;
      port: number;
      username: string | null;
      password_encrypted: string | null;
      country: string | null;
    } | null = null;

    if (req.proxy_id) {
      const { data, error } = await this.supabase
        .from('proxy')
        .select('id, host, port, username, password_encrypted, country, status')
        .eq('id', req.proxy_id)
        .eq('workspace_id', this.workspaceId)
        .single();
      if (error || !data) throw new Error(`Proxy ${req.proxy_id} not found`);
      if (data.status !== 'available') {
        throw new Error(`Proxy ${req.proxy_id} is ${data.status}, not available`);
      }
      proxyRow = data;
    } else {
      // Auto-pick first available proxy
      const { data, error } = await this.supabase
        .from('proxy')
        .select('id, host, port, username, password_encrypted, country, status')
        .eq('workspace_id', this.workspaceId)
        .eq('status', 'available')
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`Failed to query proxies: ${error.message}`);
      proxyRow = data; // may be null → account will be created without proxy (dev only)
    }

    // 2) Build handle
    const handle =
      req.handle_hint ??
      `${req.platform.slice(0, 2)}-${Math.random().toString(36).slice(2, 8)}`;

    // 3) Insert account row (status creating)
    const { data: accountRow, error: insErr } = await this.supabase
      .from('account')
      .insert({
        workspace_id: this.workspaceId,
        brand_id: req.brand_id,
        platform: req.platform,
        handle,
        proxy_id: proxyRow?.id ?? null,
        status: 'creating' as AccountStatus,
        origin: req.origin ?? 'manual',
        health_score: 100,
        daily_post_cap: 5,
      })
      .select('id')
      .single();
    if (insErr || !accountRow) {
      throw new Error(`Failed to insert account: ${insErr?.message ?? 'no row'}`);
    }
    const accountId = accountRow.id;

    // 4) Create AdsPower (or mock) profile
    const device = req.device ?? DEVICE_FOR_PLATFORM[req.platform];
    const profileName = `${req.platform}-${handle}`;
    const profile = await antidetect.createProfile({
      name: profileName,
      device,
      proxy: proxyRow
        ? {
            host: proxyRow.host,
            port: proxyRow.port,
            username: proxyRow.username ?? undefined,
            password: proxyRow.password_encrypted ?? undefined,
            type: 'http',
            country: proxyRow.country ?? req.country,
          }
        : undefined,
      open_url: this.signupUrlFor(req.platform),
      group: req.brand_id.slice(0, 8),
    });

    // 5) Mark proxy as in_use (if assigned)
    if (proxyRow) {
      await this.supabase
        .from('proxy')
        .update({ status: 'in_use', assigned_account_id: accountId })
        .eq('id', proxyRow.id)
        .eq('workspace_id', this.workspaceId);
    }

    // 6) Persist adspower_profile_id and log event
    await this.supabase
      .from('account')
      .update({ adspower_profile_id: profile.profile_id })
      .eq('id', accountId)
      .eq('workspace_id', this.workspaceId);

    await this.supabase.from('account_event').insert({
      account_id: accountId,
      workspace_id: this.workspaceId,
      event_type: 'profile_created',
      details: {
        provider: antidetect.name,
        profile_id: profile.profile_id,
        device,
        proxy_assigned: !!proxyRow,
      },
    });

    return {
      account_id: accountId,
      adspower_profile_id: profile.profile_id,
      proxy_id: proxyRow?.id ?? null,
      handle,
      status: 'creating',
    };
  }

  /** Open the browser for this account; returns WebDriver endpoint for Playwright/Puppeteer. */
  async startBrowser(account_id: string) {
    const { data: acct, error } = await this.supabase
      .from('account')
      .select('id, adspower_profile_id, platform, handle')
      .eq('id', account_id)
      .eq('workspace_id', this.workspaceId)
      .single();
    if (error || !acct) throw new Error(`Account ${account_id} not found`);
    if (!acct.adspower_profile_id) {
      throw new Error(`Account ${account_id} has no adspower_profile_id`);
    }
    const antidetect = await getAntidetectProvider();
    const browser = await antidetect.startBrowser(acct.adspower_profile_id);
    await this.supabase.from('account_event').insert({
      account_id,
      workspace_id: this.workspaceId,
      event_type: 'browser_started',
      details: { ws_endpoint: browser.ws_endpoint, pid: browser.pid },
    });
    return browser;
  }

  async stopBrowser(account_id: string) {
    const { data: acct } = await this.supabase
      .from('account')
      .select('adspower_profile_id')
      .eq('id', account_id)
      .eq('workspace_id', this.workspaceId)
      .single();
    if (!acct?.adspower_profile_id) return;
    const antidetect = await getAntidetectProvider();
    await antidetect.stopBrowser(acct.adspower_profile_id);
    await this.supabase.from('account_event').insert({
      account_id,
      workspace_id: this.workspaceId,
      event_type: 'browser_stopped',
      details: {},
    });
  }

  /** Mark transition to warmup phase (call when signup confirmed). */
  async markWarmup(account_id: string) {
    await this.supabase
      .from('account')
      .update({
        status: 'warmup' as AccountStatus,
        warmup_started_at: new Date().toISOString(),
      })
      .eq('id', account_id)
      .eq('workspace_id', this.workspaceId);
  }

  /** Mark transition to active (call after warmup completes — 7gg). */
  async markActive(account_id: string) {
    await this.supabase
      .from('account')
      .update({
        status: 'active' as AccountStatus,
        activated_at: new Date().toISOString(),
      })
      .eq('id', account_id)
      .eq('workspace_id', this.workspaceId);
  }

  /** Mark account as banned; free proxy back to the pool. */
  async markBanned(account_id: string, reason: string) {
    const { data: acct } = await this.supabase
      .from('account')
      .select('proxy_id')
      .eq('id', account_id)
      .eq('workspace_id', this.workspaceId)
      .single();

    await this.supabase
      .from('account')
      .update({
        status: 'banned' as AccountStatus,
        retired_at: new Date().toISOString(),
      })
      .eq('id', account_id)
      .eq('workspace_id', this.workspaceId);

    await this.supabase.from('account_event').insert({
      account_id,
      workspace_id: this.workspaceId,
      event_type: 'ban_detected',
      details: { reason },
    });

    // Mark proxy dead — burned IP, don't reassign
    if (acct?.proxy_id) {
      await this.supabase
        .from('proxy')
        .update({ status: 'dead', assigned_account_id: null })
        .eq('id', acct.proxy_id)
        .eq('workspace_id', this.workspaceId);
    }
  }

  /** Pick one healthy account for a brand+platform (round-robin by oldest activated). */
  async pickHealthyAccount(brand_id: string, platform: Platform) {
    const { data } = await this.supabase
      .from('account')
      .select('id, handle, daily_post_cap, health_score, activated_at')
      .eq('workspace_id', this.workspaceId)
      .eq('brand_id', brand_id)
      .eq('platform', platform)
      .eq('status', 'active')
      .order('activated_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    return data;
  }

  private signupUrlFor(platform: Platform): string {
    switch (platform) {
      case 'instagram':
        return 'https://www.instagram.com/accounts/emailsignup/';
      case 'tiktok':
        return 'https://www.tiktok.com/signup';
      case 'youtube_shorts':
        return 'https://accounts.google.com/signup';
      case 'x':
        return 'https://x.com/i/flow/signup';
      case 'linkedin':
        return 'https://www.linkedin.com/signup';
      case 'facebook':
        return 'https://www.facebook.com/r.php';
    }
  }
}

import type { SupabaseClient } from '@supabase/supabase-js';
import { getAntidetectProvider, getProxyProvider } from './client.ts';
import { ProxyValidator } from './proxy-validator.ts';
import { env } from '../env.ts';
import type {
  AccountStatus,
  CreateAccountRequest,
  CreateAccountResult,
  DeviceProfile,
  Platform,
  ProxyValidationVerdict,
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
   * Provision the proxy pool from a provider, then run the reputation gate
   * on each newly-allocated proxy. A proxy that fails validation is inserted
   * as `validation_status='dirty'` and excluded from auto-pick. Pass-through
   * UI / API can then trigger rotation.
   */
  async provisionProxyPool(count: number, country = 'IT') {
    const provider = getProxyProvider();
    const validator = new ProxyValidator();
    const proxies = await provider.rentProxies(count, country);

    const results: Array<{ id: string; validation: ProxyValidationVerdict }> = [];
    for (const p of proxies) {
      const verdict = await validator.validate(p, {
        expectedCountry: country,
        reason: 'initial_allocation',
        workspace_id: this.workspaceId,
      });

      const { data: row, error } = await this.supabase
        .from('proxy')
        .insert({
          workspace_id: this.workspaceId,
          provider: p.provider,
          proxy_type: 'mobile',
          host: p.host,
          port: p.port,
          username: p.username ?? null,
          password_encrypted: p.password ?? null,
          country: p.country ?? null,
          city: p.city ?? null,
          status: 'available',
          validation_status: verdict.status,
          last_validated_at: verdict.checked_at,
          last_validation_summary: {
            clean: verdict.clean,
            ip: verdict.ip,
            failure_reasons: verdict.failure_reasons,
            providers: verdict.results.map((r) => ({
              provider: r.provider,
              clean: r.clean,
              score: r.score,
            })),
          },
          ip_address: verdict.ip,
        })
        .select('id')
        .single();
      if (error || !row) throw new Error(`Failed to insert proxy: ${error?.message}`);

      // Persist the full validation result
      await this.supabase.from('proxy_validation_check').insert({
        workspace_id: this.workspaceId,
        proxy_id: row.id,
        verdict: verdict.status,
        ip_address: verdict.ip,
        results: verdict.results,
        reason: 'initial_allocation',
        duration_ms: verdict.duration_ms,
      });

      results.push({ id: row.id, validation: verdict });
    }
    return results;
  }

  /** Re-run reputation validation on a specific proxy and persist the verdict. */
  async validateProxy(
    proxy_id: string,
    reason: string = 'manual',
  ): Promise<ProxyValidationVerdict> {
    const { data: row, error } = await this.supabase
      .from('proxy')
      .select('id, host, port, username, password_encrypted, country, provider')
      .eq('id', proxy_id)
      .eq('workspace_id', this.workspaceId)
      .single();
    if (error || !row) throw new Error(`Proxy ${proxy_id} not found`);

    const validator = new ProxyValidator();
    // Provider-specific protocol: Multilogin Mobile Proxies are SOCKS5
    // (verified 2026-06-01 — gate.multilogin.com:1080 socks5). HTTP is the
    // fallback for legacy providers (iProyal etc.).
    const proxyProtocol = row.provider === 'multilogin' ? 'socks5' : 'http';
    const verdict = await validator.validate(
      {
        host: row.host,
        port: row.port,
        username: row.username ?? undefined,
        password: row.password_encrypted ?? undefined,
        type: proxyProtocol,
        country: row.country ?? undefined,
        provider: row.provider,
      },
      {
        expectedCountry: row.country ?? undefined,
        reason,
        workspace_id: this.workspaceId,
        // Manual re-validation = user suspects something changed → fresh fetch.
        bypass_cache: reason === 'manual',
      },
    );

    await this.supabase
      .from('proxy')
      .update({
        validation_status: verdict.status,
        last_validated_at: verdict.checked_at,
        last_validation_summary: {
          clean: verdict.clean,
          ip: verdict.ip,
          failure_reasons: verdict.failure_reasons,
          providers: verdict.results.map((r) => ({
            provider: r.provider,
            clean: r.clean,
            score: r.score,
          })),
        },
        ip_address: verdict.ip,
      })
      .eq('id', proxy_id)
      .eq('workspace_id', this.workspaceId);

    await this.supabase.from('proxy_validation_check').insert({
      workspace_id: this.workspaceId,
      proxy_id,
      verdict: verdict.status,
      ip_address: verdict.ip,
      results: verdict.results,
      reason,
      duration_ms: verdict.duration_ms,
    });

    return verdict;
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

    // Idempotency short-circuit: if we already produced an account for this
    // key in this workspace, return it instead of creating duplicates +
    // burning a Multilogin profile + proxy binding.
    if (req.idempotency_key) {
      const { data: existing } = await this.supabase
        .from('account')
        .select('id, handle, status, multilogin_profile_id, cloud_phone_id, proxy_id')
        .eq('workspace_id', this.workspaceId)
        .eq('idempotency_key', req.idempotency_key)
        .maybeSingle();
      if (existing) {
        return {
          account_id: existing.id,
          handle: existing.handle,
          status: existing.status as AccountStatus,
          profile_id: existing.multilogin_profile_id ?? '',
          profile_provider: 'multilogin',
          cloud_phone_id: existing.cloud_phone_id ?? undefined,
          proxy_id: existing.proxy_id ?? null,
        };
      }
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
        .select('id, host, port, username, password_encrypted, country, status, validation_status')
        .eq('id', req.proxy_id)
        .eq('workspace_id', this.workspaceId)
        .single();
      if (error || !data) throw new Error(`Proxy ${req.proxy_id} not found`);
      if (data.status !== 'available') {
        throw new Error(`Proxy ${req.proxy_id} is ${data.status}, not available`);
      }
      if (env.IP_REPUTATION_STRICT && data.validation_status !== 'clean') {
        throw new Error(
          `Proxy ${req.proxy_id} validation_status is '${data.validation_status}' — refusing to bind under strict mode. Run validation/rotation first.`,
        );
      }
      proxyRow = data;
    } else {
      // Auto-pick first available + clean proxy in the requested country.
      const query = this.supabase
        .from('proxy')
        .select('id, host, port, username, password_encrypted, country, status, validation_status')
        .eq('workspace_id', this.workspaceId)
        .eq('status', 'available');
      const filtered = env.IP_REPUTATION_STRICT
        ? query.eq('validation_status', 'clean')
        : query;
      const { data, error } = await (
        req.country ? filtered.eq('country', req.country) : filtered
      )
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
        idempotency_key: req.idempotency_key ?? null,
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
            type: proxyRow.provider === 'multilogin' ? 'socks5' : 'http',
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

    // 6) Persist profile id (column depends on provider) and log event.
    const profileUpdate: Record<string, string> = {};
    if (antidetect.name === 'multilogin') {
      profileUpdate.multilogin_profile_id = profile.profile_id;
    } else {
      profileUpdate.adspower_profile_id = profile.profile_id;
    }
    await this.supabase
      .from('account')
      .update(profileUpdate)
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
      profile_id: profile.profile_id,
      profile_provider: antidetect.name,
      proxy_id: proxyRow?.id ?? null,
      handle,
      status: 'creating',
    };
  }

  /** Open the browser/cloud-phone for this account; returns the driver endpoint. */
  async startBrowser(account_id: string) {
    const { data: acct, error } = await this.supabase
      .from('account')
      .select('id, adspower_profile_id, multilogin_profile_id, platform, handle')
      .eq('id', account_id)
      .eq('workspace_id', this.workspaceId)
      .single();
    if (error || !acct) throw new Error(`Account ${account_id} not found`);
    const profileId = acct.multilogin_profile_id ?? acct.adspower_profile_id;
    if (!profileId) {
      throw new Error(`Account ${account_id} has no antidetect profile`);
    }
    const antidetect = await getAntidetectProvider();
    const browser = await antidetect.startBrowser(profileId);
    await this.supabase.from('account_event').insert({
      account_id,
      workspace_id: this.workspaceId,
      event_type: 'browser_started',
      details: {
        provider: antidetect.name,
        ws_endpoint: browser.ws_endpoint,
        pid: browser.pid,
      },
    });
    return browser;
  }

  async stopBrowser(account_id: string) {
    const { data: acct } = await this.supabase
      .from('account')
      .select('adspower_profile_id, multilogin_profile_id')
      .eq('id', account_id)
      .eq('workspace_id', this.workspaceId)
      .single();
    const profileId = acct?.multilogin_profile_id ?? acct?.adspower_profile_id;
    if (!profileId) return;
    const antidetect = await getAntidetectProvider();
    await antidetect.stopBrowser(profileId);
    await this.supabase.from('account_event').insert({
      account_id,
      workspace_id: this.workspaceId,
      event_type: 'browser_stopped',
      details: { provider: antidetect.name },
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

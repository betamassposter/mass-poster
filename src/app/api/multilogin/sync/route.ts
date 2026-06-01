import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/db/admin';
import { CURRENT_WORKSPACE_ID } from '@/lib/db/workspace';
import { env } from '@/lib/env';
import { logger } from '@/lib/log';

const log = logger('api/multilogin/sync');

interface MultiloginDesktopProfile {
  id: string;
  name: string;
  browser_type: string;
  core_version: number;
  folder_id: string;
  os_type: string;
  is_local: boolean;
  created_at: string;
  last_launched_at: string;
  removed_at?: string;
}

interface MultiloginMobileProfile {
  id: string; // numeric string e.g. "622003050059399361"
  serial_name: string; // user-given display name
  serial_no: string;
  folder_id: string;
  usecase_id: string;
  usecase_name: string; // e.g. "Instagram"
  status: number;
  created_at: string;
  last_launched_at: string | null;
  equipment_info: {
    country_name: string;
    device_brand: string;
    device_model: string;
    os_version: string;
    phone_number: string;
    time_zone: string;
  };
  proxy: {
    server: string;
    port: number;
    type: string;
    username: string;
    password: string;
  };
}

/**
 * Sync the Multilogin profile list into Mass Poster's proxy + account tables.
 *
 * Why this exists: Multilogin's `/mobile-profile/create` REST endpoint returns
 * HTTP 501 on the Pro_10 plan. Mobile profiles must be created via Multilogin's
 * web UI (or xcli CLI). After the user creates them there, this endpoint pulls
 * the list and upserts into Mass Poster so the user sees everything in one UI.
 *
 * Steps:
 *   1. Fresh signin (or use cached automation token)
 *   2. List folders
 *   3. For each folder, call /profile/search to get its profiles
 *   4. Upsert each profile as a `proxy` row in Mass Poster DB
 *      (we store Multilogin as the provider; the actual proxy creds are
 *      managed by Multilogin internally and only visible at session launch)
 *   5. Return summary {found, new, existing}
 */
export async function POST() {
  try {
    if (!env.MULTILOGIN_EMAIL || !env.MULTILOGIN_PASSWORD) {
      return NextResponse.json(
        { ok: false, error: 'MULTILOGIN_EMAIL + MULTILOGIN_PASSWORD not configured' },
        { status: 400 },
      );
    }

    // Signin fresh — short token sufficient for one sync call
    const passwordHash = createHash('md5').update(env.MULTILOGIN_PASSWORD).digest('hex');
    const signinRes = await fetch('https://api.multilogin.com/user/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: env.MULTILOGIN_EMAIL, password: passwordHash }),
    });
    const signin = (await signinRes.json()) as { data?: { token?: string } };
    const TOKEN = signin?.data?.token;
    if (!TOKEN) {
      return NextResponse.json(
        { ok: false, error: 'Multilogin signin failed' },
        { status: 502 },
      );
    }

    // List all folders (folder_type=all includes both browser AND mobile folders)
    const foldersRes = await fetch(
      'https://api.multilogin.com/workspace/folders?folder_type=all',
      { headers: { Authorization: `Bearer ${TOKEN}` } },
    );
    const foldersJson = (await foldersRes.json()) as {
      data?: { folders?: Array<{ folder_id: string; name: string; folder_type: string }> };
    };
    const folders = foldersJson?.data?.folders ?? [];

    // Desktop profiles via /profile/search
    const desktopProfiles: MultiloginDesktopProfile[] = [];
    for (const folder of folders.filter((f) => f.folder_type === 'browser')) {
      const searchRes = await fetch('https://api.multilogin.com/profile/search', {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folder_id: folder.folder_id,
          search_text: '',
          is_removed: false,
          limit: 200,
          offset: 0,
        }),
      });
      const searchJson = (await searchRes.json()) as {
        data?: { profiles?: MultiloginDesktopProfile[] };
      };
      desktopProfiles.push(...(searchJson?.data?.profiles ?? []));
    }

    // Mobile profiles via the REAL endpoint (underscore + plural + phone path —
    // verified 2026-06-01 by Playwright-capturing the actual web UI requests).
    //
    // Quirk: Multilogin returns HTTP 500 + {error_code: INTERNAL_SERVER_ERROR,
    // message: "returned data is empty"} when the user has zero mobile profiles
    // (instead of 200 + empty array). We treat that specific shape as "no
    // profiles" and continue; any other 500 is a real error.
    let mobileProfiles: MultiloginMobileProfile[] = [];
    const mobileRes = await fetch(
      'https://api.multilogin.com/mobile_profiles/phone/list?page=1&page_size=200',
      { headers: { Authorization: `Bearer ${TOKEN}` } },
    );
    const mobileJson = (await mobileRes.json()) as {
      data?: { items?: MultiloginMobileProfile[]; total?: number };
      status?: { error_code?: string; message?: string };
    };
    if (mobileRes.ok) {
      mobileProfiles = mobileJson?.data?.items ?? [];
    } else if (mobileRes.status === 500 && mobileJson?.status?.message === 'returned data is empty') {
      // Multilogin quirk: 0 mobile profiles → 500. Treat as empty.
      mobileProfiles = [];
    } else {
      log.warn('mobile profiles fetch failed', {
        http: mobileRes.status,
        error: mobileJson?.status,
      });
    }

    log.info('multilogin profiles fetched', {
      folders: folders.length,
      desktop_profiles: desktopProfiles.length,
      mobile_profiles: mobileProfiles.length,
    });

    // Upsert into Mass Poster `proxy` table.
    // Each Multilogin profile gets ONE proxy row keyed by multilogin_proxy_id =
    // profile.id (we use the profile_id as the stable external key since the
    // bundled proxy is owned by the profile).
    const supabase = getSupabaseAdmin();
    let newCount = 0;
    let updatedCount = 0;

    // Upsert mobile profiles (the primary path — these carry real proxy creds)
    for (const m of mobileProfiles) {
      const country = (extractCountryFromUsername(m.proxy.username) ?? m.equipment_info?.country_name?.slice(0, 2))?.toUpperCase();
      const { data: existing } = await supabase
        .from('proxy')
        .select('id')
        .eq('workspace_id', CURRENT_WORKSPACE_ID)
        .eq('multilogin_proxy_id', m.id)
        .maybeSingle();
      const summary = {
        profile_name: m.serial_name,
        usecase: m.usecase_name,
        device: `${m.equipment_info?.device_brand} ${m.equipment_info?.device_model}`,
        os_version: m.equipment_info?.os_version,
        phone_number: m.equipment_info?.phone_number,
        time_zone: m.equipment_info?.time_zone,
        created_at: m.created_at,
        last_launched_at: m.last_launched_at,
      };
      if (existing) {
        await supabase
          .from('proxy')
          .update({
            host: m.proxy.server,
            port: m.proxy.port,
            username: m.proxy.username,
            password_encrypted: m.proxy.password,
            country: country ?? null,
            last_validation_summary: summary,
          })
          .eq('id', existing.id);
        updatedCount++;
      } else {
        const { error: insErr } = await supabase.from('proxy').insert({
          workspace_id: CURRENT_WORKSPACE_ID,
          provider: 'multilogin',
          proxy_type: 'mobile',
          multilogin_proxy_id: m.id,
          host: m.proxy.server,
          port: m.proxy.port,
          username: m.proxy.username,
          password_encrypted: m.proxy.password,
          country: country ?? null,
          city: null,
          status: 'available',
          validation_status: 'pending',
          last_validation_summary: summary,
        });
        if (insErr) {
          log.warn('insert mobile failed', { profile_id: m.id, error: insErr.message });
        } else {
          newCount++;
        }
      }
    }

    // Desktop profiles — metadata only (no proxy creds available without launch)
    for (const p of desktopProfiles) {
      const { data: existing } = await supabase
        .from('proxy')
        .select('id')
        .eq('workspace_id', CURRENT_WORKSPACE_ID)
        .eq('multilogin_proxy_id', p.id)
        .maybeSingle();
      if (existing) {
        updatedCount++;
        continue;
      }
      const { error } = await supabase.from('proxy').insert({
        workspace_id: CURRENT_WORKSPACE_ID,
        provider: 'multilogin',
        proxy_type: 'desktop',
        multilogin_proxy_id: p.id,
        host: 'multilogin-bundled',
        port: 0,
        username: null,
        password_encrypted: null,
        country: null,
        status: 'available',
        validation_status: 'pending',
        last_validation_summary: {
          profile_name: p.name,
          browser_type: p.browser_type,
          os_type: p.os_type,
        },
      });
      if (!error) newCount++;
    }

    return NextResponse.json({
      ok: true,
      summary: {
        folders: folders.length,
        mobile_profiles: mobileProfiles.length,
        desktop_profiles: desktopProfiles.length,
        new: newCount,
        updated: updatedCount,
      },
    });
  } catch (err) {
    log.error('sync failed', { error: (err as Error).message });
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}

/**
 * Multilogin encodes proxy geo info in the username, e.g.
 *   2235508800_b5bc...com-country-it-isp-wind_tre-type-mobile-sid-x...-filter-medium
 * Extract the country code (2-letter, lowercase in the username).
 */
function extractCountryFromUsername(username: string): string | undefined {
  const m = username.match(/-country-([a-z]{2})/i);
  return m?.[1]?.toUpperCase();
}


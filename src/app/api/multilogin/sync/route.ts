import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/db/admin';
import { CURRENT_WORKSPACE_ID } from '@/lib/db/workspace';
import { env } from '@/lib/env';
import { logger } from '@/lib/log';

const log = logger('api/multilogin/sync');

interface MultiloginProfile {
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

    // List folders
    const foldersRes = await fetch('https://api.multilogin.com/workspace/folders', {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    const foldersJson = (await foldersRes.json()) as {
      data?: { folders?: Array<{ folder_id: string; name: string; folder_type: string }> };
    };
    const folders = foldersJson?.data?.folders ?? [];

    // For each folder, list active profiles
    const allProfiles: MultiloginProfile[] = [];
    for (const folder of folders) {
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
        data?: { profiles?: MultiloginProfile[]; total_count?: number };
      };
      const profiles = searchJson?.data?.profiles ?? [];
      allProfiles.push(...profiles);
    }

    log.info('multilogin profiles fetched', {
      folders: folders.length,
      profiles: allProfiles.length,
    });

    // Upsert into Mass Poster `proxy` table.
    // Each Multilogin profile gets ONE proxy row keyed by multilogin_proxy_id =
    // profile.id (we use the profile_id as the stable external key since the
    // bundled proxy is owned by the profile).
    const supabase = getSupabaseAdmin();
    let newCount = 0;
    let updatedCount = 0;

    for (const p of allProfiles) {
      const proxyType = p.os_type === 'ios' || p.os_type === 'android' ? 'mobile' : 'desktop';
      const { data: existing } = await supabase
        .from('proxy')
        .select('id, validation_status')
        .eq('workspace_id', CURRENT_WORKSPACE_ID)
        .eq('multilogin_proxy_id', p.id)
        .maybeSingle();

      if (existing) {
        // Just update metadata, keep validation_status (re-validation is explicit)
        await supabase
          .from('proxy')
          .update({
            last_validation_summary: {
              profile_name: p.name,
              browser_type: p.browser_type,
              os_type: p.os_type,
              created_at: p.created_at,
              last_launched_at: p.last_launched_at,
            },
          })
          .eq('id', existing.id);
        updatedCount++;
      } else {
        const { error: insErr } = await supabase.from('proxy').insert({
          workspace_id: CURRENT_WORKSPACE_ID,
          provider: 'multilogin',
          proxy_type: proxyType,
          multilogin_proxy_id: p.id,
          host: 'multilogin-bundled', // creds are internal to Multilogin
          port: 0,
          username: null,
          password_encrypted: null,
          country: null, // unknown until first launch
          city: null,
          status: 'available',
          validation_status: 'pending', // never validated yet
          last_validation_summary: {
            profile_name: p.name,
            browser_type: p.browser_type,
            os_type: p.os_type,
            created_at: p.created_at,
            last_launched_at: p.last_launched_at,
          },
        });
        if (insErr) {
          log.warn('insert failed', { profile_id: p.id, error: insErr.message });
        } else {
          newCount++;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      summary: {
        folders: folders.length,
        profiles_total: allProfiles.length,
        new: newCount,
        updated: updatedCount,
      },
      profiles: allProfiles.map((p) => ({
        id: p.id,
        name: p.name,
        browser_type: p.browser_type,
        os_type: p.os_type,
      })),
    });
  } catch (err) {
    log.error('sync failed', { error: (err as Error).message });
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}

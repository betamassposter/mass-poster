import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/db/admin';
import { CURRENT_WORKSPACE_ID } from '@/lib/db/workspace';
import { PageHeader } from '@/components/ui/page-header';
import { SettingsTabs } from './settings-tabs';

export const dynamic = 'force-dynamic';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login');

  const { tab } = await searchParams;
  const supabase = getSupabaseAdmin();

  const [{ data: workspace }, { data: members }, { data: brands }] = await Promise.all([
    supabase
      .from('workspace')
      .select('*')
      .eq('id', CURRENT_WORKSPACE_ID)
      .single(),
    supabase
      .from('workspace_member')
      .select('user_id, role, joined_at')
      .eq('workspace_id', CURRENT_WORKSPACE_ID),
    supabase
      .from('brand')
      .select('id, slug, name, niche, status, created_at')
      .eq('workspace_id', CURRENT_WORKSPACE_ID),
  ]);

  return (
    <div className="space-y-8 animate-float-in">
      <PageHeader eyebrow="Workspace" title="Settings" description="Manage your workspace, billing, brands, and integrations" />
      <SettingsTabs
        initialTab={tab ?? 'workspace'}
        workspace={workspace ?? null}
        memberCount={members?.length ?? 0}
        brandCount={brands?.length ?? 0}
        currentUserEmail={session.email}
        brands={brands ?? []}
      />
    </div>
  );
}

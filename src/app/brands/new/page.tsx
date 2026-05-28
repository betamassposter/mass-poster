import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui/page-header';
import { BrandCreatorWizard } from './brand-wizard';

export const dynamic = 'force-dynamic';

export default async function NewBrandPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  return (
    <div className="space-y-8 animate-float-in">
      <PageHeader
        back={{ href: '/brands', label: 'All brands' }}
        eyebrow="Create brand"
        title="New brand"
        description="A brand defines voice, target personas, and the offer you're promoting across social networks."
      />
      <BrandCreatorWizard />
    </div>
  );
}

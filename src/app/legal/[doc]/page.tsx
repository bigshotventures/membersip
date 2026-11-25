import { notFound } from 'next/navigation';
import { LEGAL } from '@/lib/legal';
import { Markdown } from '@/components/Markdown';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { Footer } from '@/components/layout/Footer';
import { APP_NAME } from '@/lib/utils';

export function generateMetadata({ params }: { params: { doc: string } }) {
  return { title: LEGAL[params.doc]?.title || 'Legal' };
}

export default function LegalPage({ params }: { params: { doc: string } }) {
  const d = LEGAL[params.doc];
  if (!d) notFound();
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="mb-6 text-3xl font-bold">{d.title}</h1>
        <div className="card p-8"><Markdown>{d.body.replace(/\[Brand\]/g, APP_NAME)}</Markdown></div>
      </main>
      <Footer />
    </>
  );
}

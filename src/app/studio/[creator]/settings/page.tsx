import { requireStudio } from '@/lib/auth';
import { admin } from '@/lib/supabase/admin';
import { Card, Field, Notice, PageHeader, ReadOnlyNotice } from '@/components/ui';
import { FileUpload, SubmitButton } from '@/components/client';
import { MarkdownArea, Slug, VideoSelect } from '@/components/studio/bits';
import { saveSettings } from '@/actions/studio/content';
import { isoToIstLocal } from '@/lib/utils';

export default async function Settings({ params, searchParams }: { params: { creator: string }; searchParams: { notice?: string } }) {
  const { creator: c, perms } = await requireStudio(params.creator);
  const { data: videos } = await admin().from('videos').select('id, title, status').eq('creator_id', c.id).eq('is_public', true);
  const s = c.settings || {};
  return (
    <div className="max-w-3xl">
      <PageHeader title="Page settings" subtitle={`yourdomain.com/${c.slug}`} />
      {searchParams.notice && <div className="mb-4"><Notice tone="success">{searchParams.notice}</Notice></div>}
      {!perms.manage && <div className="mb-4"><ReadOnlyNotice /></div>}
      <form action={saveSettings} className="space-y-5">
        <Slug slug={c.slug} />
        <fieldset disabled={!perms.manage} className="space-y-5">
          <Card title="Profile">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Display name"><input name="name" className="input" defaultValue={c.name} required /></Field>
              <Field label="Category"><input name="category" className="input" defaultValue={c.category || ''} placeholder="Fitness, Finance, Music…" /></Field>
              <Field label="Tagline" className="sm:col-span-2"><input name="tagline" className="input" defaultValue={c.tagline || ''} maxLength={140} /></Field>
              <Field label="About" className="sm:col-span-2"><MarkdownArea name="bio" defaultValue={c.bio} rows={8} /></Field>
              <Field label="Profile photo"><FileUpload name="avatar_url" scope="studio" creatorId={c.id} accept="image/*" defaultValue={c.avatar_url} /></Field>
              <Field label="Banner"><FileUpload name="banner_url" scope="studio" creatorId={c.id} accept="image/*" defaultValue={c.banner_url} /></Field>
              <Field label="Intro video (public videos only)"><VideoSelect name="intro_video_id" videos={videos || []} value={c.intro_video_id} /></Field>
              <Field label="Brand colour"><input type="color" name="accent" className="h-10 w-20 rounded border" defaultValue={c.theme?.accent || '#7c3aed'} /></Field>
            </div>
          </Card>
          <Card title="Social links">
            <div className="grid gap-3 sm:grid-cols-2">
              {['instagram', 'youtube', 'twitter', 'linkedin', 'website', 'telegram'].map((k) => (
                <Field key={k} label={k[0].toUpperCase() + k.slice(1)}><input name={`social_${k}`} className="input" defaultValue={c.socials?.[k] || ''} placeholder="https://" /></Field>
              ))}
            </div>
          </Card>
          <Card title="Testimonials">
            <textarea name="testimonials" className="input" rows={5} defaultValue={(c.testimonials || []).map((t: any) => `${t.name} | ${t.quote}`).join('\n')} placeholder={'Priya S. | This changed how I train!'} />
            <p className="hint">One per line: Name | quote</p>
          </Card>
          <Card title="Launch & community">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Launch date (IST)" hint="Shows a countdown on the waitlist page"><input type="datetime-local" name="launch_at" className="input" defaultValue={isoToIstLocal(c.launch_at)} /></Field>
              <Field label="Default WhatsApp group invite link" hint="Tiers can override this"><input name="whatsapp_group_link" className="input" defaultValue={c.whatsapp_group_link || ''} placeholder="https://chat.whatsapp.com/…" /></Field>
            </div>
          </Card>
          <Card title="Retention">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Cancel-flow discount offer (%)"><input type="number" name="cancel_offer_pct" className="input" defaultValue={s.cancel_offer_pct ?? 20} min={0} max={90} /></Field>
              <Field label="Max pause length (months)"><input type="number" name="pause_max_months" className="input" defaultValue={s.pause_max_months ?? 3} min={1} max={6} /></Field>
              <Field label="Win-back email after (days)" hint="Sent to members whose membership ended"><input type="number" name="winback_days" className="input" defaultValue={s.winback_days ?? 7} /></Field>
              <Field label="Win-back coupon (%)" hint="A single-use code is generated per person"><input type="number" name="winback_pct" className="input" defaultValue={s.winback_pct ?? 30} /></Field>
            </div>
          </Card>
          {perms.manage && <SubmitButton>Save settings</SubmitButton>}
        </fieldset>
      </form>
    </div>
  );
}

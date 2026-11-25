import Link from 'next/link';
import { requireStudio } from '@/lib/auth';
import { admin } from '@/lib/supabase/admin';
import { Card, Field, Notice, PageHeader, ReadOnlyNotice, StatusBadge } from '@/components/ui';
import { SubmitButton } from '@/components/client';
import { ZoomEmbed } from '@/components/ZoomEmbed';
import { MarkdownArea, Slug } from '@/components/studio/bits';
import { addBlock, deleteBlock, saveAvailability, saveBookingType, updateBookingStatus } from '@/actions/studio/courses';
import { fmtDate, fmtTime, inr } from '@/lib/utils';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default async function BookingsStudio({ params, searchParams }: { params: { creator: string }; searchParams: { edit?: string; notice?: string } }) {
  const { creator, perms } = await requireStudio(params.creator);
  const db = admin();
  const [{ data: types }, { data: avail }, { data: blocks }, { data: bookings }] = await Promise.all([
    db.from('booking_types').select('*').eq('creator_id', creator.id).order('created_at'),
    db.from('availability').select('*').eq('creator_id', creator.id),
    db.from('availability_blocks').select('*').eq('creator_id', creator.id).gte('ends_at', new Date().toISOString()).order('starts_at'),
    db.from('bookings').select('*, type:booking_types(title), user:profiles(full_name, email)').eq('creator_id', creator.id).neq('status', 'pending_payment').order('starts_at', { ascending: false }).limit(100),
  ]);
  const t: any = searchParams.edit === 'new' ? {} : (types || []).find((x: any) => x.id === searchParams.edit);
  const byDay = (d: number) => (avail || []).filter((a: any) => a.weekday === d).map((a: any) => `${a.start_time.slice(0, 5)}-${a.end_time.slice(0, 5)}`).join(', ');
  const slug = creator.slug;
  const now = Date.now();

  return (
    <div className="space-y-6">
      <PageHeader title="1:1 bookings" subtitle="Paid consultation slots with automatic Zoom links" actions={perms.manage && <Link href="?edit=new" className="btn-primary">New session type</Link>} />
      {searchParams.notice && <Notice tone="success">{searchParams.notice}</Notice>}
      {!perms.manage && <ReadOnlyNotice />}
      {t && perms.manage && (
        <Card title={t.id ? 'Edit session type' : 'New session type'}>
          <form action={saveBookingType} className="grid gap-4 sm:grid-cols-3"><Slug slug={slug} />{t.id && <input type="hidden" name="id" value={t.id} />}
            <Field label="Title" className="sm:col-span-2"><input name="title" className="input" defaultValue={t.title} required placeholder="30-min strategy call" /></Field>
            <Field label="Price (₹)"><input name="price" className="input" defaultValue={t.price_paise ? t.price_paise / 100 : ''} required /></Field>
            <Field label="Length (min)"><input name="duration_min" type="number" className="input" defaultValue={t.duration_min || 30} /></Field>
            <Field label="Buffer between calls (min)"><input name="buffer_min" type="number" className="input" defaultValue={t.buffer_min ?? 10} /></Field>
            <Field label="Minimum notice (hours)"><input name="min_notice_hours" type="number" className="input" defaultValue={t.min_notice_hours ?? 12} /></Field>
            <Field label="Bookable up to (days ahead)"><input name="max_days_ahead" type="number" className="input" defaultValue={t.max_days_ahead ?? 30} /></Field>
            <Field label="Description" className="sm:col-span-3"><MarkdownArea name="description" defaultValue={t.description} rows={3} /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="inactive" defaultChecked={t.id && !t.active} /> Hidden</label>
            <div className="sm:col-span-3"><SubmitButton>Save</SubmitButton></div>
          </form>
        </Card>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        {(types || []).map((x: any) => (
          <div key={x.id} className={`card p-4 ${x.active ? '' : 'opacity-50'}`}><div className="flex justify-between"><b>{x.title}</b>{perms.manage && <Link href={`?edit=${x.id}`} className="text-sm underline">Edit</Link>}</div><p className="text-sm text-zinc-500">{x.duration_min} min · {inr(x.price_paise)}</p></div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Weekly availability (IST)">
          <form action={saveAvailability} className="space-y-2"><Slug slug={slug} />
            {DAYS.map((d, i) => <label key={d} className="flex items-center gap-3 text-sm"><span className="w-24">{d}</span><input name={`day_${i}`} className="input" defaultValue={byDay(i)} placeholder="10:00-13:00, 16:00-19:00" disabled={!perms.manage} /></label>)}
            {perms.manage && <SubmitButton>Save availability</SubmitButton>}
          </form>
        </Card>
        <Card title="Block time off">
          {perms.manage && (
            <form action={addBlock} className="mb-4 flex flex-wrap gap-2"><Slug slug={slug} />
              <input name="starts_at" type="datetime-local" className="input w-auto" required /><input name="ends_at" type="datetime-local" className="input w-auto" required /><SubmitButton className="btn-outline">Block</SubmitButton></form>
          )}
          {(blocks || []).map((b: any) => <div key={b.id} className="flex justify-between py-1 text-sm"><span>{fmtDate(b.starts_at, true)} → {fmtDate(b.ends_at, true)}</span>{perms.manage && <form action={deleteBlock}><Slug slug={slug} /><input type="hidden" name="id" value={b.id} /><button className="text-red-600">✕</button></form>}</div>)}
        </Card>
      </div>
      <h2 className="font-semibold">Bookings</h2>
      <div className="space-y-3">
        {(bookings || []).map((b: any) => {
          const live = b.status === 'confirmed' && now >= +new Date(b.starts_at) - 15 * 60000 && now <= +new Date(b.ends_at) + 3600000;
          return (
            <div key={b.id} className="card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm"><b>{b.user?.full_name}</b> ({b.user?.email}) · {b.type?.title}<div className="text-zinc-500">{fmtDate(b.starts_at)} {fmtTime(b.starts_at)}–{fmtTime(b.ends_at)}</div>{b.notes && <p className="mt-1 italic">“{b.notes}”</p>}</div>
                <div className="flex items-center gap-2"><StatusBadge status={b.status} />
                  {perms.moderate && b.status === 'confirmed' && (
                    <form action={updateBookingStatus} className="flex gap-1"><Slug slug={slug} /><input type="hidden" name="id" value={b.id} />
                      <select name="status" className="input py-1 text-xs"><option value="completed">Completed</option><option value="no_show">No-show</option><option value="cancelled">Cancel</option></select>
                      <SubmitButton className="btn-ghost btn-sm">Update</SubmitButton></form>
                  )}
                </div>
              </div>
              {live && perms.moderate && <div className="mt-3"><ZoomEmbed bookingId={b.id} label="Join call" /></div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

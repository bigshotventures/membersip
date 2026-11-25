import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireProfile } from '@/lib/auth';
import { admin } from '@/lib/supabase/admin';
import { AccountShell } from '@/components/account/AccountShell';
import { Card, PageHeader } from '@/components/ui';
import { SubmitButton } from '@/components/client';
import { acceptRetentionOffer, cancelMembership } from '@/actions/billing';
import { fmtDate, inr } from '@/lib/utils';

const REASONS = [
  ['too_expensive', 'It’s too expensive right now'], ['not_using', 'I’m not using it enough'], ['content', 'The content isn’t what I expected'],
  ['break', 'I just need a break'], ['technical', 'Technical or payment problems'], ['other', 'Something else'],
];

export default async function CancelFlow({ params, searchParams }: { params: { id: string }; searchParams: { reason?: string } }) {
  const p = await requireProfile('/account/billing');
  const db = admin();
  const { data: m } = await db.from('memberships').select('*, creator:creators(slug, name, settings), tier:tiers!memberships_tier_id_fkey(*)').eq('id', params.id).eq('user_id', p.id).maybeSingle();
  if (!m) notFound();
  const { data: cheaper } = await db.from('tiers').select('*').eq('creator_id', m.creator_id).eq('is_active', true).neq('id', m.tier_id).not(`price_${m.billing_period}`, 'is', null);
  const lower = (cheaper || []).filter((t: any) => t[`price_${m.billing_period}`] < (m.tier[`price_${m.billing_period}`] || 0));
  const reason = searchParams.reason;
  const pct = m.creator.settings?.cancel_offer_pct || 20;
  const maxPause = m.creator.settings?.pause_max_months || 3;
  const Hidden = () => <><input type="hidden" name="membership_id" value={m.id} /><input type="hidden" name="reason" value={reason} /></>;

  return (
    <AccountShell active="/account/billing">
      <PageHeader title={`Cancel ${m.creator.name}?`} subtitle={`You'll keep access until ${fmtDate(m.current_period_end)}.`} />
      {!reason ? (
        <Card title="Before you go — what's the main reason?">
          <div className="grid gap-2">
            {REASONS.map(([k, l]) => <Link key={k} href={`?reason=${k}`} className="rounded-lg border p-3 text-sm hover:border-zinc-400">{l}</Link>)}
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-zinc-600">Thanks for telling us. Would one of these work better?</p>
          {['break', 'not_using', 'too_expensive', 'other'].includes(reason) && (
            <Card title="⏸ Pause instead">
              <p className="mb-3 text-sm text-zinc-600">Take a break without losing your spot, streaks or history. Billing stops while paused.</p>
              <form action={acceptRetentionOffer} className="flex flex-wrap gap-2"><Hidden /><input type="hidden" name="offer" value="pause" />
                <select name="months" className="input w-auto">{Array.from({ length: maxPause }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n} month{n > 1 ? 's' : ''}</option>)}</select>
                <SubmitButton className="btn-primary">Pause membership</SubmitButton>
              </form>
            </Card>
          )}
          {['too_expensive', 'not_using', 'content', 'other'].includes(reason) && (
            <Card title={`💸 ${pct}% off your next renewal`}>
              <p className="mb-3 text-sm text-zinc-600">Stay on and we'll refund {pct}% of your next payment automatically.</p>
              <form action={acceptRetentionOffer}><Hidden /><input type="hidden" name="offer" value="discount" /><SubmitButton className="btn-primary">Claim {pct}% off</SubmitButton></form>
            </Card>
          )}
          {lower.length > 0 && (
            <Card title="⬇️ Switch to a smaller plan">
              <form action={acceptRetentionOffer} className="flex flex-wrap gap-2"><Hidden /><input type="hidden" name="offer" value="downgrade" />
                <select name="tier_id" className="input w-auto">{lower.map((t: any) => <option key={t.id} value={t.id}>{t.name} — {inr(t[`price_${m.billing_period}`])}</option>)}</select>
                <SubmitButton className="btn-primary">Switch at next renewal</SubmitButton>
              </form>
            </Card>
          )}
          <Card title="Still want to cancel?">
            <form action={cancelMembership} className="space-y-3"><Hidden />
              <textarea name="details" className="input" rows={3} placeholder="Anything we could do better? (optional)" />
              <SubmitButton className="btn-danger" confirm="Cancel your membership? You'll keep access until the end of this billing period.">Cancel membership</SubmitButton>
            </form>
          </Card>
        </div>
      )}
    </AccountShell>
  );
}

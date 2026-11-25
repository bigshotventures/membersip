'use client';
import { useState } from 'react';
import Link from 'next/link';
import { inr } from '@/lib/utils';

type Tier = { id: string; name: string; description: string | null; perks: string[]; price_monthly: number | null; price_quarterly: number | null; price_yearly: number | null; price_lifetime: number | null; trial_days: number; is_featured: boolean };
const PERIODS = [['monthly', 'Monthly', '/mo'], ['quarterly', 'Quarterly', '/qtr'], ['yearly', 'Yearly', '/yr'], ['lifetime', 'Lifetime', ' once']] as const;

export function TierCards({ tiers, slug, currentTierId, abTestId, names, disabled }: { tiers: Tier[]; slug: string; currentTierId?: string | null; abTestId?: string; names?: Record<string, string>; disabled?: boolean }) {
  const available = PERIODS.filter(([p]) => tiers.some((t) => (t as any)[`price_${p}`]));
  const [period, setPeriod] = useState<string>(available[0]?.[0] || 'monthly');
  if (!tiers.length) return null;
  return (
    <div>
      {available.length > 1 && (
        <div className="mb-5 flex justify-center">
          <div className="inline-flex rounded-full bg-zinc-100 p-1 text-sm">
            {available.map(([p, label]) => (
              <button key={p} onClick={() => setPeriod(p)} className={`rounded-full px-4 py-1.5 font-medium ${period === p ? 'bg-white shadow' : 'text-zinc-500'}`}>{label}</button>
            ))}
          </div>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {tiers.map((t) => {
          const price = (t as any)[`price_${period}`] as number | null;
          const monthly = t.price_monthly;
          const savings = price && monthly && period === 'yearly' ? Math.round(100 - (price / (monthly * 12)) * 100) : period === 'quarterly' && price && monthly ? Math.round(100 - (price / (monthly * 3)) * 100) : 0;
          const current = currentTierId === t.id;
          return (
            <div key={t.id} className={`card relative flex flex-col p-6 ${t.is_featured ? 'ring-2 ring-[var(--accent)]' : ''}`}>
              {t.is_featured && <span className="badge-accent absolute -top-2.5 left-6">Most popular</span>}
              <h3 className="text-lg font-semibold">{names?.[t.id] || t.name}</h3>
              {t.description && <p className="mt-1 text-sm text-zinc-500">{t.description}</p>}
              <div className="mt-4">
                {price ? (
                  <>
                    <span className="text-3xl font-bold">{inr(price)}</span>
                    <span className="text-zinc-500">{PERIODS.find((p) => p[0] === period)?.[2]}</span>
                    {savings > 0 && <span className="badge-green ml-2">Save {savings}%</span>}
                  </>
                ) : <span className="text-sm text-zinc-400">Not available {period}</span>}
              </div>
              <ul className="mt-4 flex-1 space-y-2 text-sm">
                {t.perks.map((p) => <li key={p} className="flex gap-2"><span className="accent-text">✓</span>{p}</li>)}
              </ul>
              {current ? (
                <span className="btn-outline mt-6 cursor-default">Your current tier</span>
              ) : price && !disabled ? (
                <Link href={`/${slug}/checkout?kind=membership&item=${t.id}&period=${period}${abTestId ? `&ab=${abTestId}` : ''}`} className="btn-primary mt-6">
                  {t.trial_days > 0 && period !== 'lifetime' && !currentTierId ? `Start ${t.trial_days}-day free trial` : currentTierId ? 'Switch to this tier' : 'Join now'}
                </Link>
              ) : (
                <span className="btn-outline mt-6 cursor-default opacity-60">{disabled ? 'Opening soon' : 'Unavailable'}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

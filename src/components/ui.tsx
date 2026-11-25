import Link from 'next/link';
import { cn, initials } from '@/lib/utils';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ className, children, title, actions }: { className?: string; children: React.ReactNode; title?: string; actions?: React.ReactNode }) {
  return (
    <section className={cn('card p-5', className)}>
      {(title || actions) && (
        <div className="mb-4 flex items-center justify-between gap-2">
          {title && <h2 className="font-semibold">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="hint block">{hint}</span>}
    </label>
  );
}

export function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
      {sub && <div className="mt-1 text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-10 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-2 text-sm text-zinc-500">{children}</div>}
    </div>
  );
}

export function Avatar({ src, name, size = 36 }: { src?: string | null; name?: string | null; size?: number }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={name || ''} width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <div className="flex shrink-0 items-center justify-center rounded-full bg-zinc-200 text-xs font-semibold text-zinc-600" style={{ width: size, height: size }}>
      {initials(name)}
    </div>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'error' | 'success'; children: React.ReactNode }) {
  const c = { info: 'border-blue-200 bg-blue-50 text-blue-800', warn: 'border-amber-200 bg-amber-50 text-amber-800', error: 'border-red-200 bg-red-50 text-red-800', success: 'border-emerald-200 bg-emerald-50 text-emerald-800' }[tone];
  return <div className={cn('rounded-lg border px-4 py-3 text-sm', c)}>{children}</div>;
}

export function StatusBadge({ status }: { status: string }) {
  const green = ['active', 'paid', 'published', 'confirmed', 'live', 'ready', 'delivered', 'redeemed', 'verified', 'sent', 'completed', 'ok', 'running'];
  const amber = ['trialing', 'past_due', 'paused', 'pending', 'scheduled', 'draft', 'waitlist', 'processing', 'waiting', 'pending_payment', 'requested', 'in_progress', 'open', 'submitted', 'shipped'];
  const cls = green.includes(status) ? 'badge-green' : amber.includes(status) ? 'badge-amber' : ['cancelled', 'expired', 'failed', 'errored', 'refunded', 'suspended', 'rejected', 'error', 'banned'].includes(status) ? 'badge-red' : 'badge';
  return <span className={cls}>{status.replace(/_/g, ' ')}</span>;
}

export function Tabs({ items, active }: { items: { href: string; label: string }[]; active: string }) {
  return (
    <div className="mb-6 flex gap-1 overflow-x-auto border-b border-zinc-200">
      {items.map((i) => (
        <Link key={i.href} href={i.href} className={cn('whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium', active === i.href ? 'border-[var(--accent)] text-zinc-900' : 'border-transparent text-zinc-500 hover:text-zinc-800')}>
          {i.label}
        </Link>
      ))}
    </div>
  );
}

export function ReadOnlyNotice() {
  return <Notice tone="info">The platform team manages this section for you. You can see everything here; contact your account manager for changes.</Notice>;
}

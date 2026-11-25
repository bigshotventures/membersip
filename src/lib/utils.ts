export function cn(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'CreatorHub';
export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');

export function inr(paise: number | null | undefined, opts: { decimals?: boolean } = {}) {
  const v = (paise || 0) / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: opts.decimals ? 2 : 0,
    maximumFractionDigits: opts.decimals ? 2 : v % 1 === 0 ? 0 : 2,
  }).format(v);
}

/** Parse a rupee string from a form ("499" or "499.50") into paise. Empty → null. */
export function toPaise(v: FormDataEntryValue | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/[,₹\s]/g, '');
  if (s === '') return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) throw new Error('Invalid amount');
  return Math.round(n * 100);
}

const TZ = 'Asia/Kolkata';
export function fmtDate(d: string | Date | null | undefined, withTime = false) {
  if (!d) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  }).format(new Date(d));
}
export function fmtTime(d: string | Date) {
  return new Intl.DateTimeFormat('en-IN', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(new Date(d));
}
export function timeAgo(d: string | Date) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return fmtDate(d);
}

/** Convert an <input type="datetime-local"> value (entered in IST) to an ISO string. */
export function istLocalToISO(v: FormDataEntryValue | null): string | null {
  if (!v) return null;
  const s = String(v);
  if (!s) return null;
  return new Date(s.length === 16 ? `${s}:00+05:30` : `${s}+05:30`).toISOString();
}
/** ISO → value for <input type="datetime-local"> in IST */
export function isoToIstLocal(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(new Date(iso).getTime() + 330 * 60000);
  return d.toISOString().slice(0, 16);
}

export function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

export function str(fd: FormData, k: string): string {
  return String(fd.get(k) ?? '').trim();
}
export function strOrNull(fd: FormData, k: string): string | null {
  const v = str(fd, k);
  return v === '' ? null : v;
}
export function int(fd: FormData, k: string, dflt = 0): number {
  const v = Number(fd.get(k));
  return Number.isFinite(v) && String(fd.get(k) ?? '') !== '' ? Math.trunc(v) : dflt;
}
export function bool(fd: FormData, k: string) {
  const v = fd.get(k);
  return v === 'on' || v === 'true' || v === '1';
}
export function list(fd: FormData, k: string): string[] {
  return fd.getAll(k).map(String).filter(Boolean);
}
export function lines(v: string) {
  return v.split('\n').map((x) => x.trim()).filter(Boolean);
}

export const PERIOD_LABEL: Record<string, string> = {
  monthly: 'month', quarterly: 'quarter', yearly: 'year', lifetime: 'lifetime',
};
export const PERIOD_MONTHS: Record<string, number> = { monthly: 1, quarterly: 3, yearly: 12, lifetime: 1200 };

export function addMonths(d: Date, m: number) {
  const x = new Date(d);
  x.setMonth(x.getMonth() + m);
  return x;
}

export function initials(name?: string | null) {
  return (name || '?').split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

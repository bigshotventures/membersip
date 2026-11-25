import { NextResponse } from 'next/server';
import { authorized, frequent } from '@/lib/cron';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, ...(await frequent()) });
  } catch (e: any) {
    console.error('cron frequent failed', e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { authorized, daily } from '@/lib/cron';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, ...(await daily()) });
  } catch (e: any) {
    console.error('cron daily failed', e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

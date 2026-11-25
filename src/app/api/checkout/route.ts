import { NextResponse } from 'next/server';
import { getProfile } from '@/lib/auth';
import { startCheckout } from '@/lib/checkout';

export async function POST(req: Request) {
  const user = await getProfile();
  if (!user) return NextResponse.json({ error: 'Please sign in to continue' }, { status: 401 });
  try {
    return NextResponse.json(await startCheckout(user, await req.json()));
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Checkout failed' }, { status: 400 });
  }
}

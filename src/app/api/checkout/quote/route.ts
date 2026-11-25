import { NextResponse } from 'next/server';
import { getProfile } from '@/lib/auth';
import { quote } from '@/lib/pricing';

export async function POST(req: Request) {
  const user = await getProfile();
  if (!user) return NextResponse.json({ error: 'Please sign in' }, { status: 401 });
  const b = await req.json();
  try {
    const q = await quote({ creatorId: b.creatorId, kind: b.kind, itemId: b.itemId, period: b.period, coupon: b.coupon, userId: user.id, useCredit: b.useCredit, months: b.gift?.months, giftKind: b.gift?.kind, amountPaise: b.gift?.amountPaise });
    const { item, ...rest } = q;
    return NextResponse.json(rest);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

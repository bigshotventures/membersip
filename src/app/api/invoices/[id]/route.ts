import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { invoicePdf } from '@/lib/pdf';

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const { data: inv } = await createClient().from('invoices').select('*').eq('id', params.id).maybeSingle(); // RLS: buyer or finance
  if (!inv) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const pdf = await invoicePdf(inv);
  return new NextResponse(Buffer.from(pdf), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${inv.invoice_number.replace(/\//g, '-')}.pdf"` },
  });
}

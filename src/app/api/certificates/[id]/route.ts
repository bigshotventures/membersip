import { NextResponse } from 'next/server';
import { admin } from '@/lib/supabase/admin';
import { certificatePdf } from '@/lib/pdf';
import { fmtDate } from '@/lib/utils';

/** Certificates are public by serial so they can be shared/verified (e.g. on LinkedIn). */
export async function GET(_: Request, { params }: { params: { id: string } }) {
  const { data: c } = await admin().from('certificates')
    .select('*, user:profiles(full_name), course:courses(title, creator:creators(name, theme))')
    .or(`id.eq.${/^[0-9a-f-]{36}$/i.test(params.id) ? params.id : '00000000-0000-0000-0000-000000000000'},serial.eq.${params.id.replace(/[^A-Z0-9]/gi, '')}`)
    .maybeSingle();
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const pdf = await certificatePdf({ name: c.user.full_name || 'Member', course: c.course.title, creator: c.course.creator.name, serial: c.serial, date: fmtDate(c.issued_at), accent: c.course.creator.theme?.accent });
  return new NextResponse(Buffer.from(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="certificate-${c.serial}.pdf"` } });
}

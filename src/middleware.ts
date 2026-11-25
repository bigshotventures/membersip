import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const PROTECTED = [/^\/me/, /^\/account/, /^\/studio/, /^\/admin/, /^\/notifications/];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(list: { name: string; value: string; options?: any }[]) {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );
  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  if (!user && PROTECTED.some((r) => r.test(path))) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', path + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  // Referral capture: ?ref=CODE stays in a cookie for 30 days
  const ref = request.nextUrl.searchParams.get('ref');
  if (ref && /^[a-z0-9]{4,16}$/i.test(ref)) {
    response.cookies.set('ref', ref, { maxAge: 60 * 60 * 24 * 30, path: '/' });
  }
  // Stable anonymous visitor id for A/B tests
  if (!request.cookies.get('vid')) {
    response.cookies.set('vid', crypto.randomUUID(), { maxAge: 60 * 60 * 24 * 365, path: '/' });
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/webhooks|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};

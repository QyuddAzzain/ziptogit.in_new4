import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const authPath = pathname === '/login' || pathname === '/daftar';
  const publicPath =
    authPath ||
    pathname === '/login/lupa-password' ||
    pathname === '/reset-password' ||
    pathname === '/bantuan' ||
    pathname === '/privasi' ||
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico' ||
    pathname === '/sw.js' ||
    pathname === '/manifest.webmanifest' ||
    pathname === '/offline.html' ||
    pathname.startsWith('/icons/');

  // Public assets/pages must stay reachable even when Supabase env vars are
  // temporarily missing. Protected routes fail explicitly instead of throwing
  // a generic Web Handler exception from createServerClient().
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    if (publicPath) return NextResponse.next();
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'SERVER_MISCONFIGURED' }, { status: 503 });
    return new NextResponse('Supabase environment belum dikonfigurasi.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: cookiesToSet => {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user && pathname.startsWith('/api/')) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  if (!user && !publicPath) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (user && !pathname.startsWith('/api/')) {
    // ponytail: query shop_members tiap request halaman untuk cek status onboarding;
    // cukup untuk skala UMKM saat ini, pertimbangkan cache di JWT app_metadata jika traffic naik.
    const { data: member } = await supabase
      .from('shop_members')
      .select('id')
      .eq('user_id', user.id)
      .eq('active', true)
      .maybeSingle();

    if (member && authPath) {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      return NextResponse.redirect(url);
    }
    if (!member && !authPath) {
      const url = request.nextUrl.clone();
      url.pathname = '/daftar';
      return NextResponse.redirect(url);
    }
  }

  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Frame-Options', 'DENY');
  return response;
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };

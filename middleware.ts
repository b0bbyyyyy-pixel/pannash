import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isPortalHost, isPortalPublicPath, portalRequestHost } from '@/lib/merchantPortal/hosts';

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const host = portalRequestHost(request);
  const portalHosts = process.env.PORTAL_HOSTS;
  if (isPortalHost(host, portalHosts)) {
    if (isPortalPublicPath(pathname)) return NextResponse.next();
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.redirect(new URL('/merchant/login', request.url));
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  const response = NextResponse.next();

  // Use getSession() here — reads the JWT from the cookie locally,
  // NO network round-trip. getUser() (which validates via Supabase API)
  // should only be used inside server components / API routes.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: object) {
          const extra = request.nextUrl.pathname.startsWith('/m')
            ? { maxAge: 60 * 60 * 24 * 60 }
            : {};
          response.cookies.set({ name, value, ...options as object, ...extra });
        },
        remove(name: string, options: object) {
          response.cookies.set({ name, value: '', ...options as object });
        },
      },
    }
  );

  const { data: { session } } = await supabase.auth.getSession();

  const iphone = /iPhone|iPod/i.test(request.headers.get('user-agent') ?? '');
  const landingOff = request.cookies.get('gostwrk_m_landing')?.value === '0';
  const stayOnCrm = request.cookies.get('gostwrk_full_crm')?.value === '1';
  const phoneLanding = iphone && !landingOff && !stayOnCrm;

  // Redirect logged-in users away from /auth
  if (pathname.startsWith('/auth') && session) {
    const dest = phoneLanding ? '/m/text' : '/dashboard';
    return NextResponse.redirect(new URL(dest, request.url));
  }

  if (
    session &&
    phoneLanding &&
    (pathname === '/' || pathname === '/dashboard' || pathname === '/inbox')
  ) {
    return NextResponse.redirect(new URL('/m/text', request.url));
  }

  // Protected routes — redirect to /auth if not logged in
  const protectedPrefixes = [
    '/dashboard', '/campaigns', '/leads', '/settings',
    '/onboarding', '/agent', '/inbox', '/dialer', '/calendar',
    '/followups', '/hot-leads', '/m',
  ];
  const isProtected = protectedPrefixes.some((p) => (
    p === '/m'
      ? pathname === '/m' || pathname.startsWith('/m/')
      : pathname.startsWith(p)
  ));
  if (isProtected && !session) {
    return NextResponse.redirect(new URL('/auth', request.url));
  }

  return response;
}

export const config = {
  // Pages as before, plus API so portal hosts can lock non-merchant routes.
  // Non-portal hosts return next() immediately for /api/*.
  matcher: [
    '/((?!_next/static|_next/image|favicon|images/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?)$).*)',
  ],
};

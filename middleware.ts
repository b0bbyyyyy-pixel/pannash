import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
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
          response.cookies.set({ name, value, ...options as object });
        },
        remove(name: string, options: object) {
          response.cookies.set({ name, value: '', ...options as object });
        },
      },
    }
  );

  const { data: { session } } = await supabase.auth.getSession();

  const pathname = request.nextUrl.pathname;

  // Redirect logged-in users away from /auth
  if (pathname.startsWith('/auth') && session) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // Protected routes — redirect to /auth if not logged in
  const protectedPrefixes = [
    '/dashboard', '/campaigns', '/leads', '/settings',
    '/onboarding', '/agent', '/inbox', '/dialer', '/calendar',
    '/followups', '/hot-leads',
  ];
  const isProtected = protectedPrefixes.some((p) => pathname.startsWith(p));
  if (isProtected && !session) {
    return NextResponse.redirect(new URL('/auth', request.url));
  }

  return response;
}

export const config = {
  // Only run middleware on actual page routes — skip _next/static,
  // _next/image, favicon, api routes (they handle auth themselves), etc.
  matcher: [
    '/((?!_next/static|_next/image|favicon|api/|images/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?)$).*)',
  ],
};

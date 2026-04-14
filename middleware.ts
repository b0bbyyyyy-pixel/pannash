import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          response.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  // IMPORTANT: getUser() validates the JWT and refreshes if needed
  // getSession() only reads from cookies without validation
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protect authenticated routes
  const protectedRoutes = ['/dashboard', '/campaigns', '/leads', '/settings', '/onboarding'];
  const isProtectedRoute = protectedRoutes.some(route => 
    request.nextUrl.pathname.startsWith(route)
  );

  if (isProtectedRoute && !user) {
    return NextResponse.redirect(new URL('/auth', request.url));
  }

  // Public pages that don't require authentication
  const publicPages = ['/', '/contact', '/privacy', '/terms'];
  const isPublicPage = publicPages.includes(request.nextUrl.pathname);

  // Redirect logged-in users away from /auth to dashboard
  if (request.nextUrl.pathname.startsWith('/auth') && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // Allow public pages without authentication
  if (isPublicPage) {
    return response;
  }

  return response;
}

export const config = {
  matcher: ['/', '/contact', '/privacy', '/terms', '/dashboard/:path*', '/campaigns/:path*', '/leads/:path*', '/settings/:path*', '/onboarding/:path*', '/auth/:path*'],
};
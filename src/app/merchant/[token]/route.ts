import { NextRequest, NextResponse } from 'next/server';
import { MP_SESSION_COOKIE, sessionCookieOptions, signPortalSession, verifyToken } from '@/lib/merchantPortal/tokens';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const login = new URL('/merchant/login', req.url);
  const portal = await verifyToken(token);
  if (!portal) return NextResponse.redirect(login);
  const signed = signPortalSession(portal.id);
  if (!signed) return NextResponse.redirect(login);
  const res = NextResponse.redirect(new URL('/merchant', req.url));
  res.cookies.set(
    MP_SESSION_COOKIE,
    signed,
    sessionCookieOptions({ secure: req.nextUrl.protocol === 'https:' }),
  );
  return res;
}

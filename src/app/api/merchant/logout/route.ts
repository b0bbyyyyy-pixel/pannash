import { NextRequest, NextResponse } from 'next/server';
import { MP_SESSION_COOKIE, sessionCookieOptions } from '@/lib/merchantPortal/tokens';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(MP_SESSION_COOKIE, '', {
    ...sessionCookieOptions({ secure: req.nextUrl.protocol === 'https:' }),
    maxAge: 0,
  });
  return res;
}

/**
 * Prefer the cookie JWT (no Auth API call). getUser() hits GoTrue on every
 * request and is what 429s the inbox switchboard/pulse pollers.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getRequestUser(supabase: any): Promise<{ id: string } | null> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const fromSession = sessionData?.session?.user;
    if (fromSession?.id) return fromSession;
  } catch {
    /* fall through */
  }
  try {
    const { data: userData } = await supabase.auth.getUser();
    return userData?.user ?? null;
  } catch {
    return null;
  }
}

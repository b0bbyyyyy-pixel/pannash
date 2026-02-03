import { createBrowserClient, createServerClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Client for browser-side (e.g., React components)
// IMPORTANT: Use createBrowserClient for SSR compatibility (uses cookies, not localStorage)
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);

// Server-side client (for API routes, server components, middleware)
export function createSupabaseServerClient(cookieStore: any) {
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name) {
        return cookieStore.get(name)?.value;
      },
      set(name, value, options) {
        cookieStore.set({ name, value, ...options });
      },
      remove(name, options) {
        cookieStore.set({ name, value: '', ...options });
      },
    },
  });
}
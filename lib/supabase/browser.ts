import { createBrowserClient } from '@supabase/ssr';

let client: ReturnType<typeof createBrowserClient> | undefined;

export function createClient() {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Client Components are prerendered during `next build`. Do not let a missing
  // Vercel env var crash the build; runtime calls in the browser still require
  // the real values and will fail clearly if they are not configured.
  if (typeof window === 'undefined') {
    client = createBrowserClient(
      url || 'https://placeholder.invalid',
      key || 'build-placeholder-key',
    );
    return client;
  }

  if (!url || !key) {
    throw new Error('Supabase environment variables are missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel.');
  }

  client = createBrowserClient(url, key);
  return client;
}

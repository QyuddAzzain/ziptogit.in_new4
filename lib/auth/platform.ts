import { requireUser } from '@/lib/auth/guards';

/**
 * Admin platform (pemilik situs, BUKAN owner satu toko) ditentukan lewat daftar
 * email di env var PLATFORM_ADMIN_EMAILS (dipisah koma), bukan lewat kolom role
 * baru di database — supaya tidak perlu migration/endpoint tambahan yang
 * memperbesar attack surface. Isi env ini di Vercel dengan email akun Anda.
 */
export async function requirePlatformAdmin() {
  const { supabase, user } = await requireUser();
  const allowList = String(process.env.PLATFORM_ADMIN_EMAILS || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
  const email = String(user.email || '').toLowerCase();
  if (!allowList.length || !email || !allowList.includes(email)) {
    throw new Error('FORBIDDEN');
  }
  return { supabase, user };
}

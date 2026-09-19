import type { SupabaseClient } from '@supabase/supabase-js';

// Batas fitur untuk toko yang belum upgrade ke Tier Pro.
// Ubah nilainya di sini saja bila kebijakan bisnis berubah.
export const FREE_TIER_LIMITS = {
  maxProducts: 20,
  maxActiveMembers: 2, // termasuk owner (owner + 1 kasir) — dikonfirmasi user 15 Sept 2026
};

export type ShopTierInfo = { tier: string; isPro: boolean; tierExpiresAt: string | null };

/**
 * Cek status tier toko. Tier "pro" yang sudah lewat tier_expires_at dianggap
 * kembali ke "free" (fail-safe: jangan biarkan tier lama expired tetap tanpa batas).
 */
export async function getShopTier(supabase: SupabaseClient, shopId: string): Promise<ShopTierInfo> {
  const { data } = await supabase.from('shops').select('tier, tier_expires_at').eq('id', shopId).maybeSingle();
  const tier = data?.tier || 'free';
  const tierExpiresAt = data?.tier_expires_at ?? null;
  const stillValid = tier === 'pro' && (!tierExpiresAt || new Date(tierExpiresAt).getTime() > Date.now());
  return { tier: stillValid ? 'pro' : 'free', isPro: stillValid, tierExpiresAt };
}

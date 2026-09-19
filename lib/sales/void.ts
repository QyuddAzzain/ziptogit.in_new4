import type { SupabaseClient } from '@supabase/supabase-js';
import type { SaleRecord } from '@/lib/sales/types';

const KNOWN_VOID_ERRORS = ['ALREADY_VOIDED', 'SALE_NOT_FOUND', 'FORBIDDEN'] as const;

// Void = SOFT DELETE: baris `sales` tidak pernah di-DELETE, hanya status -> 'voided'
// (+ void_reason, voided_by, voided_at). Stok dikembalikan & audit log SALE_VOIDED ditulis
// atomik di dalam RPC void_sale_transaction.
export async function voidSale(supabase: SupabaseClient, userId: string, shopId: string, saleId: string, reason: string): Promise<SaleRecord> {
  const { data, error } = await supabase.rpc('void_sale_transaction', {
    p_shop_id: shopId,
    p_user_id: userId,
    p_sale_id: saleId,
    p_reason: reason,
  });
  if (error) throw new Error(KNOWN_VOID_ERRORS.find(code => error.message.includes(code)) ?? error.message);

  const { data: row, error: saleError } = await supabase.from('sales').select('*').eq('id', data).eq('shop_id', shopId).single();
  if (saleError) throw saleError;
  return row as SaleRecord;
}

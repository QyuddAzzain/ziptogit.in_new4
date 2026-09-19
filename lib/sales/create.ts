import type { SupabaseClient } from '@supabase/supabase-js';
import type { SaleInput } from '@/lib/validation/schemas';
import type { CreatedSale, SaleRecord } from '@/lib/sales/types';

// Kode error dari RPC create_sale_transaction yang dipetakan apa adanya ke route.
const KNOWN_SALE_ERRORS = [
  'INSUFFICIENT_STOCK',
  'PRODUCT_NOT_FOUND',
  'FORBIDDEN',
  'INSUFFICIENT_PAYMENT',
  'INVALID_CASH_RECEIVED',
  'INVALID_QUANTITY',
  'INVALID_ITEMS',
  'INVALID_PAYMENT_METHOD',
] as const;

// Nota + potong stok + mutasi stok + pembayaran + audit log berjalan atomik di dalam
// satu fungsi Postgres (create_sale_transaction). Gagal di tengah = rollback otomatis.
export async function createSale(supabase: SupabaseClient, userId: string, shopId: string, input: SaleInput): Promise<CreatedSale> {
  const { data, error } = await supabase.rpc('create_sale_transaction', {
    p_shop_id: shopId,
    p_user_id: userId,
    p_items: input.items,
    p_discount: input.discount,
    p_payment_method: input.payment_method,
    p_cash_received: input.cash_received,
  });
  if (error) throw new Error(KNOWN_SALE_ERRORS.find(code => error.message.includes(code)) ?? error.message);

  const { data: row, error: saleError } = await supabase.from('sales').select('*').eq('id', data).eq('shop_id', shopId).single();
  if (saleError) throw saleError;
  const sale = row as SaleRecord;

  const cashReceived = Number(input.cash_received ?? 0);
  const grandTotal = Number(sale.grand_total ?? 0);
  return {
    ...sale,
    cash_received: cashReceived,
    change_amount: sale.payment_method === 'cash' ? Math.max(cashReceived - grandTotal, 0) : 0,
  };
}

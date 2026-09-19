import { NextRequest } from 'next/server';
import { requireMemberRole } from '@/lib/auth/guards';
import { voidSaleSchema } from '@/lib/validation/schemas';
import { voidSale } from '@/lib/sales/void';
import { ok, errorResponse, errorMessage } from '@/lib/utils/response';

// Hanya owner. Soft delete (status -> 'voided'), bukan DELETE; audit log SALE_VOIDED ditulis
// atomik di RPC void_sale_transaction bersama pengembalian stok.
export async function POST(req: NextRequest) {
  try {
    const { supabase, user, member } = await requireMemberRole(['owner']);
    const parsed = voidSaleSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return errorResponse('sale_id dan reason wajib', 422);
    const sale = await voidSale(supabase, user.id, member.shop_id, parsed.data.sale_id, parsed.data.reason);
    return ok(sale);
  } catch (e) {
    const message = errorMessage(e);
    if (message === 'UNAUTHORIZED') return errorResponse('Belum login', 401);
    if (message === 'FORBIDDEN') return errorResponse('Akses ditolak', 403);
    if (message === 'ALREADY_VOIDED') return errorResponse('Transaksi sudah dibatalkan', 409);
    if (message === 'SALE_NOT_FOUND') return errorResponse('Transaksi tidak ditemukan', 404);
    return errorResponse('Gagal membatalkan transaksi', 500);
  }
}

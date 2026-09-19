import { NextRequest } from 'next/server';
import { requireMemberRole } from '@/lib/auth/guards';
import { dashboardQuerySchema, saleSchema } from '@/lib/validation/schemas';
import { createSale } from '@/lib/sales/create';
import { ok, errorResponse, errorMessage } from '@/lib/utils/response';

const SALE_LIST_COLUMNS = 'id,invoice_number,subtotal,discount,tax,grand_total,payment_method,payment_status,status,created_at';

// sale_items punya DUA foreign key ke sales sejak migration 008 (sale_id -> sales.id dan
// (shop_id, sale_id) -> sales(shop_id, id)). Embed tanpa hint membuat PostgREST membalas
// 300 (PGRST201: relasi ambigu). Selalu sebut nama FK-nya secara eksplisit.
const DASHBOARD_COLUMNS =
  'id,invoice_number,grand_total,tax,status,created_at,sale_items!sale_items_sale_id_fkey(product_id,product_name,quantity,subtotal)';
const PAGE_SIZE = 1000; // batas baris per request PostgREST
const MAX_PAGES = 5; // maksimal 5.000 baris per permintaan dashboard

const SALE_ERROR_MESSAGES: Record<string, string> = {
  PRODUCT_NOT_FOUND: 'Produk tidak ditemukan',
  INSUFFICIENT_STOCK: 'Stok tidak mencukupi',
  INSUFFICIENT_PAYMENT: 'Uang diterima belum mencukupi total transaksi',
  INVALID_CASH_RECEIVED: 'Nominal uang diterima tidak valid untuk metode pembayaran ini',
  INVALID_QUANTITY: 'Jumlah item tidak valid',
  INVALID_ITEMS: 'Item transaksi tidak valid',
  INVALID_PAYMENT_METHOD: 'Metode pembayaran tidak valid',
  FORBIDDEN: 'Akses ditolak',
};
const SALE_CLIENT_ERRORS = ['PRODUCT_NOT_FOUND', 'INSUFFICIENT_STOCK', 'INSUFFICIENT_PAYMENT', 'INVALID_CASH_RECEIVED', 'INVALID_QUANTITY', 'INVALID_ITEMS', 'INVALID_PAYMENT_METHOD'];

function authAwareError(e: unknown, fallback: string) {
  const message = errorMessage(e);
  if (message === 'UNAUTHORIZED') return errorResponse('Belum login', 401);
  if (message === 'FORBIDDEN') return errorResponse('Akses ditolak', 403);
  console.error('api/sales error:', message);
  return errorResponse(fallback, 500);
}

// GET /api/sales?view=dashboard&from=YYYY-MM-DD
// Data mentah dashboard (transaksi + item) untuk toko milik sesi login. shop_id SELALU diambil
// dari keanggotaan sesi, bukan dari klien. Field `role` dipakai dashboard untuk menentukan
// apakah net profit (butuh harga modal) boleh ditampilkan.
async function getDashboardSales(req: NextRequest) {
  try {
    const { supabase, member } = await requireMemberRole(['owner', 'cashier']);
    const parsed = dashboardQuerySchema.safeParse({ from: req.nextUrl.searchParams.get('from') });
    if (!parsed.success) return errorResponse('Parameter from harus berformat YYYY-MM-DD.', 422);
    const fromIso = `${parsed.data.from}T00:00:00+07:00`;

    const shopRes = await supabase.from('shops').select('name').eq('id', member.shop_id).maybeSingle();
    if (shopRes.error) throw shopRes.error;

    const rows: unknown[] = [];
    let truncated = true;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const start = page * PAGE_SIZE;
      const { data, error } = await supabase
        .from('sales')
        .select(DASHBOARD_COLUMNS)
        .eq('shop_id', member.shop_id)
        .gte('created_at', fromIso)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(start, start + PAGE_SIZE - 1);
      if (error) throw error;
      const chunk = data ?? [];
      rows.push(...chunk);
      if (chunk.length < PAGE_SIZE) { truncated = false; break; }
    }
    return ok({ shop_name: shopRes.data?.name ?? null, role: member.role, rows, truncated });
  } catch (e) {
    return authAwareError(e, 'Gagal mengambil data dashboard');
  }
}

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get('view') === 'dashboard') return getDashboardSales(req);
  try {
    const { supabase, member } = await requireMemberRole(['owner', 'cashier']);
    const { data, error } = await supabase
      .from('sales')
      .select(SALE_LIST_COLUMNS)
      .eq('shop_id', member.shop_id)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    return ok(data);
  } catch (e) {
    return authAwareError(e, 'Gagal mengambil transaksi');
  }
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, user, member } = await requireMemberRole(['owner', 'cashier']);
    const parsed = saleSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return errorResponse('Data transaksi tidak valid', 422);
    const sale = await createSale(supabase, user.id, member.shop_id, parsed.data);
    return ok(sale, 201);
  } catch (e) {
    const message = errorMessage(e);
    const status = message === 'FORBIDDEN' ? 403 : SALE_CLIENT_ERRORS.includes(message) ? 409 : 500;
    return errorResponse(SALE_ERROR_MESSAGES[message] || 'Transaksi gagal', status);
  }
}

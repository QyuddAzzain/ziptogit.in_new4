import { NextRequest } from 'next/server';
import { requireMemberRole } from '@/lib/auth/guards';
import { ok, errorResponse } from '@/lib/utils/response';
import { getShopTier } from '@/lib/subscription/limits';

type ReportRow = {
  id: string;
  invoice_number: string;
  grand_total: number | string | null;
  subtotal: number | string | null;
  discount: number | string | null;
  tax: number | string | null;
  payment_method: string;
  payment_status: string;
  status: string;
  created_at: string;
};

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function dateOnly(value: string | null): string | null {
  if (!value || !DATE_ONLY.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00+07:00`);
  return Number.isNaN(parsed.getTime()) ? null : value;
}

function jakartaDateOnly(offsetDays = 0): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(new Date());
  const year = Number(parts.find(p => p.type === 'year')?.value);
  const month = Number(parts.find(p => p.type === 'month')?.value);
  const day = Number(parts.find(p => p.type === 'day')?.value);
  const date = new Date(Date.UTC(year, month - 1, day + offsetDays));
  return date.toISOString().slice(0, 10);
}

function toStartIso(date: string): string {
  return `${date}T00:00:00+07:00`;
}

function toEndIso(date: string): string {
  return `${date}T23:59:59.999+07:00`;
}

export async function GET(req: NextRequest) {
  try {
    const { supabase, member } = await requireMemberRole(['owner']);
    const tierInfo = await getShopTier(supabase, member.shop_id);
    const params = req.nextUrl.searchParams;

    const today = jakartaDateOnly();
    const freeFrom = jakartaDateOnly(-9); // 10 hari kalender: hari ini + 9 hari sebelumnya.
    const rawFrom = params.get('from');
    const rawTo = params.get('to');

    const parsedFrom = dateOnly(rawFrom);
    const parsedTo = dateOnly(rawTo);
    if (rawFrom && !parsedFrom) return errorResponse('Parameter from harus berformat YYYY-MM-DD.', 400);
    if (rawTo && !parsedTo) return errorResponse('Parameter to harus berformat YYYY-MM-DD.', 400);

    const requestedFrom = parsedFrom ?? (tierInfo.isPro ? null : freeFrom);
    const requestedTo = parsedTo ?? today;

    if (requestedFrom && requestedTo && requestedFrom > requestedTo) {
      return errorResponse('Rentang laporan tidak valid: from tidak boleh setelah to.', 400);
    }

    let effectiveFrom = requestedFrom;
    let effectiveTo = requestedTo;
    const limited = !tierInfo.isPro && (
      (effectiveFrom ? effectiveFrom < freeFrom : true) ||
      (effectiveTo ? effectiveTo > today : true)
    );
    if (!tierInfo.isPro) {
      effectiveFrom = effectiveFrom && effectiveFrom > freeFrom ? effectiveFrom : freeFrom;
      effectiveTo = effectiveTo && effectiveTo < today ? effectiveTo : today;
      // A Free report is always evaluated inside the rolling 10-day window.
      if (effectiveTo < freeFrom) effectiveTo = today;
    }

    const query = supabase
      .from('sales')
      .select('id,invoice_number,grand_total,subtotal,discount,tax,payment_method,payment_status,status,created_at')
      .eq('shop_id', member.shop_id)
      .eq('status', 'completed')
      .order('created_at', { ascending: false });

    const ranged = effectiveFrom && effectiveTo
      ? query.gte('created_at', toStartIso(effectiveFrom)).lte('created_at', toEndIso(effectiveTo))
      : query;

    const { data, error } = await ranged;
    if (error) throw error;

    const rows = (data ?? []) as ReportRow[];
    const sum = (key: keyof ReportRow) => rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);

    return ok({
      tier: tierInfo.isPro ? 'pro' : 'free',
      limited,
      requestedFrom,
      requestedTo,
      from: effectiveFrom,
      to: effectiveTo,
      transactions: rows.length,
      omzet: sum('grand_total'),
      subtotal: sum('subtotal'),
      discount: sum('discount'),
      tax: sum('tax'),
      rows,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Gagal mengambil laporan';
    if (message === 'UNAUTHORIZED') return errorResponse('Belum login', 401);
    if (message === 'FORBIDDEN') return errorResponse('Akses laporan ditolak.', 403);
    console.error('reports api error', message);
    return errorResponse('Gagal mengambil laporan', 500);
  }
}

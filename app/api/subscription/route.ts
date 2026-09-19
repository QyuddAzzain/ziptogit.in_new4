import { NextRequest } from 'next/server';
import { requireMemberRole } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { ok, errorResponse } from '@/lib/utils/response';
import { FREE_TIER_LIMITS, getShopTier } from '@/lib/subscription/limits';
import { MANUAL_TRANSFER_CHANNEL, MANUAL_TRANSFER_ACCOUNTS } from '@/lib/subscription/manual-transfer';

// Harga Tier Pro (rupiah) per 30 hari. Ubah di sini saja bila harga berubah.
const PRO_PRICE_IDR = 20000;

// Jendela waktu baris "pending" masih dianggap berlaku dan dipakai ulang
// alih-alih membuat baris baru (mencegah baris pending menumpuk tanpa batas
// setiap owner klik tombol upgrade berkali-kali). Lewat jendela ini, baris
// lama dianggap kedaluwarsa dan permintaan baru boleh dibuat.
const PAKASIR_PENDING_REUSE_MS = 30 * 60 * 1000; // 30 menit
const MANUAL_PENDING_REUSE_MS = 24 * 60 * 60 * 1000; // 24 jam

type AdminClient = ReturnType<typeof createAdminClient>;

// Cari baris pending milik toko ini yang masih dalam jendela reuse, untuk
// kanal pembayaran tertentu (Pakasir: payment_channel kosong; transfer
// manual: payment_channel = MANUAL_TRANSFER_CHANNEL).
async function findReusablePendingPayment(admin: AdminClient, shopId: string, channel: string | null, windowMs: number) {
  const cutoffIso = new Date(Date.now() - windowMs).toISOString();
  let query = admin
    .from('subscription_payments')
    .select('merchant_order_id, amount, created_at')
    .eq('shop_id', shopId)
    .eq('status', 'pending')
    .gte('created_at', cutoffIso)
    .order('created_at', { ascending: false })
    .limit(1);
  query = channel ? query.eq('payment_channel', channel) : query.is('payment_channel', null);
  const { data } = await query.maybeSingle();
  return data;
}

// GET: status tier toko yang sedang login (owner & kasir boleh lihat, hanya owner yang boleh upgrade).
export async function GET(req: NextRequest) {
  try {
    const { supabase, member } = await requireMemberRole(['owner', 'cashier']);
    const tierInfo = await getShopTier(supabase, member.shop_id);
    const orderId = String(req.nextUrl.searchParams.get('order_id') || '').trim();
    let paymentStatus: string | null = null;
    if (orderId) {
      const { data: payment } = await supabase
        .from('subscription_payments')
        .select('status')
        .eq('shop_id', member.shop_id)
        .eq('merchant_order_id', orderId)
        .maybeSingle();
      paymentStatus = payment?.status ?? null;
    }
    const pakasirConfigured = Boolean(
      String(process.env.PAKASIR_PROJECT_SLUG || '').trim() &&
      String(process.env.PAKASIR_API_KEY || '').trim() &&
      String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim() &&
      String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim(),
    );
    return ok({
      ...tierInfo,
      priceIDR: PRO_PRICE_IDR,
      canUpgrade: member.role === 'owner',
      pakasirConfigured,
      paymentStatus,
      maxProducts: FREE_TIER_LIMITS.maxProducts,
      maxActiveMembers: FREE_TIER_LIMITS.maxActiveMembers,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Gagal memeriksa status tier';
    if (message === 'UNAUTHORIZED') return errorResponse('Belum login', 401);
    if (message === 'FORBIDDEN') return errorResponse('Akses ditolak', 403);
    return errorResponse('Gagal memeriksa status tier', 500);
  }
}

export async function POST(req: NextRequest) {
  const action = req.nextUrl.searchParams.get('action') || 'create';
  if (action === 'webhook') return handlePakasirWebhook(req);
  if (action === 'manual') return handleManualTransfer(req);
  return handleCreatePayment(req);
}

// Owner memulai upgrade: buat catatan pembayaran pending + link bayar Pakasir.
// Ini TIDAK langsung menaikkan tier — tier baru naik setelah webhook Pakasir
// terverifikasi lewat handlePakasirWebhook di bawah.
async function handleCreatePayment(req: NextRequest) {
  try {
    const { supabase, member } = await requireMemberRole(['owner']);
    const slug = String(process.env.PAKASIR_PROJECT_SLUG || '').trim();
    const apiKey = String(process.env.PAKASIR_API_KEY || '').trim();
    const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
    const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    if (!slug || !apiKey) return errorResponse('Pembayaran Pakasir belum dikonfigurasi lengkap. Pastikan PAKASIR_PROJECT_SLUG dan PAKASIR_API_KEY tersedia di Vercel Production.', 503);
    if (!supabaseUrl || !serviceRoleKey) return errorResponse('Konfigurasi server pembayaran belum lengkap. Pastikan NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY tersedia di Vercel Production.', 503);

    const tierInfo = await getShopTier(supabase, member.shop_id);
    if (tierInfo.isPro) return errorResponse('Toko ini sudah Tier Pro dan masih aktif.', 400);

    // Pakai admin client (service role): tabel subscription_payments hanya
    // punya RLS policy SELECT untuk owner, tidak ada policy INSERT — insert
    // lewat client user-scoped biasa akan selalu ditolak RLS.
    const admin = createAdminClient();

    // Pakai ulang baris pending Pakasir yang masih dalam jendela berlaku,
    // supaya klik tombol "Bayar via Pakasir" berkali-kali tidak menumpuk
    // baris pending baru tanpa batas. Lewat jendela ini dianggap kedaluwarsa
    // dan boleh dibuatkan baris baru.
    const reusable = await findReusablePendingPayment(admin, member.shop_id, null, PAKASIR_PENDING_REUSE_MS);
    const merchantOrderId = reusable?.merchant_order_id ?? `POS-PRO-${member.shop_id.slice(0, 8)}-${Date.now()}`;

    // Bangun paymentUrl LEBIH DULU sebelum insert: kalau PAKASIR_RETURN_URL
    // ternyata bukan URL valid, ini gagal di sini dan TIDAK ADA baris pending
    // baru yang sempat tertulis ke database.
    const redirectBase = String(process.env.PAKASIR_RETURN_URL || '').trim();
    let paymentUrl = `https://app.pakasir.com/pay/${encodeURIComponent(slug)}/${PRO_PRICE_IDR}?order_id=${encodeURIComponent(merchantOrderId)}`;
    if (redirectBase) {
      const returnUrl = new URL(redirectBase);
      returnUrl.searchParams.set('payment', 'success');
      returnUrl.searchParams.set('order_id', merchantOrderId);
      paymentUrl += `&redirect=${encodeURIComponent(returnUrl.toString())}`;
    }

    if (!reusable) {
      const { error: insertError } = await admin.from('subscription_payments').insert({
        shop_id: member.shop_id,
        merchant_order_id: merchantOrderId,
        tier: 'pro',
        amount: PRO_PRICE_IDR,
        status: 'pending',
      });
      if (insertError) {
        console.error('subscription payment insert failed', { code: insertError.code, message: insertError.message });
        throw new Error('Gagal menyiapkan transaksi pembayaran. Konfigurasi database pembayaran perlu diperiksa.');
      }
    }

    return ok({ paymentUrl, merchantOrderId, amount: PRO_PRICE_IDR }, reusable ? 200 : 201);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Gagal membuat pembayaran upgrade tier';
    return errorResponse(message, message === 'UNAUTHORIZED' ? 401 : message === 'FORBIDDEN' ? 403 : 500);
  }
}

// Owner memulai upgrade via transfer bank/e-wallet manual (alternatif Pakasir).
// Sama seperti handleCreatePayment: cuma buat catatan pending + info rekening
// tujuan. Tier baru naik setelah admin platform mengonfirmasi lewat
// POST /api/admin?action=confirm-manual (lihat app/api/admin/route.ts), yang
// memanggil RPC confirm_subscription_payment yang sama dengan webhook Pakasir.
async function handleManualTransfer(req: NextRequest) {
  try {
    const { supabase, member } = await requireMemberRole(['owner']);
    const tierInfo = await getShopTier(supabase, member.shop_id);
    if (tierInfo.isPro) return errorResponse('Toko ini sudah Tier Pro dan masih aktif.', 400);

    const admin = createAdminClient();

    // Pakai ulang baris pending transfer manual yang masih dalam jendela
    // berlaku (24 jam — cukup untuk waktu tunggu konfirmasi admin), supaya
    // owner yang berkali-kali buka halaman Pengaturan tidak menumpuk banyak
    // kode referensi berbeda untuk transfer yang sama.
    const reusable = await findReusablePendingPayment(admin, member.shop_id, MANUAL_TRANSFER_CHANNEL, MANUAL_PENDING_REUSE_MS);
    const merchantOrderId = reusable?.merchant_order_id ?? `POS-MANUAL-${member.shop_id.slice(0, 8)}-${Date.now()}`;

    if (!reusable) {
      const { error: insertError } = await admin.from('subscription_payments').insert({
        shop_id: member.shop_id,
        merchant_order_id: merchantOrderId,
        tier: 'pro',
        amount: PRO_PRICE_IDR,
        status: 'pending',
        payment_channel: MANUAL_TRANSFER_CHANNEL,
      });
      if (insertError) throw insertError;
    }

    return ok(
      {
        merchantOrderId,
        amount: PRO_PRICE_IDR,
        accounts: MANUAL_TRANSFER_ACCOUNTS,
        instructions:
          `Transfer tepat Rp ${PRO_PRICE_IDR.toLocaleString('id-ID')} ke salah satu tujuan di atas, ` +
          `lalu kirim bukti transfer beserta kode ${merchantOrderId} ke admin lewat WhatsApp/email di halaman Bantuan. ` +
          `Tier Pro aktif setelah admin mengonfirmasi pembayaran.`,
      },
      reusable ? 200 : 201,
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Gagal membuat permintaan transfer manual';
    return errorResponse(message, message === 'UNAUTHORIZED' ? 401 : message === 'FORBIDDEN' ? 403 : 500);
  }
}

// Webhook publik dari Pakasir. JANGAN PERNAH percaya body webhook mentah —
// selalu verifikasi ulang lewat Transaction Detail API Pakasir sebelum
// menaikkan tier toko (pola ini disalin dari implementasi Nanggroe Top Up
// yang sudah berjalan live).
async function handlePakasirWebhook(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const project = String(body?.project || '').trim();
    const order = String(body?.order_id || '').trim();
    const amount = Number(body?.amount);
    const status = String(body?.status || '').trim().toLowerCase();

    const slug = String(process.env.PAKASIR_PROJECT_SLUG || '').trim();
    const apiKey = String(process.env.PAKASIR_API_KEY || '').trim();
    if (!slug || !apiKey || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return new Response('Pakasir not configured', { status: 503 });
    }
    if (project !== slug || !order || !Number.isFinite(amount) || amount <= 0 || status !== 'completed') {
      return new Response('Invalid webhook', { status: 400 });
    }

    const detailUrl = new URL('https://app.pakasir.com/api/transactiondetail');
    detailUrl.searchParams.set('project', slug);
    detailUrl.searchParams.set('amount', String(amount));
    detailUrl.searchParams.set('order_id', order);
    detailUrl.searchParams.set('api_key', apiKey);

    const resp = await fetch(detailUrl, { method: 'GET', headers: { Accept: 'application/json' }, cache: 'no-store' });
    const payload = await resp.json().catch(() => ({}));
    const tx = payload?.transaction;
    if (!resp.ok || !tx) return new Response('Unable to verify transaction', { status: 502 });

    const verifiedOk =
      String(tx.project || '').trim() === slug &&
      String(tx.order_id || '').trim() === order &&
      Number(tx.amount) === amount &&
      String(tx.status || '').trim().toLowerCase() === 'completed';
    if (!verifiedOk) return new Response('Transaction mismatch', { status: 400 });

    const admin = createAdminClient();
    const { error } = await admin.rpc('confirm_subscription_payment', {
      p_merchant_order_id: order,
      p_amount: amount,
      p_reference: tx.payment_method ? `PAKASIR:${tx.payment_method}` : 'PAKASIR',
    });
    if (error) {
      console.error('subscription webhook RPC error', error.message);
      if (/SUBSCRIPTION_NOT_FOUND|AMOUNT_MISMATCH/.test(error.message)) return new Response('Invalid payment', { status: 400 });
      return new Response('Gagal proses', { status: 500 });
    }
    return new Response('SUCCESS', { status: 200 });
  } catch (e) {
    console.error('subscription webhook error', e);
    return new Response('Server Error', { status: 500 });
  }
}

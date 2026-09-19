import { createAdminClient } from '@/lib/supabase/admin';
import { requireMemberRole } from '@/lib/auth/guards';
import { requirePlatformAdmin } from '@/lib/auth/platform';
import { writeAudit } from '@/lib/audit/log';
import { ok,errorResponse } from '@/lib/utils/response';
import { FREE_TIER_LIMITS, getShopTier } from '@/lib/subscription/limits';
import { MANUAL_TRANSFER_CHANNEL } from '@/lib/subscription/manual-transfer';

export async function GET(request: Request){
  const scope = new URL(request.url).searchParams.get('scope');
  if (scope === 'platform') return getPlatformOverview();
  if (scope === 'manual-payments') return getPendingManualPayments();
  try { const {member}=await requireMemberRole(['owner']); return ok({shop_id:member.shop_id,role:member.role}); }
  catch { return errorResponse('Akses admin ditolak',403); }
}

// Daftar permintaan upgrade Tier Pro via transfer manual yang masih menunggu
// konfirmasi admin platform. Hanya PLATFORM_ADMIN_EMAILS yang boleh lihat.
async function getPendingManualPayments(){
  try {
    await requirePlatformAdmin();
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('subscription_payments')
      .select('merchant_order_id, shop_id, amount, status, created_at, shops(name)')
      .eq('payment_channel', MANUAL_TRANSFER_CHANNEL)
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return ok(data ?? []);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Gagal memuat permintaan transfer manual';
    return errorResponse(message === 'FORBIDDEN' ? 'Akses ditolak' : message === 'UNAUTHORIZED' ? 'Belum login' : message, message === 'FORBIDDEN' ? 403 : message === 'UNAUTHORIZED' ? 401 : 500);
  }
}

// Ringkasan seluruh toko di platform — HANYA untuk email yang terdaftar di
// PLATFORM_ADMIN_EMAILS (pemilik situs), bukan owner toko biasa. Memakai
// service role secara sengaja & sempit (hanya baca, hanya di endpoint ini)
// karena tujuannya memang melihat lintas-tenant untuk keperluan dukungan.
async function getPlatformOverview(){
  try {
    await requirePlatformAdmin();
    const admin = createAdminClient();
    const { data: shops, error } = await admin
      .from('shops')
      .select('id,name,business_type,tier,tier_expires_at,created_at')
      .order('created_at',{ ascending:false });
    if (error) throw error;

    const shopIds = (shops ?? []).map(s => s.id);
    const [{ data: members }, { data: products }, { data: sales }] = await Promise.all([
      admin.from('shop_members').select('shop_id').in('shop_id', shopIds).eq('active', true),
      admin.from('products').select('shop_id').in('shop_id', shopIds),
      admin.from('sales').select('shop_id,grand_total').in('shop_id', shopIds).eq('status','completed'),
    ]);

    const countBy = (rows: { shop_id: string }[] | null) => {
      const map = new Map<string, number>();
      for (const row of rows ?? []) map.set(row.shop_id, (map.get(row.shop_id) ?? 0) + 1);
      return map;
    };
    const memberCount = countBy(members);
    const productCount = countBy(products);
    const salesTotal = new Map<string, number>();
    const salesCount = countBy(sales);
    for (const row of sales ?? []) salesTotal.set(row.shop_id, (salesTotal.get(row.shop_id) ?? 0) + Number(row.grand_total || 0));

    const result = (shops ?? []).map(shop => ({
      ...shop,
      member_count: memberCount.get(shop.id) ?? 0,
      product_count: productCount.get(shop.id) ?? 0,
      sales_count: salesCount.get(shop.id) ?? 0,
      sales_total: salesTotal.get(shop.id) ?? 0,
    }));

    return ok(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Gagal memuat data platform';
    return errorResponse(message === 'FORBIDDEN' ? 'Akses ditolak' : message === 'UNAUTHORIZED' ? 'Belum login' : 'Gagal memuat data platform', message === 'FORBIDDEN' ? 403 : message === 'UNAUTHORIZED' ? 401 : 500);
  }
}

export async function POST(request: Request){
  const action = new URL(request.url).searchParams.get('action');
  if (action === 'confirm-manual') return confirmManualPayment(request);
  return createCashier(request);
}

// Admin platform mengonfirmasi pembayaran transfer manual yang sudah owner
// laporkan (lihat POST /api/subscription?action=manual). Memanggil ulang RPC
// confirm_subscription_payment yang sama dipakai webhook Pakasir — jadi tidak
// ada jalur baru untuk menaikkan tier, cuma cara verifikasi manualnya beda.
async function confirmManualPayment(request: Request){
  try {
    await requirePlatformAdmin();
    const body = await request.json().catch(() => ({}));
    const merchantOrderId = String(body?.merchant_order_id ?? '').trim();
    if (!merchantOrderId) return errorResponse('merchant_order_id wajib diisi', 400);

    const admin = createAdminClient();
    const { data: payment, error: findError } = await admin
      .from('subscription_payments')
      .select('merchant_order_id, amount, status, payment_channel')
      .eq('merchant_order_id', merchantOrderId)
      .maybeSingle();
    if (findError) throw findError;
    if (!payment) return errorResponse('Pembayaran tidak ditemukan', 404);
    if (payment.payment_channel !== MANUAL_TRANSFER_CHANNEL) {
      return errorResponse('Pembayaran ini bukan transfer manual, tidak bisa dikonfirmasi lewat sini', 400);
    }
    if (payment.status === 'paid') return ok({ merchant_order_id: merchantOrderId, status: 'paid' });

    const { error } = await admin.rpc('confirm_subscription_payment', {
      p_merchant_order_id: merchantOrderId,
      p_amount: payment.amount,
      p_reference: 'MANUAL_TF:confirmed-by-platform-admin',
    });
    if (error) {
      if (/SUBSCRIPTION_NOT_FOUND|AMOUNT_MISMATCH/.test(error.message)) return errorResponse('Data pembayaran tidak cocok: ' + error.message, 400);
      throw error;
    }
    return ok({ merchant_order_id: merchantOrderId, status: 'paid' });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Gagal konfirmasi pembayaran manual';
    return errorResponse(message === 'FORBIDDEN' ? 'Akses ditolak' : message === 'UNAUTHORIZED' ? 'Belum login' : message, message === 'FORBIDDEN' ? 403 : message === 'UNAUTHORIZED' ? 401 : 500);
  }
}

async function createCashier(request: Request){
  let createdUserId: string | null = null;
  try {
    const { user, member, supabase } = await requireMemberRole(['owner']);
    const body = await request.json();
    const fullName = String(body?.full_name ?? '').trim();
    const email = String(body?.email ?? '').trim().toLowerCase();
    const password = String(body?.password ?? '');
    if (!fullName || fullName.length > 120) return errorResponse('Nama kasir tidak valid',400);
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) return errorResponse('Email kasir tidak valid',400);
    if (password.length < 6 || password.length > 72) return errorResponse('Password kasir harus 6–72 karakter',400);

    const tierInfo = await getShopTier(supabase, member.shop_id);
    if (!tierInfo.isPro) {
      const { count } = await supabase.from('shop_members').select('id',{count:'exact',head:true}).eq('shop_id',member.shop_id).eq('active',true);
      if ((count ?? 0) >= FREE_TIER_LIMITS.maxActiveMembers) {
        return errorResponse(`Paket Gratis dibatasi maksimal ${FREE_TIER_LIMITS.maxActiveMembers} anggota toko (termasuk owner). Upgrade ke Tier Pro di menu Pengaturan untuk anggota tanpa batas.`,403);
      }
    }

    const admin = createAdminClient();
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name: fullName },
    });
    if (createError || !created.user) return errorResponse(createError?.message ?? 'Gagal membuat akun kasir',400);
    createdUserId = created.user.id;

    const { error: profileError } = await admin.from('profiles').upsert({ id: createdUserId, full_name: fullName });
    if (profileError) throw new Error('Gagal membuat profil kasir');

    const { data: existing } = await admin.from('shop_members').select('id').eq('shop_id',member.shop_id).eq('user_id',createdUserId).maybeSingle();
    if (existing) throw new Error('Akun tersebut sudah menjadi anggota toko');
    const { error: memberError } = await admin.from('shop_members').insert({ shop_id: member.shop_id, user_id: createdUserId, role:'cashier', active:true });
    if (memberError) throw new Error('Gagal menghubungkan akun kasir ke toko');

    await writeAudit(admin, { shop_id:member.shop_id, user_id:user.id, action:'CASHIER_CREATED', entity_type:'shop_member', entity_id:createdUserId ?? undefined, old_values:null, new_values:{ email, full_name:fullName, role:'cashier' } });
    return ok({ user_id:createdUserId, email, role:'cashier' },201);
  } catch (e) {
    if (createdUserId) { try { await createAdminClient().auth.admin.deleteUser(createdUserId); } catch {} }
    const message = e instanceof Error ? e.message : 'Gagal menambahkan kasir';
    return errorResponse(message, message.includes('Akses') || message==='FORBIDDEN' ? 403 : 400);
  }
}

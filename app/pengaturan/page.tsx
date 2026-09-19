'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { TierCard } from '@/components/subscription/TierCard';

type ShopRow = {
  id: string;
  name: string | null;
  business_type: string | null;
  phone: string | null;
  address: string | null;
  logo_url: string | null;
};

type ExportRow = Record<string, unknown>;

const csvEscape = (value: unknown) => {
  const text = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r;]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
};

function toTableCsv(tableName: string, rows: ExportRow[]) {
  if (!rows.length) return `table;payload\n${csvEscape(tableName)};`;
  return [
    'table;payload',
    ...rows.map(row => `${csvEscape(tableName)};${csvEscape(JSON.stringify(row))}`),
  ].join('\n');
}

function downloadBlob(filename: string, content: BlobPart, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function fileToDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Gagal membaca file logo'));
    reader.readAsDataURL(file);
  });
}

export default function Page() {
  const supabase = useMemo(() => createClient(), []);
  const [shop, setShop] = useState<ShopRow | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [type, setType] = useState('toko');
  const [logoUrl, setLogoUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupMsg, setBackupMsg] = useState('');
  const [role, setRole] = useState<'owner' | 'cashier' | null>(null);

  async function load() {
    const { data, error } = await supabase.from('shops').select('id,name,business_type,phone,address,logo_url').limit(1).maybeSingle();
    if (!error && data) {
      setShop(data);
      setName(data.name || '');
      setPhone(data.phone || '');
      setAddress(data.address || '');
      setType(data.business_type || 'toko');
      setLogoUrl(data.logo_url || '');
    }
  }

  useEffect(() => {
    void load();
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setRole(null);
        return;
      }
      const { data } = await supabase
        .from('shop_members')
        .select('role')
        .eq('user_id', user.id)
        .eq('active', true)
        .maybeSingle();
      setRole(data?.role === 'owner' ? 'owner' : data?.role === 'cashier' ? 'cashier' : null);
    })();
  }, [supabase]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!shop) return;
    setBusy(true);
    setMsg('');
    const { error } = await supabase.from('shops').update({
      name: name.trim(),
      phone: phone.trim() || null,
      address: address.trim() || null,
      business_type: type,
      logo_url: logoUrl.trim() || null,
    }).eq('id', shop.id);
    setMsg(error ? error.message : 'Profil toko berhasil disimpan.');
    if (!error) await load();
    setBusy(false);
  }

  async function onLogoUpload(file?: File | null) {
    if (!file) return;
    setMsg('');
    if (!file.type.startsWith('image/')) {
      setMsg('File logo harus berupa gambar.');
      return;
    }
    if (file.size > 512 * 1024) {
      setMsg('Ukuran logo maksimal 512 KB agar database tetap ringan.');
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      setLogoUrl(dataUrl);
    } catch (error) {
      setMsg(error instanceof Error ? error.message : 'Gagal memuat file logo');
    }
  }

  async function exportBackup(format: 'json' | 'csv') {
    setBackupBusy(true);
    setBackupMsg('');
    try {
      const [
        shopRes, memberRes, categoryRes, productRes, priceRes, customerRes,
        saleRes, saleItemRes, paymentRes, stockRes, supplierRes, purchaseRes, purchaseItemRes,
        tableRes, orderRes, auditRes,
      ] = await Promise.all([
        supabase.from('shops').select('*').limit(1),
        supabase.from('shop_members').select('*').order('created_at', { ascending: true }),
        supabase.from('categories').select('*').order('created_at', { ascending: true }),
        supabase.from('products').select('*').order('created_at', { ascending: true }),
        supabase.from('product_prices').select('*').order('created_at', { ascending: true }),
        supabase.from('customers').select('*').order('created_at', { ascending: true }),
        supabase.from('sales').select('*').order('created_at', { ascending: true }),
        supabase.from('sale_items').select('*').order('id', { ascending: true }),
        supabase.from('payments').select('*').order('created_at', { ascending: true }),
        supabase.from('stock_movements').select('*').order('created_at', { ascending: true }),
        supabase.from('suppliers').select('*').order('created_at', { ascending: true }),
        supabase.from('purchases').select('*').order('created_at', { ascending: true }),
        supabase.from('purchase_items').select('*').order('id', { ascending: true }),
        supabase.from('tables_pos').select('*').order('created_at', { ascending: true }),
        supabase.from('orders').select('*').order('created_at', { ascending: true }),
        supabase.from('audit_logs').select('*').order('created_at', { ascending: true }),
      ]);

      const firstError = shopRes.error || memberRes.error || categoryRes.error || productRes.error ||
        priceRes.error || customerRes.error || saleRes.error || saleItemRes.error || paymentRes.error || stockRes.error ||
        supplierRes.error || purchaseRes.error || purchaseItemRes.error || tableRes.error || orderRes.error || auditRes.error;
      if (firstError) throw new Error(firstError.message);

      const payload = {
        exported_at: new Date().toISOString(),
        shops: shopRes.data ?? [],
        shop_members: memberRes.data ?? [],
        categories: categoryRes.data ?? [],
        products: productRes.data ?? [],
        product_prices: priceRes.data ?? [],
        customers: customerRes.data ?? [],
        sales: saleRes.data ?? [],
        sale_items: saleItemRes.data ?? [],
        payments: paymentRes.data ?? [],
        stock_movements: stockRes.data ?? [],
        suppliers: supplierRes.data ?? [],
        purchases: purchaseRes.data ?? [],
        purchase_items: purchaseItemRes.data ?? [],
        tables_pos: tableRes.data ?? [],
        orders: orderRes.data ?? [],
        audit_logs: auditRes.data ?? [],
      };

      if (format === 'json') {
        downloadBlob(
          `point-of-sale-umkm-backup-${new Date().toISOString().slice(0, 10)}.json`,
          JSON.stringify(payload, null, 2),
          'application/json',
        );
      } else {
        const csv = [
          toTableCsv('shops', payload.shops as ExportRow[]),
          toTableCsv('shop_members', payload.shop_members as ExportRow[]),
          toTableCsv('categories', payload.categories as ExportRow[]),
          toTableCsv('products', payload.products as ExportRow[]),
          toTableCsv('product_prices', payload.product_prices as ExportRow[]),
          toTableCsv('customers', payload.customers as ExportRow[]),
          toTableCsv('sales', payload.sales as ExportRow[]),
          toTableCsv('sale_items', payload.sale_items as ExportRow[]),
          toTableCsv('payments', payload.payments as ExportRow[]),
          toTableCsv('stock_movements', payload.stock_movements as ExportRow[]),
          toTableCsv('suppliers', payload.suppliers as ExportRow[]),
          toTableCsv('purchases', payload.purchases as ExportRow[]),
          toTableCsv('purchase_items', payload.purchase_items as ExportRow[]),
          toTableCsv('tables_pos', payload.tables_pos as ExportRow[]),
          toTableCsv('orders', payload.orders as ExportRow[]),
          toTableCsv('audit_logs', payload.audit_logs as ExportRow[]),
        ].join('\n\n');
        downloadBlob(
          `point-of-sale-umkm-backup-${new Date().toISOString().slice(0, 10)}.csv`,
          csv,
          'text/csv;charset=utf-8',
        );
      }

      setBackupMsg(format === 'json' ? 'Backup JSON berhasil diunduh.' : 'Backup CSV berhasil diunduh.');
    } catch (error) {
      setBackupMsg(error instanceof Error ? error.message : 'Gagal membuat backup');
    } finally {
      setBackupBusy(false);
    }
  }

  return (
    <section>
      <div className="page-head">
        <div>
          <div className="eyebrow">Profil & preferensi</div>
          <h1>Pengaturan</h1>
          <p className="muted">Atur nama toko, logo, dan backup manual dari satu halaman.</p>
        </div>
      </div>

      <div className="grid grid-2 settings-grid">
        <TierCard />
        <form className="card form-grid" onSubmit={save}>
          <h3>Profil toko</h3>
          <label>Nama toko<input value={name} onChange={e => setName(e.target.value)} required /></label>
          <label>Jenis usaha
            <select value={type} onChange={e => setType(e.target.value)}>
              <option value="toko">Toko</option>
              <option value="warung">Warung</option>
              <option value="resto">Resto / Kafe</option>
              <option value="lainnya">Lainnya</option>
            </select>
          </label>
          <label>No. telepon<input value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" /></label>
          <label>Alamat toko<textarea rows={4} value={address} onChange={e => setAddress(e.target.value)} placeholder="Contoh: Jl. Merdeka No. 10, Kecamatan…" /></label>
          <label>Logo toko
            <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={e => onLogoUpload(e.target.files?.[0] ?? null)} />
          </label>
          <div className="logo-preview">
            {logoUrl ? <img src={logoUrl} alt="Logo toko" /> : <span>Logo belum diatur</span>}
          </div>
          {msg && <p className="muted">{msg}</p>}
          <div className="row-actions">
            <button className="btn" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan perubahan'}</button>
            {logoUrl && <button className="btn btn-ghost" type="button" onClick={() => setLogoUrl('')}>Hapus logo</button>}
          </div>
        </form>

        <div className="card stack-card">
          <div>
            <h3>Tampilan toko</h3>
            <p className="muted">Logo yang diunggah akan tampil di sidebar dan banner atas.</p>
          </div>
          <div className="address-preview">
            <div className="address-pin">{logoUrl ? <img src={logoUrl} alt="Logo" /> : '⌖'}</div>
            <div>
              <strong>{name || 'Nama toko'}</strong>
              <p>{address || 'Alamat toko belum diisi.'}</p>
              <span>{phone || 'Nomor telepon belum diisi.'}</span>
            </div>
          </div>

          {role === 'owner' && <div className="backup-panel">
            <div className="section-title">
              <div>
                <h3>Panel Backup Manual</h3>
                <p className="muted">Unduh data inti toko sebagai JSON atau CSV tanpa menambah route serverless.</p>
              </div>
            </div>
            <div className="row-actions">
              <button className="btn btn-ghost" type="button" onClick={() => exportBackup('json')} disabled={backupBusy}>
                {backupBusy ? 'Menyiapkan…' : 'Backup JSON'}
              </button>
              <button className="btn" type="button" onClick={() => exportBackup('csv')} disabled={backupBusy}>
                {backupBusy ? 'Menyiapkan…' : 'Backup CSV'}
              </button>
            </div>
            {backupMsg && <p className="muted">{backupMsg}</p>}
          </div>}

          <div className="info-card">
            <strong>Catatan</strong>
            <p className="muted">Backup mencakup seluruh tabel operasional yang aman diakses melalui RLS, termasuk transaksi, detail transaksi, pembayaran, stok, pembelian, meja/order, dan audit log.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

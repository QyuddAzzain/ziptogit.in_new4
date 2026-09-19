'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

type Category = { id: string; name: string; is_active: boolean };
type Product = {
  id: string; name: string; sku: string | null; barcode: string | null; category_id: string | null;
  cost_price: number; selling_price: number; stock: number; minimum_stock: number; unit: string; is_active: boolean;
};

const money = (value: number) => `Rp ${Math.max(0, value).toLocaleString('id-ID')}`;

export default function EditProduk() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [product, setProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const [message, setMessage] = useState('');
  const [stockMessage, setStockMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [stockBusy, setStockBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [targetStock, setTargetStock] = useState('');
  const [stockReason, setStockReason] = useState('');

  async function loadProduct() {
    setLoading(true);
    setMessage('');
    try {
      const [cRes, pRes] = await Promise.all([
        fetch('/api/categories', { cache: 'no-store' }),
        fetch(`/api/products/${id}`, { cache: 'no-store' }),
      ]);
      const [cJson, pJson] = await Promise.all([cRes.json(), pRes.json()]);
      if (cJson.ok) setCategories(cJson.data);
      if (!pJson.ok) throw new Error(pJson.error || 'Produk tidak ditemukan.');
      setProduct(pJson.data);
      setTargetStock(String(pJson.data.stock));
      setForm({
        name: pJson.data.name,
        category_id: pJson.data.category_id ?? '',
        sku: pJson.data.sku ?? '',
        barcode: pJson.data.barcode ?? '',
        cost_price: String(pJson.data.cost_price),
        selling_price: String(pJson.data.selling_price),
        minimum_stock: String(pJson.data.minimum_stock),
        unit: pJson.data.unit,
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal memuat produk.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadProduct(); }, [id]);

  function set(key: string, value: string) {
    setForm(f => f ? { ...f, [key]: value } : f);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setMessage('');
    setBusy(true);
    try {
      const res = await fetch(`/api/products/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          category_id: form.category_id || null,
          sku: form.sku.trim() || undefined,
          barcode: form.barcode.trim() || undefined,
          cost_price: Number(form.cost_price),
          selling_price: Number(form.selling_price),
          minimum_stock: Number(form.minimum_stock),
          unit: form.unit.trim() || 'PCS',
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Gagal memperbarui produk.');
      setProduct(json.data);
      setTargetStock(String(json.data.stock));
      setMessage('Perubahan produk tersimpan. Stok tidak disentuh oleh formulir ini.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal memperbarui produk.');
    } finally {
      setBusy(false);
    }
  }

  async function adjustStock(e: FormEvent) {
    e.preventDefault();
    if (!product) return;
    setStockMessage('');
    const target = Number(targetStock);
    const current = Number(product.stock);
    if (!Number.isFinite(target) || target < 0) {
      setStockMessage('Target stok harus berupa angka 0 atau lebih.');
      return;
    }
    const delta = target - current;
    if (delta === 0) {
      setStockMessage('Tidak ada perubahan stok.');
      return;
    }
    if (!stockReason.trim()) {
      setStockMessage('Isi alasan perubahan stok agar tercatat di riwayat.');
      return;
    }
    setStockBusy(true);
    try {
      const res = await fetch('/api/stock/movement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: product.id,
          movement_type: 'adjustment',
          quantity: delta,
          reason: stockReason.trim(),
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Gagal memperbarui stok.');
      setProduct(prev => prev ? { ...prev, stock: Number(json.data.stock) } : prev);
      setTargetStock(String(json.data.stock));
      setStockReason('');
      setStockMessage(`Stok berhasil disesuaikan menjadi ${json.data.stock} ${product.unit}.`);
    } catch (error) {
      setStockMessage(error instanceof Error ? error.message : 'Gagal memperbarui stok.');
    } finally {
      setStockBusy(false);
    }
  }

  async function toggleActive() {
    if (!product) return;
    const res = await fetch(`/api/products/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !product.is_active }),
    });
    const json = await res.json();
    if (json.ok) setProduct(json.data);
  }

  if (loading) return <p className="muted">Memuat produk…</p>;
  if (!product || !form) return <p className="error-text">{message || 'Produk tidak ditemukan.'}</p>;

  const stockDiff = Number(targetStock) - Number(product.stock);

  return (
    <section>
      <div className="page-head">
        <div>
          <div className="eyebrow">Katalog & Persediaan</div>
          <h1>Ubah Produk</h1>
          <p className="muted">{product.name} · SKU {product.sku || 'belum diisi'}</p>
        </div>
        <div className="row-actions">
          <span className={`badge ${product.is_active ? 'badge-ok' : 'badge-off'}`}>{product.is_active ? 'Aktif' : 'Nonaktif'}</span>
          <button className="btn btn-ghost" onClick={toggleActive}>{product.is_active ? 'Nonaktifkan' : 'Aktifkan'}</button>
        </div>
      </div>

      <div className="edit-product-layout">
        <form className="card form-grid product-form-card" onSubmit={submit}>
          <div className="section-title"><div><h3>Informasi produk</h3><p className="muted">Data katalog, harga, dan batas minimum.</p></div></div>
          <label>Nama Produk<input value={form.name} onChange={e => set('name', e.target.value)} required /></label>
          <label>Kategori
            <select value={form.category_id} onChange={e => set('category_id', e.target.value)}>
              <option value="">Tanpa kategori</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <div className="grid grid-2">
            <label>SKU (opsional)<input value={form.sku} onChange={e => set('sku', e.target.value)} /></label>
            <label>Barcode (opsional)<input value={form.barcode} onChange={e => set('barcode', e.target.value)} /></label>
          </div>
          <div className="grid grid-2">
            <label>Harga Modal<input type="number" min="0" step="1" value={form.cost_price} onChange={e => set('cost_price', e.target.value)} required /></label>
            <label>Harga Jual<input type="number" min="0" step="1" value={form.selling_price} onChange={e => set('selling_price', e.target.value)} required /></label>
          </div>
          <div className="grid grid-2">
            <label>Stok Saat Ini<input value={`${product.stock} ${product.unit}`} disabled /></label>
            <label>Stok Minimum<input type="number" min="0" step="0.001" value={form.minimum_stock} onChange={e => set('minimum_stock', e.target.value)} required /></label>
          </div>
          <div className="form-note"><strong>Stok terpisah dari data produk</strong><span>Edit katalog tidak akan mengubah stok.</span></div>
          <label>Satuan<input value={form.unit} onChange={e => set('unit', e.target.value)} required /></label>
          {message && <p role="alert" className={message.startsWith('Perubahan') ? 'success-text' : 'error-text'}>{message}</p>}
          <div className="row-actions">
            <button className="btn" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan Perubahan'}</button>
            <button type="button" className="btn btn-ghost" onClick={() => router.push('/produk')}>Kembali</button>
          </div>
        </form>

        <div className="card stock-adjust-card">
          <div className="section-title">
            <div><h3>Atur stok</h3><p className="muted">Ubah stok dari sini dan tetap simpan jejak mutasinya.</p></div>
            <span className="badge badge-warn">Owner</span>
          </div>
          <div className="stock-current-panel"><span>Stok sekarang</span><strong>{product.stock} {product.unit}</strong></div>
          <form className="form-grid" onSubmit={adjustStock}>
            <label>Target stok<input type="number" min="0" step="0.001" value={targetStock} onChange={e => setTargetStock(e.target.value)} required /></label>
            <div className="stock-delta-row">
              <span>Perubahan</span>
              <strong className={stockDiff < 0 ? 'danger-number' : stockDiff > 0 ? 'success-number' : ''}>{stockDiff > 0 ? '+' : ''}{stockDiff} {product.unit}</strong>
            </div>
            <label>Alasan perubahan<input value={stockReason} onChange={e => setStockReason(e.target.value)} placeholder="Contoh: Stok awal / koreksi opname / barang rusak" maxLength={255} required /></label>
            {stockMessage && <p role="alert" className={stockMessage.startsWith('Stok berhasil') ? 'success-text' : 'error-text'}>{stockMessage}</p>}
            <button className="btn" disabled={stockBusy}>{stockBusy ? 'Menyimpan stok…' : 'Simpan perubahan stok'}</button>
          </form>
          <div className="info-card stock-safe-note"><strong>Kenapa dipisahkan?</strong><p className="muted">Transaksi penjualan dan mutasi stok tetap tercatat sebagai riwayat. Ini mencegah edit produk biasa diam-diam mengubah stok.</p></div>
        </div>
      </div>
    </section>
  );
}

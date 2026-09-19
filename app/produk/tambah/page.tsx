'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Category = { id: string; name: string; is_active: boolean };

const empty = { name: '', category_id: '', sku: '', barcode: '', cost_price: '0', selling_price: '0', stock: '0', minimum_stock: '0', unit: 'PCS' };

export default function TambahProduk() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState(empty);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/categories').then(r => r.json()).then(j => { if (j.ok) setCategories(j.data.filter((c: Category) => c.is_active)); });
  }, []);

  function set<K extends keyof typeof empty>(key: K, value: string) {
    setForm(f => ({ ...f, [key]: value }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMessage('');
    setBusy(true);
    const res = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name.trim(),
        category_id: form.category_id || null,
        sku: form.sku.trim() || undefined,
        barcode: form.barcode.trim() || undefined,
        cost_price: Number(form.cost_price),
        selling_price: Number(form.selling_price),
        stock: Number(form.stock),
        minimum_stock: Number(form.minimum_stock),
        unit: form.unit.trim() || 'PCS',
      }),
    });
    const json = await res.json();
    setBusy(false);
    if (!json.ok) { setMessage(json.error); return; }
    router.replace('/produk');
    router.refresh();
  }

  return (
    <section>
      <div className="page-head"><div><h1>Tambah Produk</h1><p className="muted">Isi data produk baru</p></div></div>
      <form className="card form-grid" onSubmit={submit} style={{ maxWidth: 560 }}>
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
          <label>Stok Awal<input type="number" min="0" step="0.001" value={form.stock} onChange={e => set('stock', e.target.value)} required /></label>
          <label>Stok Minimum<input type="number" min="0" step="0.001" value={form.minimum_stock} onChange={e => set('minimum_stock', e.target.value)} required /></label>
        </div>
        <label>Satuan<input value={form.unit} onChange={e => set('unit', e.target.value)} required /></label>
        {message && <p role="alert" className="error-text">{message}</p>}
        <div className="row-actions">
          <button className="btn" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan Produk'}</button>
          <button type="button" className="btn btn-ghost" onClick={() => router.back()}>Batal</button>
        </div>
      </form>
    </section>
  );
}

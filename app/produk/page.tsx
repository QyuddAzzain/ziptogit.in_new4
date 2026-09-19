'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type Category = { id: string; name: string; is_active: boolean };
type Product = {
  id: string; name: string; sku: string | null; barcode: string | null; category_id: string | null;
  cost_price: number; selling_price: number; stock: number; minimum_stock: number; unit: string; is_active: boolean;
};

export default function ProdukPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('semua');
  const [showCategories, setShowCategories] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [catBusy, setCatBusy] = useState(false);
  const [catMsg, setCatMsg] = useState('');

  const [loadMsg, setLoadMsg] = useState('');

  async function loadAll() {
    setLoading(true);
    setLoadMsg('');
    try {
      const [cRes, pRes] = await Promise.all([fetch('/api/categories', { cache: 'no-store' }), fetch('/api/products', { cache: 'no-store' })]);
      const [cJson, pJson] = await Promise.all([cRes.json(), pRes.json()]);
      if (!cRes.ok || !cJson.ok) throw new Error(cJson.error || 'Gagal memuat kategori.');
      if (!pRes.ok || !pJson.ok) throw new Error(pJson.error || 'Gagal memuat produk.');
      setCategories(cJson.data ?? []);
      setProducts(pJson.data ?? []);
    } catch (error) {
      setLoadMsg(error instanceof Error ? error.message : 'Gagal memuat data produk.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, []);

  const categoryName = (id: string | null) => categories.find(c => c.id === id)?.name ?? '—';

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return products.filter(p => {
      if (categoryFilter !== 'semua' && p.category_id !== categoryFilter) return false;
      if (!needle) return true;
      return p.name.toLowerCase().includes(needle) || (p.sku ?? '').toLowerCase().includes(needle) || (p.barcode ?? '').toLowerCase().includes(needle);
    });
  }, [products, q, categoryFilter]);

  async function addCategory(e: FormEvent) {
    e.preventDefault();
    setCatMsg('');
    setCatBusy(true);
    const res = await fetch('/api/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newCategory.trim() }) });
    const json = await res.json();
    setCatBusy(false);
    if (!json.ok) { setCatMsg(json.error); return; }
    setNewCategory('');
    setCategories(prev => [...prev, json.data].sort((a, b) => a.name.localeCompare(b.name)));
  }

  async function toggleCategory(cat: Category) {
    const res = await fetch(`/api/categories/${cat.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: !cat.is_active }) });
    const json = await res.json();
    if (json.ok) setCategories(prev => prev.map(c => c.id === cat.id ? json.data : c));
  }

  async function toggleProduct(p: Product) {
    const res = await fetch(`/api/products/${p.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: !p.is_active }) });
    const json = await res.json();
    if (json.ok) setProducts(prev => prev.map(x => x.id === p.id ? json.data : x));
  }

  return (
    <section>
      <div className="page-head">
        <div><h1>Produk</h1><p className="muted">{products.length} produk terdaftar</p></div>
        <div className="row-actions">
          <button className="btn btn-ghost" onClick={() => setShowCategories(s => !s)}>{showCategories ? 'Tutup Kategori' : 'Kelola Kategori'}</button>
          <Link className="btn" href="/produk/tambah">+ Tambah Produk</Link>
        </div>
      </div>

      {showCategories && (
        <div className="card" style={{ marginBottom: 18 }}>
          <form className="inline-form" onSubmit={addCategory}>
            <input value={newCategory} onChange={e => setNewCategory(e.target.value)} placeholder="Nama kategori baru" required />
            <button className="btn" disabled={catBusy}>{catBusy ? 'Menyimpan…' : 'Tambah'}</button>
          </form>
          {catMsg && <p className="error-text" style={{ marginTop: -6, marginBottom: 12 }}>{catMsg}</p>}
          <div className="row-actions">
            {categories.map(c => (
              <span key={c.id} className={`badge ${c.is_active ? 'badge-ok' : 'badge-off'}`}>
                {c.name}
                <button type="button" className="badge-toggle" onClick={() => toggleCategory(c)}>{c.is_active ? 'nonaktifkan' : 'aktifkan'}</button>
              </span>
            ))}
            {categories.length === 0 && <span className="muted">Belum ada kategori.</span>}
          </div>
        </div>
      )}

      {loadMsg && <div className="card alert-danger" style={{ marginBottom: 14 }}><strong>Data belum termuat</strong><p style={{ margin: '4px 0 0' }}>{loadMsg}</p></div>}

      <div className="toolbar">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cari nama, SKU, atau barcode…" />
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
          <option value="semua">Semua kategori</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div className="card table-wrap">
        {loading ? <p className="muted">Memuat…</p> : filtered.length === 0 ? <p className="empty">Tidak ada produk yang cocok.</p> : (
          <table className="table">
            <thead><tr><th>Nama</th><th>Kategori</th><th>SKU</th><th>Harga Jual</th><th>Stok</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{categoryName(p.category_id)}</td>
                  <td>{p.sku ?? '—'}</td>
                  <td className="num">Rp {p.selling_price.toLocaleString('id-ID')}</td>
                  <td>{p.stock} {p.unit}{p.stock <= p.minimum_stock && <span className="badge badge-warn">menipis</span>}</td>
                  <td><span className={`badge ${p.is_active ? 'badge-ok' : 'badge-off'}`}>{p.is_active ? 'Aktif' : 'Nonaktif'}</span></td>
                  <td>
                    <div className="row-actions">
                      <Link className="btn btn-ghost btn-sm" href={`/produk/${p.id}`}>Ubah</Link>
                      <button className="btn btn-ghost btn-sm" onClick={() => toggleProduct(p)}>{p.is_active ? 'Nonaktifkan' : 'Aktifkan'}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

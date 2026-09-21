'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/browser';

type Product = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  category_id: string | null;
  selling_price: number;
  stock: number;
  unit: string;
  is_active: boolean;
};

type Category = {
  id: string;
  name: string;
};

type CartItem = Product & {
  quantity: number;
};

type Sale = {
  id: string;
  invoice_number: string;
  subtotal: number;
  tax: number;
  grand_total: number;
  discount: number;
  payment_method: string;
  cash_received: number;
  change_amount: number;
  created_at: string;
};

// ---- Draft keranjang lokal (localStorage) ----
// Tujuan: kalau sinyal putus / halaman ter-refresh saat kasir sedang menginput barang, keranjang
// tidak hilang. Ini HANYA draft input — bukan antrean transaksi offline. Transaksi tetap harus
// sukses tersimpan ke server (/api/sales); tidak ada struk/nota yang dibuat di sisi klien.
// Kunci per user supaya akun lain di perangkat yang sama tidak melihat keranjang orang lain;
// dihapus saat logout (components/auth/LogoutButton.tsx) dan kedaluwarsa 12 jam.
const CART_DRAFT_PREFIX = 'pos-kasir-draft-v1:';
const CART_DRAFT_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const PAYMENT_METHOD_IDS = ['cash', 'transfer', 'qris', 'debit'] as const;
type PaymentMethodId = (typeof PAYMENT_METHOD_IDS)[number];

type CartDraft = {
  savedAt: number;
  cart: CartItem[];
  discount: string;
  paymentMethod: PaymentMethodId;
  cashReceived: string;
};

function isCartItem(value: unknown): value is CartItem {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    typeof v.selling_price === 'number' &&
    typeof v.stock === 'number' &&
    typeof v.quantity === 'number' &&
    v.quantity > 0
  );
}

function isPaymentMethodId(value: unknown): value is PaymentMethodId {
  return typeof value === 'string' && (PAYMENT_METHOD_IDS as readonly string[]).includes(value);
}

function money(num: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(num);
}

const paymentLabels: Record<string, string> = {
  cash: 'Tunai',
  qris: 'QRIS',
  transfer: 'Transfer Bank',
  debit: 'Debit Card',
};

export default function Kasir() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCat, setSelectedCat] = useState<string>('all');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [q, setQ] = useState('');
  const [discount, setDiscount] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodId>('cash');
  const [cashReceived, setCashReceived] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<Sale | null>(null);
  const [lastChange, setLastChange] = useState(0);
  const [mobileTab, setMobileTab] = useState<'catalog' | 'cart'>('catalog');
  const [shopName, setShopName] = useState('Kasirku');
  const [shopLogo, setShopLogo] = useState<string | null>(null);
  const [isPro, setIsPro] = useState(false);
  const supabase = useMemo(() => createClient(), []);
  const [draftKey, setDraftKey] = useState<string | null>(null);
  const reconciledRef = useRef(false);

  // Pulihkan draft keranjang milik user yang sedang login (getSession membaca sesi lokal, tidak butuh jaringan).
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const userId = data.session?.user.id;
        if (!active || !userId) return;
        const key = `${CART_DRAFT_PREFIX}${userId}`;
        const raw = window.localStorage.getItem(key);
        if (raw) {
          const draft = JSON.parse(raw) as Partial<CartDraft>;
          const fresh = typeof draft.savedAt === 'number' && Date.now() - draft.savedAt < CART_DRAFT_MAX_AGE_MS;
          const items = fresh && Array.isArray(draft.cart) ? draft.cart.filter(isCartItem) : [];
          if (items.length > 0) {
            setCart(prev => (prev.length > 0 ? prev : items));
            setDiscount(typeof draft.discount === 'string' ? draft.discount : '0');
            if (isPaymentMethodId(draft.paymentMethod)) setPaymentMethod(draft.paymentMethod);
            setCashReceived(typeof draft.cashReceived === 'string' ? draft.cashReceived : '');
          } else {
            window.localStorage.removeItem(key);
          }
        }
        if (active) setDraftKey(key);
      } catch {
        // localStorage tidak tersedia / draft rusak: lanjut tanpa draft.
      }
    })();
    return () => { active = false; };
  }, [supabase]);

  // Simpan draft setiap keranjang/input berubah; keranjang kosong (bayar sukses / reset) = hapus draft.
  useEffect(() => {
    if (!draftKey) return;
    try {
      if (cart.length === 0) {
        window.localStorage.removeItem(draftKey);
      } else {
        const draft: CartDraft = { savedAt: Date.now(), cart, discount, paymentMethod, cashReceived };
        window.localStorage.setItem(draftKey, JSON.stringify(draft));
      }
    } catch {
      // kuota penuh / mode privat: abaikan, keranjang tetap jalan di memori.
    }
  }, [draftKey, cart, discount, paymentMethod, cashReceived]);

  // Setelah katalog terbaru berhasil dimuat, segarkan item draft (harga/stok terkini) dan buang produk
  // yang sudah tidak ada/nonaktif. Kalau katalog gagal dimuat (offline), draft dibiarkan apa adanya.
  useEffect(() => {
    if (reconciledRef.current || loading || draftKey === null || products.length === 0) return;
    reconciledRef.current = true;
    setCart(prev =>
      prev
        .flatMap(item => {
          const latest = products.find(p => p.id === item.id);
          return latest ? [{ ...latest, quantity: Math.min(item.quantity, latest.stock) }] : [];
        })
        .filter(item => item.quantity > 0),
    );
  }, [loading, draftKey, products]);

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const [prodRes, catRes] = await Promise.all([
        fetch('/api/products').then(r => r.json()),
        fetch('/api/categories').then(r => r.json()),
      ]);

      if (!prodRes.ok) throw new Error(prodRes.error || 'Gagal memuat produk dari server.');
      setProducts(Array.isArray(prodRes.data) ? prodRes.data.filter((p: Product) => p.is_active) : []);

      if (!catRes.ok) throw new Error(catRes.error || 'Gagal memuat kategori dari server.');
      setCategories(Array.isArray(catRes.data) ? catRes.data : []);
    } catch (e) {
      // JANGAN pernah diam-diam ganti ke katalog palsu di sini: kasir bisa
      // transaksi pakai produk fiktif lalu submit ke /api/sales dan gagal
      // padahal uang sudah diterima dari pembeli. Tampilkan error yang jelas.
      setProducts([]);
      setCategories([]);
      setError(e instanceof Error ? e.message : 'Gagal memuat data dari server. Periksa koneksi lalu coba lagi.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [shopRes, tierRes] = await Promise.all([
          supabase.from('shops').select('name,logo_url').limit(1).maybeSingle(),
          fetch('/api/subscription', { cache: 'no-store' }).then(r => r.json()),
        ]);
        if (!active) return;
        if (shopRes.data?.name) setShopName(shopRes.data.name);
        setIsPro(Boolean(tierRes?.ok && tierRes?.data?.isPro));
        setShopLogo(Boolean(tierRes?.ok && tierRes?.data?.isPro) ? (shopRes.data?.logo_url ?? null) : null);
      } catch {
        if (active) { setIsPro(false); setShopLogo(null); }
      }
    })();
    return () => { active = false; };
  }, [supabase]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return products.filter(p => {
      const matchQuery =
        !needle ||
        p.name.toLowerCase().includes(needle) ||
        (p.sku ?? '').toLowerCase().includes(needle) ||
        (p.barcode ?? '').toLowerCase().includes(needle);

      const matchCategory = selectedCat === 'all' || p.category_id === selectedCat;
      return matchQuery && matchCategory;
    });
  }, [products, q, selectedCat]);

  const totalItemsCount = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart]);

  const subtotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity * Number(item.selling_price), 0),
    [cart]
  );

  const discountValue = Math.min(Math.max(Number(discount) || 0, 0), subtotal);
  const total = subtotal - discountValue;
  const cashValue = Math.max(Number(cashReceived) || 0, 0);
  const change = Math.max(cashValue - total, 0);

  function addToCart(product: Product) {
    if (Number(product.stock) <= 0) return;
    setError('');
    setSuccess(null);
    setCart(prev => {
      const found = prev.find(x => x.id === product.id);
      if (found) {
        const nextQty = Math.min(found.quantity + 1, Number(product.stock));
        return prev.map(x => (x.id === product.id ? { ...x, quantity: nextQty } : x));
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  }

  function setQty(id: string, value: number) {
    setCart(prev =>
      prev.map(x => {
        if (x.id !== id) return x;
        const valid = Number.isFinite(value) ? Math.max(1, Math.min(value, Number(x.stock))) : 1;
        return { ...x, quantity: valid };
      })
    );
  }

  function decreaseQty(id: string) {
    setCart(prev =>
      prev
        .map(x => {
          if (x.id === id) {
            return { ...x, quantity: x.quantity - 1 };
          }
          return x;
        })
        .filter(x => x.quantity > 0)
    );
  }

  function increaseQty(id: string) {
    setCart(prev =>
      prev.map(x => {
        if (x.id === id) {
          return { ...x, quantity: Math.min(x.quantity + 1, Number(x.stock)) };
        }
        return x;
      })
    );
  }

  function removeItem(id: string) {
    setCart(prev => prev.filter(x => x.id !== id));
  }

  function applyDiscountPercent(percent: number) {
    const val = Math.round((subtotal * percent) / 100);
    setDiscount(String(val));
  }

  function handleReset() {
    setCart([]);
    setDiscount('0');
    setCashReceived('');
    setError('');
    setSuccess(null);
  }

  async function submitSale() {
    setError('');
    setSuccess(null);
    if (!cart.length) {
      setError('Keranjang masih kosong. Pilih produk terlebih dahulu.');
      return;
    }
    const finalCashReceived = cashReceived ? cashValue : (paymentMethod === 'cash' ? total : 0);
    if (paymentMethod === 'cash' && finalCashReceived < total) {
      setError(`Uang tunai kurang ${money(total - finalCashReceived)}. Masukkan nominal yang cukup.`);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart.map(x => ({ product_id: x.id, quantity: x.quantity })),
          discount: discountValue,
          payment_method: paymentMethod,
          cash_received: paymentMethod === 'cash' ? finalCashReceived : 0,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Transaksi gagal');
      setLastChange(paymentMethod === 'cash' ? finalCashReceived - total : 0);
      setSuccess(json.data);
      setCart([]);
      setDiscount('0');
      setCashReceived('');
    } catch (e) {
      // JANGAN pernah membuat struk palsu di sini. Kalau /api/sales gagal,
      // uang sudah diterima dari pembeli tapi transaksi belum tercatat di
      // server — keranjang & input TIDAK dikosongkan supaya kasir bisa
      // langsung kirim ulang tanpa mengetik dari awal.
      setError(
        e instanceof Error
          ? `Transaksi GAGAL tersimpan ke server: ${e.message}. Keranjang tidak dikosongkan, coba "Proses Bayar" lagi.`
          : 'Transaksi GAGAL tersimpan ke server. Keranjang tidak dikosongkan, coba "Proses Bayar" lagi.'
      );
    } finally {
      setBusy(false);
    }
  }

  function printReceipt() {
    window.print();
  }

  function shareWhatsApp() {
    if (!success) return;
    const received = success.payment_method === 'cash' ? Number(success.cash_received ?? lastChange + Number(success.grand_total ?? 0)) : 0;
    const changeAmount = success.payment_method === 'cash' ? Math.max(received - Number(success.grand_total ?? 0), 0) : 0;
    const text = `*STRUK PENJUALAN KASIR*\nNo Invoice: ${success.invoice_number}\nTotal: ${money(Number(success.grand_total))}\nMetode: ${paymentLabels[success.payment_method] || success.payment_method}\n${success.payment_method === 'cash' ? `Uang Diterima: ${money(received)}\nKembalian: ${money(changeAmount)}\n` : ''}Status: Lunas\nTerima kasih telah berbelanja!`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  }

  return (
    <div className="pos-page-container">
      {/* Kasir Top Navigation / View Switcher on Mobile */}
      <div className="pos-top-control-bar">
        <div className="pos-heading-group">
          <div className="pos-badge-sub">Terminal Kasir POS</div>
          <h1 className="pos-title">Kasir Penjualan</h1>
          <p className="pos-subtitle">
            Katalog interaktif & kasir cepat dengan tata letak responsif modern.
          </p>
        </div>

        {/* Mobile Segmented Switcher */}
        <div className="pos-mobile-tab-switch" role="tablist" aria-label="Navigasi Kasir">
          <button
            type="button"
            className={`pos-tab-btn ${mobileTab === 'catalog' ? 'active' : ''}`}
            onClick={() => setMobileTab('catalog')}
            role="tab"
            aria-selected={mobileTab === 'catalog'}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none">
              <rect width="7" height="7" x="3" y="3" rx="1" /><rect width="7" height="7" x="14" y="3" rx="1" /><rect width="7" height="7" x="14" y="14" rx="1" /><rect width="7" height="7" x="3" y="14" rx="1" />
            </svg>
            <span>Katalog Produk</span>
          </button>
          <button
            type="button"
            className={`pos-tab-btn ${mobileTab === 'cart' ? 'active' : ''}`}
            onClick={() => setMobileTab('cart')}
            role="tab"
            aria-selected={mobileTab === 'cart'}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none">
              <circle cx="8" cy="21" r="1" /><circle cx="19" cy="21" r="1" />
              <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
            </svg>
            <span>Keranjang</span>
            {totalItemsCount > 0 && <span className="pos-tab-badge">{totalItemsCount}</span>}
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{error}</span>
          <button type="button" className="alert-close" onClick={() => setError('')} aria-label="Tutup pesan">✕</button>
        </div>
      )}

      {/* Modal / Dialog Struk Transaksi Berhasil */}
      {success && (
        <div className="pos-receipt-modal" role="dialog" aria-modal="true" aria-labelledby="receipt-title">
          <div className="pos-receipt-card">
            <div className="pos-receipt-header">
              {isPro && shopLogo && (
                <div className="receipt-shop-brand">
                  <img src={shopLogo} alt={`Logo ${shopName}`} className="receipt-shop-logo" />
                </div>
              )}
              <div className="receipt-shop-name">{shopName}</div>
              <div className="receipt-success-icon">
                <svg viewBox="0 0 24 24" width="32" height="32" stroke="currentColor" strokeWidth="2.5" fill="none">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h2 id="receipt-title" className="receipt-title">Transaksi Berhasil!</h2>
              <div className="receipt-invoice-pill">{success.invoice_number}</div>
              <p className="receipt-time">
                {new Date(success.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
              </p>
            </div>

            <div className="receipt-summary-box">
              <div className="receipt-row">
                <span>Total Belanja</span>
                <strong>{money(Number(success.grand_total))}</strong>
              </div>
              <div className="receipt-row">
                <span>Metode Bayar</span>
                <span className="receipt-badge">{paymentLabels[success.payment_method] || success.payment_method}</span>
              </div>
              {success.payment_method === 'cash' && (
                <>
                  <div className="receipt-row">
                    <span>Uang Diterima</span>
                    <span>{money(Number(success.cash_received))}</span>
                  </div>
                  <div className="receipt-row change-row">
                    <span>Kembalian</span>
                    <strong className="change-amount">{money(lastChange)}</strong>
                  </div>
                </>
              )}
            </div>

            <div className="receipt-actions-grid">
              <button type="button" className="receipt-btn receipt-btn-primary" onClick={printReceipt}>
                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none">
                  <polyline points="6 9 6 2 18 2 18 9" />
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                  <rect width="12" height="8" x="6" y="14" />
                </svg>
                <span>Cetak Struk</span>
              </button>

              <button type="button" className="receipt-btn receipt-btn-wa" onClick={shareWhatsApp}>
                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
                <span>Kirim WhatsApp</span>
              </button>

              <button type="button" className="receipt-btn receipt-btn-outline" onClick={() => setSuccess(null)}>
                Transaksi Baru
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Responsive POS Workspace */}
      <div className="pos-workspace">
        {/* Left: Product Catalog Area */}
        <section
          className={`pos-catalog-panel ${mobileTab === 'catalog' ? 'show-mobile' : 'hide-mobile'}`}
          aria-label="Katalog Produk"
        >
          {/* Search bar & Category filter */}
          <div className="pos-search-card">
            <div className="pos-search-wrapper">
              <span className="pos-search-ico" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              <input
                className="pos-search-input-field"
                type="search"
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Cari nama produk, SKU, barcode..."
                aria-label="Cari produk"
              />
              {q && (
                <button type="button" className="pos-search-clear-btn" onClick={() => setQ('')} aria-label="Bersihkan pencarian">
                  ✕
                </button>
              )}
            </div>

            {/* Category Pills */}
            <div className="pos-category-scroller" role="tablist" aria-label="Filter kategori">
              <button
                type="button"
                className={`pos-cat-chip ${selectedCat === 'all' ? 'active' : ''}`}
                onClick={() => setSelectedCat('all')}
                role="tab"
                aria-selected={selectedCat === 'all'}
              >
                <span>Semua</span>
                <span className="pos-cat-badge">{products.length}</span>
              </button>
              {categories.map(c => {
                const count = products.filter(p => p.category_id === c.id).length;
                return (
                  <button
                    type="button"
                    key={c.id}
                    className={`pos-cat-chip ${selectedCat === c.id ? 'active' : ''}`}
                    onClick={() => setSelectedCat(c.id)}
                    role="tab"
                    aria-selected={selectedCat === c.id}
                  >
                    <span>{c.name}</span>
                    <span className="pos-cat-badge">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Product Cards Grid */}
          {loading ? (
            <div className="pos-state-box">
              <div className="pos-loading-spinner" aria-hidden="true" />
              <p>Memuat katalog produk...</p>
            </div>
          ) : products.length === 0 && error ? (
            <div className="pos-state-box">
              <p>Katalog produk gagal dimuat. Transaksi tidak bisa dibuat dari data kosong/palsu.</p>
              <button type="button" className="btn btn-sm btn-outline mt-2" onClick={() => loadData()}>
                Coba Muat Ulang
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="pos-state-box">
              <p>Tidak ada produk ditemukan{q ? ` untuk "${q}"` : ''}.</p>
              {q && (
                <button type="button" className="btn btn-sm btn-outline mt-2" onClick={() => setQ('')}>
                  Reset Pencarian
                </button>
              )}
            </div>
          ) : (
            <div className="pos-grid">
              {filtered.map(p => {
                const inCart = cart.find(x => x.id === p.id);
                const isOut = Number(p.stock) <= 0;
                const isLow = !isOut && Number(p.stock) <= 5;

                return (
                  <button
                    type="button"
                    key={p.id}
                    className={`pos-card ${inCart ? 'in-cart' : ''} ${isOut ? 'out-of-stock' : ''}`}
                    onClick={() => !isOut && addToCart(p)}
                    disabled={isOut}
                    aria-label={`Tambah ${p.name}`}
                  >
                    {inCart && <span className="pos-card-count-badge">{inCart.quantity}x</span>}

                    <div className="pos-card-header-row">
                      <span className="pos-card-unit">{p.unit}</span>
                      <span className={`pos-card-stock ${isOut ? 'out' : isLow ? 'low' : ''}`}>
                        {isOut ? 'Habis' : `Stok: ${p.stock}`}
                      </span>
                    </div>

                    <div className="pos-card-body">
                      <div className="pos-card-name" title={p.name}>
                        {p.name}
                      </div>
                      {p.sku && <div className="pos-card-sku">SKU: {p.sku}</div>}
                    </div>

                    <div className="pos-card-footer">
                      <div className="pos-card-price">{money(Number(p.selling_price))}</div>
                      <div className="pos-card-add-icon">
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2.5" fill="none">
                          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Right: Sticky Cart & Payment Panel */}
        <aside
          className={`pos-cart-panel ${mobileTab === 'cart' ? 'show-mobile' : 'hide-mobile'}`}
          aria-label="Keranjang dan Pembayaran"
        >
          {/* Cart Header */}
          <div className="pos-cart-top-bar">
            <div className="pos-cart-title-wrap">
              <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none">
                <circle cx="8" cy="21" r="1" /><circle cx="19" cy="21" r="1" />
                <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
              </svg>
              <div>
                <strong>Ringkasan Kasir</strong>
                <span className="pos-cart-item-count">{totalItemsCount} item dipilih</span>
              </div>
            </div>
            {cart.length > 0 && (
              <button
                type="button"
                className="pos-cart-reset-btn"
                onClick={handleReset}
                title="Reset keranjang"
              >
                Reset
              </button>
            )}
          </div>

          {/* Cart Table / Item List */}
          <div className="pos-cart-list-scroll">
            {cart.length === 0 ? (
              <div className="pos-empty-cart">
                <div className="pos-empty-cart-ico">
                  <svg viewBox="0 0 24 24" width="32" height="32" stroke="currentColor" strokeWidth="1.5" fill="none">
                    <circle cx="8" cy="21" r="1" /><circle cx="19" cy="21" r="1" />
                    <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
                  </svg>
                </div>
                <strong>Keranjang Masih Kosong</strong>
                <p>Klik produk pada katalog untuk menambahkan ke pesanan.</p>
              </div>
            ) : (
              <div className="pos-cart-table-wrap">
                <table className="pos-cart-table" aria-label="Daftar item belanja">
                  <thead>
                    <tr>
                      <th scope="col" style={{ width: '45%' }}>Produk</th>
                      <th scope="col" style={{ width: '25%', textAlign: 'center' }}>Qty</th>
                      <th scope="col" style={{ width: '25%', textAlign: 'right' }}>Subtotal</th>
                      <th scope="col" style={{ width: '5%', textAlign: 'center' }} aria-label="Aksi"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map(item => (
                      <tr key={item.id} className="pos-cart-tr">
                        <td className="pos-col-name">
                          <strong className="pos-item-title">{item.name}</strong>
                          <span className="pos-item-rate">
                            {money(Number(item.selling_price))} / {item.unit}
                          </span>
                        </td>
                        <td className="pos-col-qty">
                          <div className="pos-qty-stepper">
                            <button
                              type="button"
                              className="pos-qty-btn"
                              onClick={() => decreaseQty(item.id)}
                              aria-label={`Kurangi ${item.name}`}
                            >
                              −
                            </button>
                            <input
                              type="number"
                              className="pos-qty-input"
                              min="1"
                              max={item.stock}
                              value={item.quantity}
                              onChange={e => setQty(item.id, Number(e.target.value))}
                              aria-label="Kuantitas"
                            />
                            <button
                              type="button"
                              className="pos-qty-btn"
                              disabled={item.quantity >= item.stock}
                              onClick={() => increaseQty(item.id)}
                              aria-label={`Tambah ${item.name}`}
                            >
                              +
                            </button>
                          </div>
                        </td>
                        <td className="pos-col-subtotal">
                          <strong>{money(item.quantity * Number(item.selling_price))}</strong>
                        </td>
                        <td className="pos-col-del">
                          <button
                            type="button"
                            className="pos-del-btn"
                            onClick={() => removeItem(item.id)}
                            aria-label={`Hapus ${item.name}`}
                            title="Hapus item"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Checkout & Calculation Section */}
          <div className="pos-cart-footer-panel">
            {/* Discount Quick Presets */}
            <div className="pos-discount-group">
              <div className="pos-discount-label-row">
                <span>Diskon Transaksi:</span>
                <span className="pos-discount-val">
                  {discountValue > 0 ? `-${money(discountValue)}` : 'Rp 0'}
                </span>
              </div>
              <div className="pos-preset-chips">
                <button
                  type="button"
                  className={`pos-chip ${discount === '0' ? 'active' : ''}`}
                  onClick={() => setDiscount('0')}
                >
                  0%
                </button>
                <button
                  type="button"
                  className="pos-chip"
                  onClick={() => applyDiscountPercent(5)}
                >
                  5%
                </button>
                <button
                  type="button"
                  className="pos-chip"
                  onClick={() => applyDiscountPercent(10)}
                >
                  10%
                </button>
                <button
                  type="button"
                  className="pos-chip"
                  onClick={() => applyDiscountPercent(20)}
                >
                  20%
                </button>
              </div>
            </div>

            {/* Price Calculations */}
            <div className="pos-calculation-rows">
              <div className="pos-calc-row">
                <span>Subtotal ({totalItemsCount} item)</span>
                <span>{money(subtotal)}</span>
              </div>
              {discountValue > 0 && (
                <div className="pos-calc-row text-success">
                  <span>Potongan Diskon</span>
                  <span>-{money(discountValue)}</span>
                </div>
              )}
              <div className="pos-calc-row pos-total-row">
                <strong>Total Tagihan</strong>
                <strong className="pos-total-highlight">{money(total)}</strong>
              </div>
            </div>

            {/* Payment Method Selector */}
            <div className="pos-payment-methods">
              <span className="pos-section-subhead">Pilih Pembayaran:</span>
              <div className="pos-method-grid">
                {(['cash', 'transfer', 'qris', 'debit'] as const).map(m => (
                  <button
                    type="button"
                    key={m}
                    className={`pos-method-card ${paymentMethod === m ? 'active' : ''}`}
                    onClick={() => setPaymentMethod(m)}
                  >
                    <span>{paymentLabels[m]}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Cash Input & Quick Denominations */}
            {paymentMethod === 'cash' && (
              <div className="pos-cash-container">
                <label className="pos-cash-label">
                  <span>Nominal Tunai Diterima:</span>
                  <div className="pos-cash-input-wrap">
                    <span className="pos-currency-prefix">Rp</span>
                    <input
                      type="number"
                      className="pos-cash-input"
                      value={cashReceived}
                      onChange={e => setCashReceived(e.target.value)}
                      placeholder={total ? String(total) : '0'}
                      min="0"
                    />
                  </div>
                </label>

                {/* Quick Cash Buttons */}
                <div className="pos-quick-cash-row">
                  <button
                    type="button"
                    className="pos-quick-btn"
                    onClick={() => setCashReceived(String(total))}
                  >
                    Uang Pas
                  </button>
                  {[50000, 100000, 150000, 200000].map(amt => (
                    <button
                      type="button"
                      key={amt}
                      className="pos-quick-btn"
                      onClick={() => setCashReceived(String(amt))}
                    >
                      {money(amt).replace('Rp', '').trim()}
                    </button>
                  ))}
                </div>

                <div className={`pos-change-banner ${cashValue >= total ? 'ok' : 'short'}`}>
                  <span>Kembalian Kasir:</span>
                  <strong>{money(change)}</strong>
                </div>
              </div>
            )}

            {/* Primary Action Button */}
            <button
              type="button"
              className="pos-submit-btn"
              disabled={busy || cart.length === 0 || (paymentMethod === 'cash' && cashValue > 0 && cashValue < total)}
              onClick={submitSale}
            >
              {busy ? (
                <span>Memproses Transaksi...</span>
              ) : (
                <span>Selesaikan Transaksi ({money(total)})</span>
              )}
            </button>
          </div>
        </aside>
      </div>

      {/* Floating Bottom Cart Bar for Mobile when looking at Catalog */}
      {mobileTab === 'catalog' && cart.length > 0 && (
        <div className="pos-mobile-floating-cart">
          <div className="pos-floating-summary">
            <span className="pos-floating-count">{totalItemsCount} Item</span>
            <strong className="pos-floating-total">{money(total)}</strong>
          </div>
          <button
            type="button"
            className="pos-floating-btn"
            onClick={() => setMobileTab('cart')}
          >
            <span>Buka Keranjang & Bayar →</span>
          </button>
        </div>
      )}
    </div>
  );
}

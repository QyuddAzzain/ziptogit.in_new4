'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

/* ==========================================================================
   Dashboard statistik — Bagian A
   - Kartu statistik: pendapatan kotor, transaksi sukses, transaksi void, net profit
   - Grafik garis (Recharts): pendapatan harian 7 hari terakhir
   - Donut (Recharts): kategori produk terlaris
   - Tabel aktivitas transaksi terakhir (badge Sukses / Void)
   Semua hari dihitung dalam zona waktu Asia/Jakarta (WIB), sama seperti /api/reports.
   ========================================================================== */

/* ---------- Tipe data ---------- */

type Num = number | string | null | undefined;

interface SaleItemRow {
  product_id: string;
  product_name: string;
  quantity: Num;
  subtotal: Num;
}

interface SaleRow {
  id: string;
  invoice_number: string;
  grand_total: Num;
  tax: Num;
  status: string; // 'completed' | 'voided'
  created_at: string;
  sale_items: SaleItemRow[] | null;
}

interface ProductRow {
  id: string;
  name: string;
  category_id: string | null;
  cost_price?: Num; // hanya dimuat untuk owner
  stock: Num;
  minimum_stock: Num;
  unit: string;
  is_active: boolean;
}

interface CategoryRow {
  id: string;
  name: string;
}

interface DashboardRaw {
  shopName: string;
  isOwner: boolean; // dari peran sesi di server; menentukan apakah net profit boleh tampil
  sales: SaleRow[]; // urut terbaru → terlama
  products: ProductRow[];
  categories: CategoryRow[];
  truncated: boolean; // true bila data melebihi batas per permintaan (5.000 baris transaksi / 1.000 produk)
}

type PeriodId = 'today' | '7d';

interface PeriodDef {
  id: PeriodId;
  label: string;
  days: number;
  compareLabel: string;
}

type TrendKind = 'up' | 'down' | 'flat' | 'new';

interface Trend {
  kind: TrendKind;
  pct: number;
}

interface Aggregate {
  gross: number; // total pendapatan kotor (grand_total transaksi sukses)
  success: number; // jumlah transaksi sukses
  voided: number; // jumlah transaksi void
  voidedValue: number; // nilai rupiah transaksi void
  tax: number;
  cogs: number; // harga pokok penjualan
  missingCost: Set<string>; // nama produk terjual yang belum punya harga modal
}

interface SeriesPoint {
  key: string;
  label: string;
  revenue: number;
}

interface DonutSlice {
  name: string;
  value: number;
  color: string;
}

interface DashboardView {
  cur: Aggregate;
  prev: Aggregate;
  profit: number | null; // null = akun bukan owner
  prevProfit: number | null;
  series: SeriesPoint[];
  hasRevenue: boolean;
  slices: DonutSlice[];
  sliceTotal: number;
  recent: SaleRow[];
  lowStock: ProductRow[];
}

/* ---------- Konstanta ---------- */

// Ganti ke true HANYA untuk preview desain tanpa database.
// JANGAN dipakai sebagai fallback saat fetch gagal: data palsu di dashboard
// toko yang asli menyesatkan (pernah jadi bug di katalog kasir).
const USE_MOCK_DATA: boolean = false;

const TZ = 'Asia/Jakarta';
const WINDOW_DAYS = 14; // 7 hari berjalan + 7 hari pembanding
const CHART_DAYS = 7;
const PRODUCTS_ROW_LIMIT = 1000; // batas baris default PostgREST pada GET /api/products
const MAX_SLICES = 5; // kategori teratas di donut, sisanya jadi "Lainnya"
const NO_CATEGORY = 'Tanpa kategori';

const PERIODS: PeriodDef[] = [
  { id: 'today', label: 'Hari ini', days: 1, compareLabel: 'vs kemarin' },
  { id: '7d', label: '7 hari', days: 7, compareLabel: 'vs 7 hari sebelumnya' },
];

const DONUT_COLORS = ['#10B981', '#12443B', '#F59E0B', '#38BDF8', '#8B5CF6'];
const OTHER_COLOR = '#94A3B8';
const LINE_COLOR = '#10B981';

const ERROR_MESSAGES: Record<string, string> = {
  SHOP_FETCH_FAILED: 'Data toko gagal dimuat. Coba muat ulang.',
  SALES_FETCH_FAILED: 'Data transaksi gagal dimuat. Coba muat ulang.',
  PRODUCTS_FETCH_FAILED: 'Data produk gagal dimuat. Coba muat ulang.',
  CATEGORIES_FETCH_FAILED: 'Data kategori gagal dimuat. Coba muat ulang.',
};

/* ---------- Helper angka & format ---------- */

const toNum = (value: Num): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

// Negatif diperbolehkan (net profit bisa rugi), beda dengan money() lama yang di-clamp ke 0.
const formatRupiah = (value: number): string =>
  `${value < 0 ? '-' : ''}Rp ${Math.abs(Math.round(value)).toLocaleString('id-ID')}`;

const formatCompact = (value: number): string => {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  const fmt = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 1 });
  if (abs >= 1_000_000_000) return `${sign}${fmt(abs / 1_000_000_000)} M`;
  if (abs >= 1_000_000) return `${sign}${fmt(abs / 1_000_000)} jt`;
  if (abs >= 1_000) return `${sign}${fmt(abs / 1_000)} rb`;
  return `${sign}${Math.round(abs)}`;
};

const formatPct = (value: number): string =>
  `${value.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`;

const formatDateTime = (iso: string): string =>
  new Date(iso).toLocaleString('id-ID', {
    timeZone: TZ,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

/* ---------- Helper tanggal (WIB) ---------- */

const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

// Kunci hari 'YYYY-MM-DD' menurut WIB.
function dayKey(date: Date): string {
  const parts = dayFormatter.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function shiftDay(key: string, delta: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

// n hari berakhir di endKey, urut lama → baru.
function lastDays(n: number, endKey: string): string[] {
  return Array.from({ length: n }, (_, i) => shiftDay(endKey, i - (n - 1)));
}

function shortDayLabel(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/* ---------- Tren ---------- */

function calcTrend(current: number, previous: number): Trend {
  if (previous === 0) return current === 0 ? { kind: 'flat', pct: 0 } : { kind: 'new', pct: 0 };
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  if (Math.abs(pct) < 0.05) return { kind: 'flat', pct: 0 };
  return { kind: pct > 0 ? 'up' : 'down', pct: Math.abs(pct) };
}

/* ---------- Perhitungan dashboard (fungsi murni) ---------- */

const emptyAggregate = (): Aggregate => ({
  gross: 0,
  success: 0,
  voided: 0,
  voidedValue: 0,
  tax: 0,
  cogs: 0,
  missingCost: new Set<string>(),
});

// Net profit = pendapatan kotor − pajak − HPP.
// HPP memakai products.cost_price SAAT INI (sale_items belum menyimpan snapshot harga modal),
// jadi akurat selama harga modal tidak berubah. Belum termasuk biaya operasional.
function computeDashboard(raw: DashboardRaw, period: PeriodDef, withProfit: boolean): DashboardView {
  const today = dayKey(new Date());
  const curKeys = new Set(lastDays(period.days, today));
  const prevKeys = new Set(lastDays(period.days, shiftDay(today, -period.days)));
  const chartKeys = lastDays(CHART_DAYS, today);
  const revenueByDay = new Map<string, number>(chartKeys.map((k): [string, number] => [k, 0]));

  const categoryNameById = new Map<string, string>(raw.categories.map((c): [string, string] => [c.id, c.name]));
  const costById = new Map<string, number>();
  const categoryByProduct = new Map<string, string>();
  for (const p of raw.products) {
    if (withProfit) costById.set(p.id, toNum(p.cost_price));
    categoryByProduct.set(p.id, (p.category_id && categoryNameById.get(p.category_id)) || NO_CATEGORY);
  }

  const cur = emptyAggregate();
  const prev = emptyAggregate();
  const categoryTotals = new Map<string, number>();

  for (const sale of raw.sales) {
    const key = dayKey(new Date(sale.created_at));
    const bucket = curKeys.has(key) ? cur : prevKeys.has(key) ? prev : null;
    const grand = toNum(sale.grand_total);

    if (sale.status === 'voided') {
      if (bucket) {
        bucket.voided += 1;
        bucket.voidedValue += grand;
      }
      continue;
    }
    if (sale.status !== 'completed') continue;

    if (revenueByDay.has(key)) revenueByDay.set(key, (revenueByDay.get(key) ?? 0) + grand);
    if (!bucket) continue;

    bucket.success += 1;
    bucket.gross += grand;
    bucket.tax += toNum(sale.tax);

    for (const item of sale.sale_items ?? []) {
      if (withProfit) {
        const unitCost = costById.get(item.product_id) ?? 0;
        if (unitCost > 0) bucket.cogs += toNum(item.quantity) * unitCost;
        else bucket.missingCost.add(item.product_name);
      }
      if (bucket === cur) {
        const category = categoryByProduct.get(item.product_id) ?? NO_CATEGORY;
        categoryTotals.set(category, (categoryTotals.get(category) ?? 0) + toNum(item.subtotal));
      }
    }
  }

  const ranked = Array.from(categoryTotals.entries())
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1]);
  const slices: DonutSlice[] = ranked.slice(0, MAX_SLICES).map(([name, value], i) => ({
    name,
    value,
    color: DONUT_COLORS[i % DONUT_COLORS.length],
  }));
  const rest = ranked.slice(MAX_SLICES).reduce((sum, [, value]) => sum + value, 0);
  if (rest > 0) slices.push({ name: 'Lainnya', value: rest, color: OTHER_COLOR });

  const series: SeriesPoint[] = chartKeys.map((key) => ({
    key,
    label: shortDayLabel(key),
    revenue: revenueByDay.get(key) ?? 0,
  }));

  const lowStock = raw.products
    .filter((p) => p.is_active && toNum(p.stock) <= toNum(p.minimum_stock))
    .sort((a, b) => toNum(a.stock) - toNum(b.stock))
    .slice(0, 6);

  return {
    cur,
    prev,
    profit: withProfit ? cur.gross - cur.tax - cur.cogs : null,
    prevProfit: withProfit ? prev.gross - prev.tax - prev.cogs : null,
    series,
    hasRevenue: series.some((point) => point.revenue > 0),
    slices,
    sliceTotal: slices.reduce((sum, s) => sum + s.value, 0),
    recent: raw.sales.slice(0, 8),
    lowStock,
  };
}

/* ---------- Data: lewat API server ----------
   Semua data diambil dari route API yang memfilter shop_id dari sesi login (bukan query langsung
   dari browser), sesuai aturan multi-tenant proyek:
   - GET /api/sales?view=dashboard&from=YYYY-MM-DD  -> transaksi + item + nama toko + peran sesi
   - GET /api/products                              -> produk (harga modal hanya untuk owner)
   - GET /api/categories                            -> kategori
   Tidak menambah file route baru (batas 12 serverless function Vercel Hobby). */

interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

interface DashboardSalesPayload {
  shop_name: string | null;
  role: string;
  rows: SaleRow[];
  truncated: boolean;
}

async function fetchApi<T>(url: string, errorCode: string): Promise<T> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    const json = (await res.json()) as ApiEnvelope<T>;
    if (!res.ok || !json.ok || json.data === undefined) throw new Error(errorCode);
    return json.data;
  } catch {
    throw new Error(errorCode);
  }
}

async function fetchDashboardRaw(fromDay: string): Promise<DashboardRaw> {
  const [sales, products, categories] = await Promise.all([
    fetchApi<DashboardSalesPayload>(`/api/sales?view=dashboard&from=${fromDay}`, 'SALES_FETCH_FAILED'),
    fetchApi<ProductRow[]>('/api/products', 'PRODUCTS_FETCH_FAILED'),
    fetchApi<CategoryRow[]>('/api/categories', 'CATEGORIES_FETCH_FAILED'),
  ]);
  return {
    shopName: sales.shop_name || 'Toko Anda',
    isOwner: sales.role === 'owner',
    sales: sales.rows,
    products,
    categories,
    truncated: sales.truncated || products.length >= PRODUCTS_ROW_LIMIT,
  };
}

/* ---------- Data contoh (hanya bila USE_MOCK_DATA = true) ---------- */

interface MockProduct {
  id: string;
  name: string;
  category_id: string;
  cost: number;
  price: number;
  unit: string;
  stock: number;
  min: number;
}

const MOCK_CATEGORIES: CategoryRow[] = [
  { id: 'cat-1', name: 'Makanan' },
  { id: 'cat-2', name: 'Minuman' },
  { id: 'cat-3', name: 'Camilan' },
  { id: 'cat-4', name: 'Sembako' },
];

const MOCK_CATALOG: MockProduct[] = [
  { id: 'p1', name: 'Nasi Goreng', category_id: 'cat-1', cost: 12000, price: 22000, unit: 'PORSI', stock: 40, min: 10 },
  { id: 'p2', name: 'Mie Ayam', category_id: 'cat-1', cost: 9000, price: 18000, unit: 'PORSI', stock: 6, min: 10 },
  { id: 'p3', name: 'Es Teh', category_id: 'cat-2', cost: 1500, price: 5000, unit: 'GELAS', stock: 80, min: 20 },
  { id: 'p4', name: 'Kopi Susu', category_id: 'cat-2', cost: 6000, price: 15000, unit: 'GELAS', stock: 55, min: 20 },
  { id: 'p5', name: 'Keripik Singkong', category_id: 'cat-3', cost: 7000, price: 12000, unit: 'PCS', stock: 3, min: 8 },
  { id: 'p6', name: 'Beras 5 kg', category_id: 'cat-4', cost: 62000, price: 72000, unit: 'PCS', stock: 25, min: 5 },
];

// Pseudo-random deterministik supaya tampilan mock selalu sama.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildMockRaw(withCost: boolean): DashboardRaw {
  const rand = mulberry32(20260919);
  const today = dayKey(new Date());
  const sales: SaleRow[] = [];

  for (let offset = WINDOW_DAYS - 1; offset >= 0; offset -= 1) {
    const key = shiftDay(today, -offset);
    const count = 6 + Math.floor(rand() * 8);
    for (let n = 0; n < count; n += 1) {
      const lines = 1 + Math.floor(rand() * 3);
      const items: SaleItemRow[] = [];
      let total = 0;
      for (let l = 0; l < lines; l += 1) {
        const product = MOCK_CATALOG[Math.floor(rand() * MOCK_CATALOG.length)];
        const quantity = 1 + Math.floor(rand() * 3);
        const subtotal = quantity * product.price;
        total += subtotal;
        items.push({ product_id: product.id, product_name: product.name, quantity, subtotal });
      }
      const hour = String(8 + Math.floor(rand() * 12)).padStart(2, '0');
      const minute = String(Math.floor(rand() * 60)).padStart(2, '0');
      sales.push({
        id: `mock-${key}-${n}`,
        invoice_number: `INV-${key.replace(/-/g, '')}-${String(n + 1).padStart(3, '0')}`,
        grand_total: total,
        tax: 0,
        status: rand() < 0.08 ? 'voided' : 'completed',
        created_at: `${key}T${hour}:${minute}:00+07:00`,
        sale_items: items,
      });
    }
  }
  sales.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));

  const products: ProductRow[] = MOCK_CATALOG.map((p) => ({
    id: p.id,
    name: p.name,
    category_id: p.category_id,
    ...(withCost ? { cost_price: p.cost } : {}),
    stock: p.stock,
    minimum_stock: p.min,
    unit: p.unit,
    is_active: true,
  }));

  return { shopName: 'Toko Contoh', isOwner: withCost, sales, products, categories: MOCK_CATEGORIES, truncated: false };
}

/* ---------- Komponen kecil ---------- */

function TrendBadge({ trend, goodWhen }: { trend: Trend; goodWhen: 'up' | 'down' }) {
  if (trend.kind === 'new') return <span className="dash-trend dash-trend-flat">Baru</span>;
  if (trend.kind === 'flat') return <span className="dash-trend dash-trend-flat">0%</span>;
  const good = trend.kind === goodWhen;
  const arrow = trend.kind === 'up' ? '▲' : '▼';
  const words = trend.kind === 'up' ? 'Naik' : 'Turun';
  return (
    <span
      className={`dash-trend ${good ? 'dash-trend-good' : 'dash-trend-bad'}`}
      aria-label={`${words} ${formatPct(trend.pct)}`}
    >
      {arrow} {formatPct(trend.pct)}
    </span>
  );
}

interface StatCardProps {
  icon: string;
  iconClass?: string;
  label: string;
  value: string;
  trend: Trend | null;
  goodWhen: 'up' | 'down';
  compareLabel: string;
  foot?: string;
  warn?: string;
}

function StatCard({ icon, iconClass, label, value, trend, goodWhen, compareLabel, foot, warn }: StatCardProps) {
  return (
    <div className="card metric-card">
      <div className={`metric-icon ${iconClass ?? ''}`} aria-hidden="true">
        {icon}
      </div>
      <div className="dash-metric-body">
        <div className="muted">{label}</div>
        <div className="metric">{value}</div>
        {trend && (
          <div className="dash-metric-foot">
            <TrendBadge trend={trend} goodWhen={goodWhen} />
            <span className="muted">{compareLabel}</span>
          </div>
        )}
        {foot && <div className="muted dash-note">{foot}</div>}
        {warn && <div className="dash-note dash-note-warn">{warn}</div>}
      </div>
    </div>
  );
}

/* ---------- Halaman ---------- */

export default function Dashboard() {
  const [raw, setRaw] = useState<DashboardRaw | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [periodId, setPeriodId] = useState<PeriodId>('7d');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const period = PERIODS.find((p) => p.id === periodId) ?? PERIODS[1];

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const fromDay = shiftDay(dayKey(new Date()), -(WINDOW_DAYS - 1));
      const data = USE_MOCK_DATA ? buildMockRaw(true) : await fetchDashboardRaw(fromDay);
      setIsOwner(data.isOwner);
      setRaw(data);
      const time = new Date().toLocaleTimeString('id-ID', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
      setMessage(`Data diperbarui pukul ${time} WIB.`);
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      setError(ERROR_MESSAGES[code] ?? 'Dashboard gagal dimuat. Periksa koneksi internet lalu coba lagi.');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const view = useMemo(() => (raw ? computeDashboard(raw, period, isOwner) : null), [raw, period, isOwner]);
  const shopName = raw?.shopName ?? 'Toko Anda';
  const dash = (text: string) => (view ? text : '—');

  const avgTicket = view && view.cur.success > 0 ? view.cur.gross / view.cur.success : 0;
  const margin = view && view.profit !== null && view.cur.gross > 0 ? (view.profit / view.cur.gross) * 100 : 0;
  const missingCount = view ? view.cur.missingCost.size : 0;

  return (
    <section className="dash">
      <div className="page-head">
        <div>
          <div className="eyebrow">Ringkasan usaha</div>
          <h1>Dashboard</h1>
          <p className="muted">Pantau penjualan, laba, stok, dan aktivitas toko dari satu tempat.</p>
        </div>
        <div className="row-actions">
          <div className="dash-period" role="group" aria-label="Periode statistik">
            {PERIODS.map((p) => (
              <button key={p.id} type="button" aria-pressed={p.id === periodId} onClick={() => setPeriodId(p.id)}>
                {p.label}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-ghost" onClick={load} disabled={busy}>
            {busy ? 'Memuat…' : '↻ Muat Ulang'}
          </button>
          <Link className="btn" href="/kasir">
            Buka Kasir
          </Link>
        </div>
      </div>

      <div className="shop-banner">
        <div>
          <div className="shop-banner-title">{shopName}</div>
          <div className="shop-banner-sub">Point of Sale UMKM · Siap melayani transaksi</div>
        </div>
        <span className={`badge ${USE_MOCK_DATA ? 'badge-warn' : 'badge-ok'}`}>
          {USE_MOCK_DATA ? 'Data contoh' : 'Operasional'}
        </span>
      </div>

      {error && (
        <div className="card">
          <p className="error-text" role="alert">
            {error}
          </p>
        </div>
      )}
      {!error && message && (
        <p className="dash-updated" role="status">
          {message}
        </p>
      )}
      {raw?.truncated && (
        <p className="dash-note dash-note-warn" role="status">
          Jumlah data melebihi batas dashboard, sehingga angka bisa kurang lengkap. Gunakan menu Laporan untuk angka penuh.
        </p>
      )}

      <div className="grid grid-4 dash-stat">
        <StatCard
          icon="Rp"
          label="Total pendapatan kotor"
          value={dash(view ? formatRupiah(view.cur.gross) : '')}
          trend={view ? calcTrend(view.cur.gross, view.prev.gross) : null}
          goodWhen="up"
          compareLabel={period.compareLabel}
          foot={view ? 'Nilai seluruh transaksi sukses' : undefined}
        />
        <StatCard
          icon="✓"
          label="Total transaksi sukses"
          value={dash(view ? String(view.cur.success) : '')}
          trend={view ? calcTrend(view.cur.success, view.prev.success) : null}
          goodWhen="up"
          compareLabel={period.compareLabel}
          foot={view ? `Rata-rata ${formatRupiah(avgTicket)} per transaksi` : undefined}
        />
        <StatCard
          icon="✕"
          iconClass="dash-icon-danger"
          label="Total transaksi void"
          value={dash(view ? String(view.cur.voided) : '')}
          trend={view ? calcTrend(view.cur.voided, view.prev.voided) : null}
          goodWhen="down"
          compareLabel={period.compareLabel}
          foot={view ? `Nilai ${formatRupiah(view.cur.voidedValue)} dibatalkan` : undefined}
        />
        <StatCard
          icon="↗"
          iconClass="dash-icon-gold"
          label="Net profit"
          value={view ? (view.profit === null ? 'Khusus owner' : formatRupiah(view.profit)) : '—'}
          trend={view && view.profit !== null && view.prevProfit !== null ? calcTrend(view.profit, view.prevProfit) : null}
          goodWhen="up"
          compareLabel={period.compareLabel}
          foot={
            view
              ? view.profit === null
                ? 'Laba hanya tampil untuk akun owner.'
                : `Margin ${formatPct(margin)} (penjualan − harga modal)`
              : undefined
          }
          warn={
            missingCount > 0
              ? `${missingCount} produk terjual belum punya harga modal, laba bisa lebih besar dari sebenarnya.`
              : undefined
          }
        />
      </div>

      <div className="dash-split">
        <div className="card">
          <div className="section-title">
            <div>
              <h3>Tren pendapatan</h3>
              <p className="muted">Pendapatan harian, 7 hari terakhir.</p>
            </div>
          </div>
          {!view ? (
            <p className="empty">{busy ? 'Memuat grafik…' : 'Grafik belum bisa ditampilkan.'}</p>
          ) : !view.hasRevenue ? (
            <p className="empty">Belum ada penjualan dalam 7 hari terakhir.</p>
          ) : (
            <div className="dash-chart-box" role="img" aria-label="Grafik garis pendapatan harian 7 hari terakhir">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={view.series} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748B' }} />
                  <YAxis
                    width={52}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    tickFormatter={(value) => formatCompact(Number(value))}
                  />
                  <Tooltip
                    formatter={(value) => formatRupiah(Number(value))}
                    contentStyle={{ borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 12 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    name="Pendapatan"
                    stroke={LINE_COLOR}
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: LINE_COLOR, strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="card">
          <div className="section-title">
            <div>
              <h3>Kategori terlaris</h3>
              <p className="muted">Berdasarkan nilai penjualan, {period.label.toLowerCase()}.</p>
            </div>
          </div>
          {!view ? (
            <p className="empty">{busy ? 'Memuat grafik…' : 'Grafik belum bisa ditampilkan.'}</p>
          ) : view.slices.length === 0 ? (
            <p className="empty">Belum ada penjualan pada periode ini.</p>
          ) : (
            <div className="dash-donut">
              <div className="dash-donut-chart" role="img" aria-label="Diagram donut kategori produk terlaris">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={view.slices}
                      dataKey="value"
                      nameKey="name"
                      innerRadius="62%"
                      outerRadius="92%"
                      paddingAngle={2}
                      stroke="none"
                    >
                      {view.slices.map((slice) => (
                        <Cell key={slice.name} fill={slice.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => formatRupiah(Number(value))}
                      contentStyle={{ borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 12 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="dash-donut-center">
                  <strong>{formatCompact(view.sliceTotal)}</strong>
                  <span>total</span>
                </div>
              </div>
              <ul className="dash-legend">
                {view.slices.map((slice) => (
                  <li key={slice.name}>
                    <span className="dash-dot" style={{ background: slice.color }} />
                    <span>{slice.name}</span>
                    <span className="dash-legend-val">{Math.round((slice.value / view.sliceTotal) * 100)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="dash-split">
        <div className="card">
          <div className="section-title">
            <div>
              <h3>Aktivitas transaksi terakhir</h3>
              <p className="muted">Penjualan yang sukses dan yang dibatalkan (void).</p>
            </div>
            <Link href="/transaksi">Lihat semua</Link>
          </div>
          {!view ? (
            <p className="muted">{busy ? 'Memuat…' : 'Data transaksi belum bisa ditampilkan.'}</p>
          ) : view.recent.length === 0 ? (
            <p className="empty">Belum ada transaksi.</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Waktu</th>
                    <th className="num">Total</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {view.recent.map((sale) => {
                    const voided = sale.status === 'voided';
                    return (
                      <tr key={sale.id}>
                        <td>
                          <Link href={`/transaksi/${sale.id}`}>{sale.invoice_number}</Link>
                        </td>
                        <td>{formatDateTime(sale.created_at)}</td>
                        <td className="num">
                          <span className={voided ? 'dash-void-amount' : undefined}>
                            {formatRupiah(toNum(sale.grand_total))}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${voided ? 'badge-warn' : 'badge-ok'}`}>{voided ? 'Void' : 'Sukses'}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <div className="section-title">
            <div>
              <h3>Stok perlu perhatian</h3>
              <p className="muted">Produk di bawah batas minimum.</p>
            </div>
            <Link href="/stok">Kelola stok</Link>
          </div>
          {!view ? (
            <p className="muted">{busy ? 'Memuat…' : 'Data stok belum bisa ditampilkan.'}</p>
          ) : view.lowStock.length === 0 ? (
            <p className="empty">Semua stok masih aman.</p>
          ) : (
            <div className="activity-list">
              {view.lowStock.map((product) => (
                <div className="activity-row" key={product.id}>
                  <div>
                    <strong>{product.name}</strong>
                    <span className="muted">
                      Minimum {toNum(product.minimum_stock)} {product.unit}
                    </span>
                  </div>
                  <span className="badge badge-warn">
                    {toNum(product.stock)} {product.unit}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

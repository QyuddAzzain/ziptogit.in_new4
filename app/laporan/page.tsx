'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type Sale = {
  id: string;
  invoice_number: string;
  grand_total: number | string;
  subtotal: number | string;
  discount: number | string;
  tax: number | string;
  payment_method: string;
  payment_status: string;
  status: string;
  created_at: string;
};

type ReportData = {
  tier: 'free' | 'pro';
  limited: boolean;
  requestedFrom: string | null;
  requestedTo: string | null;
  from: string | null;
  to: string | null;
  transactions: number;
  omzet: number;
  subtotal: number;
  discount: number;
  tax: number;
  rows: Sale[];
};

const paymentLabels: Record<string, string> = {
  cash: 'Tunai',
  qris: 'QRIS',
  transfer: 'Transfer',
  debit: 'Debit',
  other: 'Lainnya',
};

const money = (v: number) => `Rp ${Math.max(0, v).toLocaleString('id-ID')}`;

function pad(n: number) { return String(n).padStart(2, '0'); }
function localDate(offsetDays = 0) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
function downloadBlob(filename: string, content: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Page() {
  const [from, setFrom] = useState(localDate(-9));
  const [to, setTo] = useState(localDate(0));
  const [preset, setPreset] = useState('10days');
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadReport = useCallback(async (nextFrom: string, nextTo: string) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ from: nextFrom, to: nextTo });
      const res = await fetch(`/api/reports?${params.toString()}`, { cache: 'no-store' });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Gagal memuat laporan');
      setReport(json.data);
    } catch (e) {
      setReport(null);
      setError(e instanceof Error ? e.message : 'Gagal memuat laporan');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadReport(from, to); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const average = report?.transactions ? report.omzet / report.transactions : 0;

  function applyPreset(value: string) {
    setPreset(value);
    const nextTo = localDate(0);
    const nextFrom = value === 'today' ? nextTo : value === 'month' ? localDate(-(new Date().getDate() - 1)) : localDate(-9);
    setFrom(nextFrom);
    setTo(nextTo);
    void loadReport(nextFrom, nextTo);
  }

  function applyRange() {
    if (!from || !to) return setError('Tanggal awal dan akhir wajib diisi.');
    void loadReport(from, to);
    setPreset('custom');
  }

  const exportExcel = useCallback(() => {
    if (!report?.tier || report.tier !== 'pro') return;
    const rows = report.rows;
    const body = rows.map(row => `
      <tr>
        <td>${escapeHtml(new Date(row.created_at).toLocaleString('id-ID'))}</td>
        <td>${escapeHtml(row.invoice_number)}</td>
        <td>${escapeHtml(row.status)}</td>
        <td>${escapeHtml(row.payment_status)}</td>
        <td>${escapeHtml(paymentLabels[row.payment_method] ?? row.payment_method)}</td>
        <td>${escapeHtml(money(Number(row.subtotal)))}</td>
        <td>${escapeHtml(money(Number(row.discount)))}</td>
        <td>${escapeHtml(money(Number(row.tax)))}</td>
        <td>${escapeHtml(money(Number(row.grand_total)))}</td>
      </tr>`).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
      body{font-family:Arial,sans-serif;font-size:11px} h1{font-size:18px} p{color:#555}
      table{border-collapse:collapse;width:100%} th,td{border:1px solid #cbd5e1;padding:6px;text-align:left} th{background:#f1f5f9;font-weight:700}
      td:nth-child(n+6){text-align:right}
    </style></head><body>
      <h1>Point of Sale UMKM — Laporan Penjualan</h1>
      <p>Periode: ${escapeHtml(report.from)} s.d. ${escapeHtml(report.to)}${report.limited ? ' (dipotong sesuai batas Paket Gratis)' : ''}</p>
      <table><thead><tr><th>Waktu</th><th>Invoice</th><th>Status</th><th>Status bayar</th><th>Metode</th><th>Subtotal</th><th>Diskon</th><th>Pajak</th><th>Total</th></tr></thead><tbody>${body}</tbody></table>
      <p>Total transaksi: <strong>${report.transactions}</strong> &nbsp; Omzet: <strong>${escapeHtml(money(report.omzet))}</strong></p>
    </body></html>`;
    downloadBlob(`laporan-penjualan-${report.from}-${report.to}.xls`, html, 'application/vnd.ms-excel;charset=utf-8');
  }, [report]);

  function exportPdf() {
    if (report?.tier !== 'pro') return;
    window.print();
  }

  return (
    <section className="report-page">
      <div className="page-head report-screen-only">
        <div>
          <div className="eyebrow">Analitik usaha</div>
          <h1>Laporan</h1>
          <p className="muted">Ringkasan penjualan berdasarkan periode yang dipilih.</p>
        </div>
        <div className="report-actions">
          <button className="btn btn-ghost" type="button" onClick={exportExcel} disabled={report?.tier !== 'pro' || loading}>Export Excel</button>
          <button className="btn" type="button" onClick={exportPdf} disabled={report?.tier !== 'pro' || loading}>Export PDF / Cetak</button>
        </div>
      </div>

      <div className="card report-filter-card report-screen-only">
        <div className="report-filter-head">
          <div>
            <strong>Periode laporan</strong>
            <p className="muted">Gunakan rentang tanggal untuk menyiapkan laporan yang lebih spesifik.</p>
          </div>
          <span className={`badge ${report?.tier === 'pro' ? 'badge-ok' : ''}`}>{report?.tier === 'pro' ? 'PRO' : 'GRATIS'}</span>
        </div>
        <div className="report-filter-grid">
          <label>Dari<input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
          <label>Sampai<input type="date" value={to} onChange={e => setTo(e.target.value)} /></label>
          <label>Preset<select value={preset} onChange={e => applyPreset(e.target.value)}><option value="today">Hari ini</option><option value="10days">10 hari terakhir</option><option value="month">Bulan ini</option><option value="custom">Custom</option></select></label>
          <button className="btn" type="button" onClick={applyRange} disabled={loading}>{loading ? 'Memuat…' : 'Terapkan'}</button>
        </div>
      </div>

      {!loading && report?.limited && (
        <div className="alert alert-warning report-screen-only">
          <strong>Batas Paket Gratis:</strong>&nbsp; laporan dibatasi otomatis ke 10 hari terakhir. Data di luar rentang tersebut tidak dihapus, hanya tidak ditampilkan pada laporan.
        </div>
      )}

      {!loading && report?.tier === 'free' && (
        <div className="info-card report-screen-only">
          <strong>Pengingat backup mingguan</strong>
          <p className="muted">Untuk Paket Gratis, lakukan backup manual minimal <strong>1× setiap 7 hari</strong> agar data toko tetap memiliki salinan cadangan.</p>
        </div>
      )}

      {error && <div className="alert alert-error report-screen-only" role="alert">{error}</div>}

      <div className="report-print-header">
        <div className="eyebrow">Point of Sale UMKM</div>
        <h1>Laporan Penjualan</h1>
        <p>Periode {report?.from ?? from} s.d. {report?.to ?? to}</p>
      </div>

      <div className="grid grid-4 report-metrics">
        <div className="card"><div className="muted">Omzet</div><div className="metric">{loading || !report ? '—' : money(report.omzet)}</div></div>
        <div className="card"><div className="muted">Transaksi</div><div className="metric">{loading || !report ? '—' : report.transactions}</div></div>
        <div className="card"><div className="muted">Rata-rata transaksi</div><div className="metric">{loading || !report ? '—' : money(average)}</div></div>
        <div className="card"><div className="muted">Status data</div><div className="metric">{loading ? 'Memuat' : report ? 'Live' : '—'}</div></div>
      </div>

      <div className="card report-table-card">
        <div className="section-title">
          <div><h3>Penjualan periode</h3><p className="muted">Transaksi selesai yang masuk perhitungan laporan.</p></div>
          <span className="muted">{report?.rows.length ?? 0} baris</span>
        </div>
        {loading ? <p className="muted">Memuat laporan…</p> : !report || report.rows.length === 0 ? <p className="empty">Belum ada transaksi pada periode ini.</p> : (
          <div className="table-wrap"><table className="table"><thead><tr><th>Waktu</th><th>Invoice</th><th>Metode</th><th>Total</th></tr></thead><tbody>
            {report.rows.map(row => <tr key={row.id}><td>{new Date(row.created_at).toLocaleString('id-ID')}</td><td><strong>{row.invoice_number}</strong></td><td>{paymentLabels[row.payment_method] ?? row.payment_method}</td><td className="num">{money(Number(row.grand_total))}</td></tr>)}
          </tbody></table></div>
        )}
      </div>

      <div className="report-print-footer">
        <span>© 2026 Point of Sale UMKM • Semua hak dilindungi.</span>
      </div>
    </section>
  );
}

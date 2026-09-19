'use client';

import { useEffect, useState } from 'react';

type ShopOverview = {
  id: string;
  name: string | null;
  business_type: string | null;
  tier: string;
  tier_expires_at: string | null;
  created_at: string;
  member_count: number;
  product_count: number;
  sales_count: number;
  sales_total: number;
};

type ManualPayment = {
  merchant_order_id: string;
  shop_id: string;
  amount: number;
  status: string;
  created_at: string;
  shops: { name: string | null } | null;
};

export default function AdminPlatform() {
  const [shops, setShops] = useState<ShopOverview[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const [manualPayments, setManualPayments] = useState<ManualPayment[] | null>(null);
  const [manualError, setManualError] = useState('');
  const [manualLoading, setManualLoading] = useState(true);
  const [confirmBusyId, setConfirmBusyId] = useState<string | null>(null);
  const [confirmMsg, setConfirmMsg] = useState('');

  function loadShops() {
    setLoading(true);
    fetch('/api/admin?scope=platform')
      .then(r => r.json())
      .then(json => {
        if (!json.ok) throw new Error(json.error || 'Gagal memuat data platform');
        setShops(json.data);
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Gagal memuat data platform'))
      .finally(() => setLoading(false));
  }

  function loadManualPayments() {
    setManualLoading(true);
    fetch('/api/admin?scope=manual-payments')
      .then(r => r.json())
      .then(json => {
        if (!json.ok) throw new Error(json.error || 'Gagal memuat transfer manual');
        setManualPayments(json.data);
      })
      .catch(e => setManualError(e instanceof Error ? e.message : 'Gagal memuat transfer manual'))
      .finally(() => setManualLoading(false));
  }

  useEffect(() => {
    loadShops();
    loadManualPayments();
  }, []);

  async function confirmManual(merchantOrderId: string) {
    setConfirmBusyId(merchantOrderId);
    setConfirmMsg('');
    try {
      const res = await fetch('/api/admin?action=confirm-manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchant_order_id: merchantOrderId }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Gagal konfirmasi pembayaran');
      setConfirmMsg(`${merchantOrderId} dikonfirmasi, tier toko naik ke Pro.`);
      loadManualPayments();
      loadShops();
    } catch (e) {
      setConfirmMsg(e instanceof Error ? e.message : 'Gagal konfirmasi pembayaran');
    } finally {
      setConfirmBusyId(null);
    }
  }

  return (
    <section>
      <div className="page-head">
        <div>
          <div className="eyebrow">Admin Platform</div>
          <h1>Semua Toko</h1>
          <p className="muted">Ringkasan lintas-toko untuk keperluan dukungan &amp; pemantauan platform.</p>
        </div>
      </div>

      <div className="card table-wrap" style={{ marginBottom: '1.5rem' }}>
        <h3>Transfer Manual Menunggu Konfirmasi</h3>
        {manualLoading ? (
          <p className="muted">Memuat…</p>
        ) : manualError ? (
          <p role="alert" className="error-text">
            {manualError}
            {manualError.toLowerCase().includes('ditolak') && (
              <> — halaman ini hanya untuk email yang terdaftar di env <code>PLATFORM_ADMIN_EMAILS</code>.</>
            )}
          </p>
        ) : (
          <>
            {confirmMsg && <p className="muted">{confirmMsg}</p>}
            <table className="table">
              <thead>
                <tr>
                  <th>Toko</th>
                  <th>Kode</th>
                  <th>Nominal</th>
                  <th>Diminta</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(manualPayments ?? []).map(p => (
                  <tr key={p.merchant_order_id}>
                    <td>{p.shops?.name || '—'}</td>
                    <td>{p.merchant_order_id}</td>
                    <td className="num">Rp {Number(p.amount).toLocaleString('id-ID')}</td>
                    <td>{new Date(p.created_at).toLocaleString('id-ID')}</td>
                    <td>
                      <button
                        type="button"
                        className="btn"
                        disabled={confirmBusyId === p.merchant_order_id}
                        onClick={() => confirmManual(p.merchant_order_id)}
                      >
                        {confirmBusyId === p.merchant_order_id ? 'Memproses…' : 'Konfirmasi lunas'}
                      </button>
                    </td>
                  </tr>
                ))}
                {!manualPayments?.length && (
                  <tr><td colSpan={5} className="empty">Tidak ada transfer manual yang menunggu.</td></tr>
                )}
              </tbody>
            </table>
          </>
        )}
      </div>

      {loading ? (
        <p className="muted">Memuat…</p>
      ) : error ? (
        <p role="alert" className="error-text">
          {error}
          {error.toLowerCase().includes('ditolak') && (
            <> — halaman ini hanya untuk email yang terdaftar di env <code>PLATFORM_ADMIN_EMAILS</code>.</>
          )}
        </p>
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Toko</th>
                <th>Jenis</th>
                <th>Tier</th>
                <th>Anggota</th>
                <th>Produk</th>
                <th>Transaksi</th>
                <th>Total Penjualan</th>
                <th>Dibuat</th>
              </tr>
            </thead>
            <tbody>
              {(shops ?? []).map(shop => (
                <tr key={shop.id}>
                  <td><strong>{shop.name || '—'}</strong></td>
                  <td>{shop.business_type || '—'}</td>
                  <td>
                    <span className={`badge ${shop.tier === 'pro' ? 'badge-ok' : ''}`}>{shop.tier === 'pro' ? 'Pro' : 'Gratis'}</span>
                    {shop.tier === 'pro' && shop.tier_expires_at && (
                      <span className="muted"> s.d. {new Date(shop.tier_expires_at).toLocaleDateString('id-ID')}</span>
                    )}
                  </td>
                  <td>{shop.member_count}</td>
                  <td>{shop.product_count}</td>
                  <td>{shop.sales_count}</td>
                  <td className="num">Rp {shop.sales_total.toLocaleString('id-ID')}</td>
                  <td>{new Date(shop.created_at).toLocaleDateString('id-ID')}</td>
                </tr>
              ))}
              {!shops?.length && (
                <tr><td colSpan={8} className="empty">Belum ada toko.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

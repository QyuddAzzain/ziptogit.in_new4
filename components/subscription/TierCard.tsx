'use client';

import { useEffect, useState } from 'react';

type ManualAccount = {
  method: string;
  bank: string;
  accountName: string;
  accountNumber: string;
};

type ManualResult = {
  merchantOrderId: string;
  amount: number;
  accounts: ManualAccount[];
  instructions: string;
};

type StatusResponse = {
  tier: string;
  isPro: boolean;
  tierExpiresAt: string | null;
  priceIDR: number;
  canUpgrade: boolean;
  pakasirConfigured: boolean;
  paymentStatus?: string | null;
  maxProducts: number;
  maxActiveMembers: number;
};

export function TierCard() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [manual, setManual] = useState<ManualResult | null>(null);
  const [paymentNotice, setPaymentNotice] = useState<'checking' | 'success' | 'pending' | 'failed' | null>(null);

  async function fetchStatus(orderId?: string) {
    const query = orderId ? `?order_id=${encodeURIComponent(orderId)}` : '';
    const res = await fetch(`/api/subscription${query}`, { cache: 'no-store' });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'Gagal memuat status tier');
    return json.data as StatusResponse;
  }

  async function loadStatus(options?: { orderId?: string; initial?: boolean }) {
    if (options?.initial) setLoading(true);
    setError('');
    try {
      const nextStatus = await fetchStatus(options?.orderId);
      setStatus(nextStatus);
      return nextStatus;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat status tier');
      return null;
    } finally {
      if (options?.initial) setLoading(false);
    }
  }

  useEffect(() => {
    void loadStatus({ initial: true });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') !== 'success') return;

    const orderId = params.get('order_id')?.trim();
    if (!orderId) {
      setPaymentNotice('failed');
      setError('Kembali dari Pakasir berhasil, tetapi kode transaksi tidak ditemukan. Status pembayaran tidak diubah oleh browser.');
      return;
    }

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const deadline = Date.now() + 45_000;
    setPaymentNotice('checking');
    setError('');

    const poll = async () => {
      try {
        const nextStatus = await fetchStatus(orderId);
        if (cancelled) return;
        setStatus(nextStatus);
        if (nextStatus.isPro || nextStatus.paymentStatus === 'paid') {
          setPaymentNotice('success');
          return;
        }
        if (nextStatus.paymentStatus && nextStatus.paymentStatus !== 'pending') {
          setPaymentNotice('failed');
          return;
        }
        if (Date.now() < deadline) {
          timeoutId = setTimeout(poll, 1500);
        } else {
          setPaymentNotice('pending');
        }
      } catch (e) {
        if (cancelled) return;
        if (Date.now() < deadline) {
          timeoutId = setTimeout(poll, 2000);
        } else {
          setPaymentNotice('pending');
          setError(e instanceof Error ? e.message : 'Status pembayaran belum dapat diverifikasi.');
        }
      }
    };

    void poll();
    window.history.replaceState({}, document.title, '/pengaturan');
    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  async function upgradeViaPakasir() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/subscription', { method: 'POST' });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Gagal membuat pembayaran');
      window.location.href = json.data.paymentUrl;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal membuat pembayaran');
      setBusy(false);
    }
  }

  async function upgradeViaManualTransfer() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/subscription?action=manual', { method: 'POST' });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Gagal membuat permintaan transfer manual');
      setManual(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal membuat permintaan transfer manual');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card form-grid">
      <h3>Tier Toko</h3>
      {loading ? (
        <p className="muted">Memeriksa status tier…</p>
      ) : !status ? (
        <p role="alert" className="error-text">{error || 'Gagal memuat status tier.'}</p>
      ) : (
        <>
          {paymentNotice === 'checking' && (
            <p className="muted" role="status">Pembayaran kembali dari Pakasir. Memverifikasi konfirmasi…</p>
          )}
          {paymentNotice === 'success' && (
            <p role="status" className="muted">Pembayaran terkonfirmasi. Tier Pro sudah aktif.</p>
          )}
          {paymentNotice === 'pending' && (
            <p role="status" className="muted">Pembayaran sudah kembali dari Pakasir, tetapi webhook belum terkonfirmasi. Tunggu sebentar lalu refresh halaman.</p>
          )}
          {paymentNotice === 'failed' && (
            <p role="alert" className="error-text">Pembayaran belum dapat diverifikasi. Jangan melakukan pembayaran ulang sebelum status transaksi diperiksa.</p>
          )}
          <p style={{ margin: 0 }}>
            Paket saat ini: <strong>{status.isPro ? 'Pro' : 'Gratis'}</strong>
            {status.isPro && status.tierExpiresAt && (
              <span className="muted"> — aktif sampai {new Date(status.tierExpiresAt).toLocaleDateString('id-ID')}</span>
            )}
          </p>
          {!status.isPro && (
            <p className="muted" style={{ margin: 0 }}>
              Paket Gratis dibatasi {status.maxProducts} produk &amp; {status.maxActiveMembers} anggota toko (termasuk owner). Upgrade ke Pro
              (Rp {status.priceIDR.toLocaleString('id-ID')}/30 hari) untuk produk &amp; anggota tanpa batas.
            </p>
          )}
          {error && <p role="alert" className="error-text">{error}</p>}

          {!status.isPro && status.canUpgrade && !manual && (
            <div className="form-grid" style={{ gap: '0.5rem' }}>
              {!status.pakasirConfigured ? (
                <p className="muted" style={{ margin: 0 }}>
                  Pembayaran Pakasir belum dikonfigurasi oleh pengelola platform.
                </p>
              ) : (
                <button type="button" className="btn" onClick={upgradeViaPakasir} disabled={busy}>
                  {busy ? 'Menyiapkan pembayaran…' : 'Bayar via Pakasir'}
                </button>
              )}
              <button type="button" className="btn btn-ghost" onClick={upgradeViaManualTransfer} disabled={busy}>
                {busy ? 'Menyiapkan…' : 'Transfer manual'}
              </button>
            </div>
          )}

          {manual && (
            <div className="card" style={{ marginTop: '0.5rem' }}>
              <p style={{ margin: 0 }}><strong>Transfer ke salah satu tujuan berikut:</strong></p>
              {manual.accounts.map(acc => (
                <p key={acc.accountNumber} className="muted" style={{ margin: '0.25rem 0' }}>
                  {acc.method} — {acc.bank}: <strong>{acc.accountNumber}</strong> a.n. {acc.accountName}
                </p>
              ))}
              <p style={{ margin: '0.5rem 0' }}>
                Nominal: <strong>Rp {manual.amount.toLocaleString('id-ID')}</strong> — kode referensi: <strong>{manual.merchantOrderId}</strong>
              </p>
              <p className="muted" style={{ margin: 0 }}>{manual.instructions}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';

// Kontak resmi customer support Kasirku.
// Ubah di satu tempat ini saja bila nomor/email berganti.
export const SUPPORT_PHONE_DISPLAY = '0895-3285-56866';
export const SUPPORT_WA_NUMBER = '62895328556866'; // format internasional untuk wa.me, tanpa "+"
export const SUPPORT_EMAIL = 'projectpos09@gmail.com';

export function SupportFloatingButton() {
  const [open, setOpen] = useState(false);
  const waHref = `https://wa.me/${SUPPORT_WA_NUMBER}?text=${encodeURIComponent('Halo Customer Support Kasirku, saya butuh bantuan.')}`;
  const mailHref = `mailto:${SUPPORT_EMAIL}`;

  return (
    <div className="support-float">
      {open && (
        <div className="support-float-panel" role="dialog" aria-label="Bantuan Customer Support">
          <div className="support-float-head">
            <strong>Butuh bantuan?</strong>
            <button type="button" aria-label="Tutup" onClick={() => setOpen(false)}>×</button>
          </div>
          <p className="muted" style={{ margin: '2px 0 10px' }}>
            Tim kami siap membantu masalah toko, transaksi, atau akun Anda.
          </p>
          <a className="support-float-item" href={waHref} target="_blank" rel="noopener noreferrer">
            <span className="support-float-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12.04 2c-5.5 0-9.96 4.46-9.96 9.96 0 1.76.47 3.45 1.35 4.93L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.5 0 9.96-4.46 9.96-9.96S17.54 2 12.04 2Zm5.86 14.06c-.25.7-1.45 1.34-2 1.43-.51.08-1.16.11-1.87-.12-.43-.14-.98-.32-1.68-.63-2.96-1.28-4.89-4.25-5.03-4.44-.15-.19-1.2-1.59-1.2-3.03 0-1.44.75-2.15 1.02-2.44.27-.29.58-.36.78-.36.2 0 .39.001.56.01.18.01.42-.07.66.5.25.6.83 2.03.9 2.18.07.15.12.32.02.51-.1.19-.15.31-.29.48-.15.17-.31.38-.44.51-.15.15-.3.31-.13.6.17.29.75 1.24 1.62 2.01 1.12.99 2.05 1.3 2.35 1.44.3.15.47.13.65-.05.18-.19.75-.86.95-1.16.2-.29.4-.24.68-.14.28.1 1.78.84 2.08.99.3.15.5.22.57.35.07.13.07.72-.18 1.41Z" /></svg>
            </span>
            <span>
              <strong>WhatsApp</strong>
              <span className="support-float-sub">{SUPPORT_PHONE_DISPLAY}</span>
            </span>
          </a>
          <a className="support-float-item" href={mailHref}>
            <span className="support-float-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>
            </span>
            <span>
              <strong>Email</strong>
              <span className="support-float-sub">{SUPPORT_EMAIL}</span>
            </span>
          </a>
          <a className="support-float-item" href="/bantuan">
            <span className="support-float-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 2.5-3 4" /><line x1="12" y1="17" x2="12" y2="17.01" /></svg>
            </span>
            <span>
              <strong>Halaman Bantuan</strong>
              <span className="support-float-sub">FAQ & panduan lengkap</span>
            </span>
          </a>
        </div>
      )}
      <button
        type="button"
        className="support-float-trigger"
        onClick={() => setOpen(v => !v)}
        aria-label={open ? 'Tutup bantuan' : 'Buka bantuan customer support'}
        aria-expanded={open}
      >
        {open ? (
          <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="2" fill="none"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="2" fill="none"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" /></svg>
        )}
      </button>
    </div>
  );
}

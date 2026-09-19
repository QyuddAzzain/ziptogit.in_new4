'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

const BARE_LAYOUT_PATHS = ['/login', '/daftar', '/reset-password', '/bantuan', '/privasi'];

const mainItems = [
  ['/dashboard', 'Dashboard', '⌂'],
  ['/kasir', 'Kasir', '▣'],
  ['/produk', 'Produk', '□'],
] as const;

const moreItems = [
  ['/stok', 'Stok', '◫'],
  ['/transaksi', 'Transaksi', '↔'],
  ['/laporan', 'Laporan', '▤'],
  ['/pelanggan', 'Pelanggan', '♙'],
  ['/karyawan', 'Karyawan', '♙'],
  ['/pengaturan', 'Pengaturan', '⚙'],
] as const;

export function Footer() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  if (BARE_LAYOUT_PATHS.includes(pathname) || pathname.startsWith('/login/')) return null;

  return (
    <>
      <footer className="app-footer">
        <div className="footer-brand">
          <div className="footer-title">Point of Sale UMKM</div>
          <div className="footer-copy">© 2026 Point of Sale UMKM • Semua hak dilindungi.</div>
        </div>
        <div className="footer-right">
          <Link href="/privasi">Privasi</Link>
          <Link href="/bantuan">Bantuan</Link>
          <span className="footer-version">V7</span>
        </div>
      </footer>

      <nav className="mobile-bottom-nav" aria-label="Navigasi utama">
        {mainItems.map(([href, label, icon]) => (
          <Link key={href} href={href} className={pathname === href || pathname.startsWith(`${href}/`) ? 'active' : ''}>
            <span aria-hidden="true">{icon}</span>
            <small>{label}</small>
          </Link>
        ))}
        <button type="button" className={moreOpen ? 'active' : ''} onClick={() => setMoreOpen(v => !v)} aria-expanded={moreOpen}>
          <span aria-hidden="true">⋯</span>
          <small>Lainnya</small>
        </button>
      </nav>

      {moreOpen && (
        <>
          <button className="mobile-more-backdrop" type="button" aria-label="Tutup menu" onClick={() => setMoreOpen(false)} />
          <div className="mobile-more-menu">
            <div className="mobile-more-head"><strong>Menu</strong><button type="button" onClick={() => setMoreOpen(false)} aria-label="Tutup">×</button></div>
            <div className="mobile-more-grid">
              {moreItems.map(([href, label, icon]) => (
                <Link key={href} href={href} onClick={() => setMoreOpen(false)} className={pathname === href || pathname.startsWith(`${href}/`) ? 'active' : ''}>
                  <span>{icon}</span><small>{label}</small>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/browser';

type ShopRow = { name: string | null; logo_url: string | null; address: string | null; phone: string | null };

// Halaman "telanjang" tanpa shell sidebar/topbar, sama seperti /login & /daftar.
const BARE_LAYOUT_PATHS = ['/login', '/daftar', '/reset-password', '/bantuan', '/privasi'];

export function TopBanner() {
  const pathname = usePathname();
  const supabase = useMemo(() => {
    try {
      return createClient();
    } catch {
      return null;
    }
  }, []);
  const [shop, setShop] = useState<ShopRow | null>(null);
  const [timeStr, setTimeStr] = useState<string>('');

  useEffect(() => {
    if (!supabase) return;
    supabase.from('shops').select('name,logo_url,address,phone').limit(1).then(({ data }: { data: ShopRow[] | null }) => {
      setShop(data?.[0] ?? null);
    });
  }, [supabase]);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const datePart = now.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
      const timePart = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setTimeStr(`${datePart} • ${timePart}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  if (pathname === '/' || BARE_LAYOUT_PATHS.includes(pathname) || pathname.startsWith('/login/')) return null;

  const name = shop?.name || 'Point of Sale UMKM';

  return (
    <header className="top-banner" role="banner">
      <div className="top-banner-content">
        {shop?.logo_url ? (
          <img className="top-banner-logo" src={shop.logo_url} alt={name} />
        ) : (
          <div className="top-banner-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </div>
        )}
        <div className="top-banner-details">
          <div className="top-banner-title-row">
            <strong>{name}</strong>
            <span className="top-banner-status-chip">
              <span className="status-dot"></span> Buka & Siap Layani
            </span>
          </div>
          <span className="top-banner-subtitle">
            {shop?.address || 'Lengkapi profil toko di Pengaturan'}
            {shop?.phone ? ` · ${shop.phone}` : ''}
          </span>
        </div>
      </div>

      <div className="top-banner-actions">
        {timeStr && (
          <div className="top-banner-clock" aria-label="Waktu sistem">
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none">
              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
            </svg>
            <span>{timeStr}</span>
          </div>
        )}
        <Link className="top-banner-link" href="/pengaturan">
          {shop?.address ? 'Pengaturan Toko' : 'Lengkapi Profil →'}
        </Link>
      </div>
    </header>
  );
}

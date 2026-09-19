'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogoutButton } from '@/components/auth/LogoutButton';
import { createClient } from '@/lib/supabase/browser';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

// Halaman "telanjang" tanpa shell sidebar/topbar, sama seperti /login & /daftar.
const BARE_LAYOUT_PATHS = ['/login', '/daftar', '/reset-password', '/bantuan', '/privasi'];

type ShopRow = { name: string | null; logo_url: string | null; address: string | null; phone: string | null };

type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  badge?: string;
};

const mainNavItems: readonly NavItem[] = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <rect width="7" height="9" x="3" y="3" rx="1" /><rect width="7" height="5" x="14" y="3" rx="1" /><rect width="7" height="9" x="14" y="12" rx="1" /><rect width="7" height="5" x="3" y="16" rx="1" />
      </svg>
    ),
  },
  {
    href: '/kasir',
    label: 'Kasir (POS)',
    badge: 'Cepat',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="8" cy="21" r="1" /><circle cx="19" cy="21" r="1" />
        <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
      </svg>
    ),
  },
  {
    href: '/produk',
    label: 'Produk',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="m7.5 4.27 9 5.15" /><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" />
      </svg>
    ),
  },
  {
    href: '/stok',
    label: 'Stok',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.9a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" /><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" /><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" />
      </svg>
    ),
  },
  {
    href: '/transaksi',
    label: 'Transaksi',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" /><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" /><path d="M12 6v12" />
      </svg>
    ),
  },
  {
    href: '/laporan',
    label: 'Laporan',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" />
      </svg>
    ),
  },
];

const secondaryNavItems: readonly NavItem[] = [
  {
    href: '/pelanggan',
    label: 'Pelanggan',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    href: '/karyawan',
    label: 'Karyawan',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><polyline points="16 11 18 13 22 9" />
      </svg>
    ),
  },
  {
    href: '/pengaturan',
    label: 'Pengaturan',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
  {
    href: '/bantuan',
    label: 'Bantuan',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 2.5-3 4" /><line x1="12" y1="17" x2="12" y2="17.01" />
      </svg>
    ),
  },
];

const COLLAPSE_KEY = 'pos-umkm:sidebar-collapsed';

function ShopMark({ logo, name }: { logo: string | null; name: string }) {
  if (logo) {
    return <img className="brand-logo" src={logo} alt={name} />;
  }
  return <div className="brand-mark">{name.slice(0, 1).toUpperCase()}</div>;
}

export function Sidebar() {
  const pathname = usePathname();
  const supabase = useMemo(() => {
    try {
      return createClient();
    } catch {
      return null;
    }
  }, []);
  const [shop, setShop] = useState<ShopRow | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    document.body.classList.toggle('sidebar-menu-open', mobileOpen);
    return () => document.body.classList.remove('sidebar-menu-open');
  }, [mobileOpen]);

  // Sync collapsed state to document body so layout content dynamically and smoothly adjusts width
  useEffect(() => {
    try {
      const isCol = window.localStorage.getItem(COLLAPSE_KEY) === '1';
      setCollapsed(isCol);
      document.body.classList.toggle('sidebar-is-collapsed', isCol);
    } catch {
      /* localStorage tidak tersedia */
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed(prev => {
      const next = !prev;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        /* noop */
      }
      document.body.classList.toggle('sidebar-is-collapsed', next);
      return next;
    });
  }

  useEffect(() => {
    if (!supabase) return;
    supabase.from('shops').select('name,logo_url,address,phone').limit(1).then(({ data }: { data: ShopRow[] | null }) => {
      setShop(data?.[0] ?? null);
    });
  }, [supabase]);

  if (BARE_LAYOUT_PATHS.includes(pathname) || pathname.startsWith('/login/')) return null;

  const shopName = shop?.name || 'Point of Sale UMKM';

  return (
    <>
      <div className="mobile-header" aria-label="Bilah navigasi">
        <button className="mobile-menu" type="button" onClick={() => setMobileOpen(v => !v)} aria-label={mobileOpen ? "Tutup menu" : "Buka menu"} aria-expanded={mobileOpen}>
          {mobileOpen ? (
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          ) : (
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
          )}
        </button>
        <div className="mobile-header-brand">
          <ShopMark logo={shop?.logo_url ?? null} name={shopName} />
          <strong className="mobile-brand-name">{shopName}</strong>
        </div>
      </div>
      {mobileOpen && <div className="mobile-backdrop" onClick={() => setMobileOpen(false)} />}
      <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''} ${collapsed ? 'sidebar-collapsed' : ''}`} aria-label="Navigasi Utama">
        <div className="brand">
          <ShopMark logo={shop?.logo_url ?? null} name={shopName} />
          <div className="brand-text">
            <strong>{shopName}</strong>
            <span>{shop?.address || 'Sistem Kasir & Operasional'}</span>
          </div>
          <button
            type="button"
            className="sidebar-toggle"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'}
            title={collapsed ? 'Perluas bilah navigasi' : 'Ciutkan bilah navigasi'}
          >
            {collapsed ? (
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none"><polyline points="9 18 15 12 9 6"/></svg>
            ) : (
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none"><polyline points="15 18 9 12 15 6"/></svg>
            )}
          </button>
        </div>

        <div className="nav-section-label">Menu Utama</div>
        <nav className="nav">
          {mainNavItems.map(({ href, label, icon, badge }) => {
            const isActive = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                className={isActive ? 'active' : ''}
                onClick={() => setMobileOpen(false)}
                key={href}
                href={href}
                title={collapsed ? label : undefined}
              >
                <span className="nav-icon">{icon}</span>
                <span className="nav-text">{label}</span>
                {badge && !collapsed && <span className="nav-pill-badge">{badge}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="nav-section-label nav-section-secondary">Manajemen & Relasi</div>
        <nav className="nav nav-secondary">
          {secondaryNavItems.map(({ href, label, icon }) => {
            const isActive = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                className={isActive ? 'active' : ''}
                onClick={() => setMobileOpen(false)}
                key={href}
                href={href}
                title={collapsed ? label : undefined}
              >
                <span className="nav-icon">{icon}</span>
                <span className="nav-text">{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user-card">
            <div className="user-avatar">
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>
            </div>
            <div className="user-info">
              <strong className="user-name">Kasir Toko</strong>
              <span className="user-role">Online · Siap Melayani</span>
            </div>
          </div>
          <LogoutButton />
        </div>
      </aside>
    </>
  );
}

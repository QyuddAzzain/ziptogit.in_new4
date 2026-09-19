import type { Metadata } from 'next';
import './globals.css';
import { Sidebar } from '@/components/layout/Sidebar';
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister';
import { TopBanner } from '@/components/layout/TopBanner';
import { Footer } from '@/components/layout/Footer';
import { PWAInstallPrompt } from '@/components/PWAInstallPrompt';
import { SupportFloatingButton } from '@/components/support/SupportFloatingButton';

export const metadata: Metadata = {
  title: 'Point of Sale UMKM',
  description: 'Point of Sale UMKM ringan, rapi, dan siap dipakai toko kecil sampai menengah.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>
        <ServiceWorkerRegister />
        <div className="app-shell">
          <Sidebar />
          <main className="main sidebar-inset">
            <TopBanner />
            <div className="main-content">{children}</div>
            <Footer />
            <PWAInstallPrompt />
          </main>
        </div>
        {/* Tombol melayang bantuan customer support — tampil di SEMUA halaman,
            termasuk sebelum login (/login, /daftar), sesuai permintaan owner. */}
        <SupportFloatingButton />
      </body>
    </html>
  );
}

import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Kasirku — POS UMKM',
    short_name: 'Kasirku',
    description: 'Kasirku adalah aplikasi kasir dan operasional toko yang ringan dan siap dipakai UMKM.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    background_color: '#f4f7fb',
    theme_color: '#111827',
    orientation: 'portrait-primary',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}

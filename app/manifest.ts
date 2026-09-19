import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Point of Sale UMKM',
    short_name: 'POS UMKM',
    description: 'Point of Sale UMKM ringan, rapi, dan siap dipakai toko kecil sampai menengah.',
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

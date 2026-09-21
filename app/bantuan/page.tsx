import Link from 'next/link';
import { SUPPORT_EMAIL, SUPPORT_PHONE_DISPLAY, SUPPORT_WA_NUMBER } from '@/components/support/SupportFloatingButton';

const faqs: Array<{ q: string; a: string }> = [
  {
    q: 'Lupa password, bagaimana cara masuk lagi?',
    a: 'Buka halaman Masuk, klik "Lupa password?", masukkan email akun Anda. Tautan reset password akan dikirim ke email tersebut.',
  },
  {
    q: 'Transaksi di Kasir gagal tersimpan, uang pembeli sudah diterima. Apa yang harus dilakukan?',
    a: 'Jangan input transaksi baru dulu. Catat manual dulu (produk & nominal), lalu coba tombol "Proses Bayar" sekali lagi — keranjang tidak akan hilang saat transaksi gagal. Kalau tetap gagal, hubungi customer support di bawah ini dan sertakan waktu kejadian.',
  },
  {
    q: 'Stok produk tiba-tiba berubah, kenapa?',
    a: 'Setiap perubahan stok (penjualan, void, atau penyesuaian manual) tercatat di halaman Stok sebagai riwayat mutasi lengkap dengan alasan. Cek riwayatnya di menu Stok untuk melihat siapa/apa penyebab perubahan.',
  },
  {
    q: 'Bagaimana cara menambah karyawan/kasir baru?',
    a: 'Masuk sebagai owner, buka menu Karyawan → Tambah Karyawan, lalu masukkan email karyawan. Karyawan akan punya akses sesuai perannya (kasir/owner).',
  },
  {
    q: 'Apakah data toko saya bisa dilihat toko lain?',
    a: 'Tidak. Setiap toko terisolasi (multi-tenant) — data produk, transaksi, dan karyawan hanya bisa diakses oleh anggota toko itu sendiri.',
  },
];

export default function Bantuan() {
  const waHref = `https://wa.me/${SUPPORT_WA_NUMBER}?text=${encodeURIComponent('Halo Customer Support Kasirku, saya butuh bantuan.')}`;

  return (
    <section className="auth-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Bantuan</div>
          <h1>Pusat Bantuan & Customer Support</h1>
          <p className="muted">Ada masalah dengan toko, transaksi, atau akun Anda? Tim kami siap membantu.</p>
        </div>
      </div>

      <div className="card auth-card">
        <strong>Hubungi Kami Langsung</strong>
        <a className="btn" href={waHref} target="_blank" rel="noopener noreferrer" style={{ textAlign: 'center' }}>
          WhatsApp: {SUPPORT_PHONE_DISPLAY}
        </a>
        <a className="btn" href={`mailto:${SUPPORT_EMAIL}`} style={{ textAlign: 'center', background: 'transparent', color: 'var(--accent)', border: '1px solid var(--line)' }}>
          Email: {SUPPORT_EMAIL}
        </a>
      </div>

      <div className="card auth-card">
        <strong>Pertanyaan yang Sering Diajukan</strong>
        {faqs.map(item => (
          <div key={item.q} style={{ borderTop: '1px solid var(--line)', paddingTop: 10, marginTop: 4 }}>
            <p style={{ margin: '0 0 4px', fontWeight: 700 }}>{item.q}</p>
            <p className="muted" style={{ margin: 0 }}>{item.a}</p>
          </div>
        ))}
      </div>

      <p className="muted" style={{ margin: 0 }}>
        <Link href="/login">← Kembali ke halaman masuk</Link> · <Link href="/privasi">Kebijakan Privasi</Link>
      </p>
    </section>
  );
}

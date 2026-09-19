import Link from 'next/link';

export default function Privasi() {
  return (
    <section className="auth-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Privasi</div>
          <h1>Kebijakan Privasi</h1>
          <p className="muted">Terakhir diperbarui: September 2026.</p>
        </div>
      </div>

      <div className="card auth-card" style={{ alignItems: 'stretch', textAlign: 'left' }}>
        <p className="muted" style={{ margin: 0 }}>
          Halaman ini adalah draf kebijakan privasi standar untuk platform Point of Sale UMKM. Ini bukan
          nasihat hukum — sebaiknya ditinjau ulang sesuai kebutuhan bisnis dan regulasi yang berlaku
          sebelum dianggap final.
        </p>

        <h3>Data yang Kami Simpan</h3>
        <p className="muted" style={{ margin: 0 }}>
          Akun pemilik &amp; karyawan toko (email), profil toko (nama, alamat, logo), data produk &amp;
          stok, data transaksi penjualan, dan data pelanggan yang diinput oleh toko masing-masing.
        </p>

        <h3>Bagaimana Data Digunakan</h3>
        <p className="muted" style={{ margin: 0 }}>
          Data digunakan semata untuk menjalankan fungsi kasir, laporan, dan manajemen toko Anda. Setiap
          toko terisolasi satu sama lain (multi-tenant) — data satu toko tidak dapat diakses oleh toko
          lain di platform ini.
        </p>

        <h3>Siapa yang Dapat Mengakses</h3>
        <p className="muted" style={{ margin: 0 }}>
          Data toko dapat diakses oleh anggota toko (owner/kasir) sesuai perannya, dan oleh pengelola
          platform hanya untuk keperluan dukungan teknis atau kepatuhan hukum.
        </p>

        <h3>Keamanan</h3>
        <p className="muted" style={{ margin: 0 }}>
          Akses data dilindungi dengan autentikasi dan aturan akses tingkat baris (Row Level Security)
          di database, sehingga permintaan data selalu dibatasi sesuai keanggotaan toko.
        </p>

        <h3>Kontak</h3>
        <p className="muted" style={{ margin: 0 }}>
          Pertanyaan seputar privasi dapat disampaikan lewat halaman <Link href="/bantuan">Bantuan</Link>.
        </p>
      </div>

      <p className="muted" style={{ margin: 0 }}>
        <Link href="/login">← Kembali ke halaman masuk</Link>
      </p>
    </section>
  );
}

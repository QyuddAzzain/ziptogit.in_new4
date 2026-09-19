'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/browser';

export default function LupaPassword() {
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMessage('');
    setErrorMsg('');
    setBusy(true);
    try {
      const redirectTo = `${window.location.origin}/reset-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
      if (error) {
        setErrorMsg(error.message);
        return;
      }
      // Selalu tampilkan pesan sukses yang sama walau email tidak terdaftar,
      // supaya alamat email pelanggan/owner lain tidak bisa ditebak dari respons.
      setSent(true);
      setMessage('Kalau email tersebut terdaftar, tautan reset password sudah kami kirim. Silakan periksa kotak masuk (dan folder spam).');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="auth-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Lupa Password</div>
          <h1>Reset Password Akun</h1>
          <p className="muted">Masukkan email akun POS UMKM Anda, kami kirim tautan untuk membuat password baru.</p>
        </div>
      </div>
      <form className="card auth-card" onSubmit={submit}>
        <label>
          Email
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            disabled={sent}
          />
        </label>
        {errorMsg && <p role="alert" className="error-text">{errorMsg}</p>}
        {message && <p role="status" className="muted">{message}</p>}
        {!sent && (
          <button className="btn" disabled={busy}>{busy ? 'Mengirim…' : 'Kirim Tautan Reset'}</button>
        )}
        <p className="muted" style={{ margin: 0 }}>
          <Link href="/login">← Kembali ke halaman masuk</Link>
        </p>
      </form>
    </section>
  );
}

'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/browser';

export default function Login() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMessage('');
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setMessage(error.message);
      setBusy(false);
      return;
    }
    router.replace('/dashboard');
    router.refresh();
  }

  return (
    <section className="auth-page">
      <div className="page-head" data-aos="fade-down">
        <div>
          <div className="eyebrow">Masuk cepat</div>
          <h1>Kasirku</h1>
          <p className="muted">Masuk ke dashboard, kasir, dan stok dari satu tempat.</p>
        </div>
      </div>
      <form className="card auth-card" data-aos="fade-up" data-aos-delay="80" onSubmit={submit}>
        <label>Email<input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
        <label>Password<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></label>
        <p className="muted" style={{ margin: 0, textAlign: 'right' }}>
          <a href="/login/lupa-password">Lupa password?</a>
        </p>
        {message && <p role="alert" className="error-text">{message}</p>}
        <button className="btn" disabled={busy}>{busy ? 'Memeriksa…' : 'Masuk'}</button>
        <p className="muted" style={{margin:0}}>Belum punya akun? <a href="/daftar">Daftar</a></p>
      </form>
    </section>
  );
}

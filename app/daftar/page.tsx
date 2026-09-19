'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/browser';
import type { User } from '@supabase/supabase-js';

export default function Daftar() {
  const router = useRouter();
  const supabase = createClient();
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [shopName, setShopName] = useState('');
  const [businessType, setBusinessType] = useState('toko');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }: { data: { user: User | null } }) => {
      setHasSession(!!user);
      setChecking(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function completeOnboarding(userId: string) {
    const { error } = await supabase.rpc('onboard_shop', {
      p_user_id: userId,
      p_full_name: fullName.trim(),
      p_shop_name: shopName.trim(),
      p_business_type: businessType,
    });
    if (error) {
      setMessage(error.message === 'ALREADY_ONBOARDED' ? 'Akun ini sudah punya toko.' : error.message);
      setBusy(false);
      return;
    }
    router.replace('/dashboard');
    router.refresh();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMessage('');
    setBusy(true);

    if (hasSession) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setMessage('Sesi berakhir, silakan masuk kembali.');
        setBusy(false);
        return;
      }
      await completeOnboarding(user.id);
      return;
    }

    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    if (error) {
      setMessage(error.message);
      setBusy(false);
      return;
    }
    if (!data.session) {
      setAwaitingConfirmation(true);
      setBusy(false);
      return;
    }
    await completeOnboarding(data.user!.id);
  }

  if (checking) return null;

  if (awaitingConfirmation) {
    return (
      <section className="auth-page">
        <div className="page-head"><div><h1>Cek email Anda</h1><p className="muted">Konfirmasi diperlukan sebelum lanjut</p></div></div>
        <div className="card auth-card">
          <p>Kami mengirim tautan konfirmasi ke {email}. Setelah dikonfirmasi, masuk untuk melengkapi data toko.</p>
          <button className="btn" onClick={() => router.replace('/login')}>Ke halaman masuk</button>
        </div>
      </section>
    );
  }

  return (
    <section className="auth-page">
      <div className="page-head"><div><h1>Daftar</h1><p className="muted">{hasSession ? 'Lengkapi data toko Anda' : 'Buat akun Point of Sale UMKM'}</p></div></div>
      <form className="card auth-card" onSubmit={submit}>
        {!hasSession && (
          <>
            <label>Email<input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
            <label>Password<input type="password" autoComplete="new-password" minLength={6} value={password} onChange={e => setPassword(e.target.value)} required /></label>
          </>
        )}
        <label>Nama Lengkap<input type="text" value={fullName} onChange={e => setFullName(e.target.value)} required /></label>
        <label>Nama Toko<input type="text" value={shopName} onChange={e => setShopName(e.target.value)} required /></label>
        <label>Jenis Usaha
          <select value={businessType} onChange={e => setBusinessType(e.target.value)}>
            <option value="toko">Toko</option>
            <option value="warung">Warung</option>
            <option value="resto">Resto/Kafe</option>
            <option value="lainnya">Lainnya</option>
          </select>
        </label>
        {message && <p role="alert" className="error-text">{message}</p>}
        <button className="btn" disabled={busy}>{busy ? 'Memproses…' : 'Daftar'}</button>
        {!hasSession && <p className="muted" style={{margin:0}}>Sudah punya akun? <a href="/login">Masuk</a></p>}
      </form>
    </section>
  );
}

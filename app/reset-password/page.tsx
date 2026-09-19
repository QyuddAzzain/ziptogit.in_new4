'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/browser';
import type { Session } from '@supabase/supabase-js';

export default function ResetPassword() {
  const router = useRouter();
  const supabase = createClient();
  const [checking, setChecking] = useState(true);
  const [validSession, setValidSession] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => {
      setValidSession(Boolean(data.session));
      setChecking(false);
    });
  }, [supabase]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErrorMsg('');
    if (password.length < 8) {
      setErrorMsg('Password minimal 8 karakter.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Konfirmasi password tidak sama.');
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setErrorMsg(error.message);
        return;
      }
      setDone(true);
      await supabase.auth.signOut();
      setTimeout(() => router.replace('/login'), 2000);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="auth-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Reset Password</div>
          <h1>Buat Password Baru</h1>
          <p className="muted">Tautan reset yang dikirim ke email Anda berlaku sekali pakai dan punya waktu terbatas.</p>
        </div>
      </div>
      <div className="card auth-card">
        {checking ? (
          <p className="muted">Memeriksa tautan reset…</p>
        ) : !validSession ? (
          <>
            <p role="alert" className="error-text">
              Tautan reset password tidak valid atau sudah kedaluwarsa.
            </p>
            <p className="muted" style={{ margin: 0 }}>
              <a href="/login/lupa-password">Minta tautan reset baru →</a>
            </p>
          </>
        ) : done ? (
          <p role="status" className="muted">Password berhasil diganti. Mengalihkan ke halaman masuk…</p>
        ) : (
          <form onSubmit={submit} style={{ display: 'contents' }}>
            <label>
              Password baru
              <input type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} />
            </label>
            <label>
              Ulangi password baru
              <input type="password" autoComplete="new-password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required minLength={8} />
            </label>
            {errorMsg && <p role="alert" className="error-text">{errorMsg}</p>}
            <button className="btn" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan Password Baru'}</button>
          </form>
        )}
      </div>
    </section>
  );
}

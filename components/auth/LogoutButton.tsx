'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/browser';

// Draft keranjang kasir disimpan di localStorage (lihat app/kasir/page.tsx). Hapus semuanya saat
// logout supaya akun lain di perangkat yang sama tidak mewarisi keranjang.
function clearCartDrafts(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith('pos-kasir-draft-')) keys.push(key);
    }
    keys.forEach(key => window.localStorage.removeItem(key));
  } catch {
    // localStorage tidak tersedia: tidak ada yang perlu dihapus.
  }
}

export function LogoutButton() {
  const router = useRouter();
  return <button className="btn sidebar-logout" onClick={async () => { clearCartDrafts(); await createClient().auth.signOut(); router.replace('/login'); router.refresh(); }}>Keluar</button>;
}

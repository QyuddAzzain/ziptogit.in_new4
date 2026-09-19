'use client';

import { useEffect, useState } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export function PWAInstallPrompt() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setEvent(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!visible || !event) return null;

  const installEvent = event;

  async function install() {
    await installEvent.prompt();
    await installEvent.userChoice;
    setEvent(null);
    setVisible(false);
  }

  return (
    <div className="pwa-prompt" role="status">
      <div>
        <strong>Pasang Point of Sale UMKM</strong>
        <span>Akses lebih cepat seperti aplikasi.</span>
      </div>
      <div className="row-actions">
        <button className="btn btn-sm" type="button" onClick={install}>Pasang</button>
        <button className="btn btn-ghost btn-sm" type="button" onClick={() => setVisible(false)}>Nanti</button>
      </div>
    </div>
  );
}

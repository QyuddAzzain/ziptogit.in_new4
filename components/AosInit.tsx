'use client';

import { useEffect } from 'react';

export function AosInit() {
  useEffect(() => {
    let cancelled = false;

    void import('@/lib/animations/aos')
      .then((mod) => {
        if (cancelled) return;
        const AOS = mod.default;
        AOS.init({
          offset: 80,
          duration: 520,
          easing: 'ease-out-cubic',
          once: true,
          disable: () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        });
      })
      .catch(() => {
        // AOS is cosmetic. If the optional animation bundle fails,
        // the underlying POS content remains fully usable.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}

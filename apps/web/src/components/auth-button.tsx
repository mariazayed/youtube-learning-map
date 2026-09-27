'use client';

import { LogIn, LogOut } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useAuth } from './auth-provider';

export function AuthButton() {
  const t = useTranslations('Auth');
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  if (!auth.configured) return null;

  if (auth.authenticated) {
    return (
      <button
        className="ghostButton"
        type="button"
        onClick={() => {
          auth.signOut();
          window.location.reload();
        }}
      >
        <LogOut size={17} aria-hidden="true" /> {t('signOut')}
      </button>
    );
  }
  return (
    <button
      className="ghostButton"
      type="button"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void auth.signIn().catch(() => setBusy(false));
      }}
    >
      <LogIn size={17} aria-hidden="true" /> {busy ? t('redirecting') : t('signIn')}
    </button>
  );
}

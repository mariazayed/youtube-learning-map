'use client';

import { LoaderCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { completeSignIn } from '@/lib/auth/oidc-client';

export function AuthCallback() {
  const t = useTranslations('Auth');
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void completeSignIn(window.location.href)
      .then((returnTo) => router.replace(returnTo))
      .catch(() => setError(t('callbackError')));
  }, [router, t]);

  return (
    <main className="authCallback" aria-live="polite">
      {error ? (
        <p className="errorMessage" role="alert">
          {error}
        </p>
      ) : (
        <>
          <LoaderCircle className="spin" aria-hidden="true" /> <p>{t('completing')}</p>
        </>
      )}
    </main>
  );
}

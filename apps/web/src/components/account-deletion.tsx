'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { FormEvent, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from './auth-provider';

export function AccountDeletion() {
  const locale = useLocale();
  const t = useTranslations('AccountDeletion');
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [confirmation, setConfirmation] = useState('');
  const mutation = useMutation({
    mutationFn: api.deleteAccount,
    onSuccess: () => {
      queryClient.clear();
      auth.signOut();
      window.location.assign(`/${locale}`);
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (confirmation !== 'DELETE') return;
    mutation.mutate({ confirmation: 'DELETE' });
  }

  const signedOut = auth.configured && !auth.authenticated;
  return (
    <section className="settingsCard dangerCard" aria-labelledby="delete-account-title">
      <h2 id="delete-account-title">{t('title')}</h2>
      <p>{t('description')}</p>
      <p className="supportedNotice">{t('identityNotice')}</p>
      {signedOut ? (
        <p>{t('signInRequired')}</p>
      ) : (
        <form onSubmit={submit}>
          <label htmlFor="account-deletion-confirmation">{t('confirmationLabel')}</label>
          <input
            id="account-deletion-confirmation"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="off"
            maxLength={6}
            placeholder="DELETE"
          />
          <button
            className="dangerButton"
            type="submit"
            disabled={confirmation !== 'DELETE' || mutation.isPending}
          >
            <Trash2 size={18} aria-hidden="true" /> {t('delete')}
          </button>
          {mutation.isError && (
            <p className="errorMessage" role="alert">
              {t('error')}
            </p>
          )}
        </form>
      )}
    </section>
  );
}

import { BrainCircuit } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { LanguageToggle } from '@/components/language-toggle';
import { AuthButton } from '@/components/auth-button';
import { AccountDeletion } from '@/components/account-deletion';
import { SettingsForm } from '@/components/settings-form';
import { Link } from '@/i18n/navigation';

export default async function SettingsPage() {
  const t = await getTranslations('SettingsPage');
  return (
    <main className="shell narrowShell">
      <header className="topbar">
        <Link className="brand" href="/">
          <span className="brandMark">
            <BrainCircuit size={22} />
          </span>
          <span>LearnMap</span>
        </Link>
        <div className="headerActions">
          <AuthButton />
          <LanguageToggle />
        </div>
      </header>
      <section className="pageIntro">
        <span className="eyebrow">{t('eyebrow')}</span>
        <h1>{t('title')}</h1>
        <p>{t('description')}</p>
      </section>
      <SettingsForm />
      <AccountDeletion />
    </main>
  );
}

import { BrainCircuit, Settings } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { HistoryList } from '@/components/history-list';
import { AuthButton } from '@/components/auth-button';
import { LanguageToggle } from '@/components/language-toggle';
import { Link } from '@/i18n/navigation';

export default async function AnalysesPage() {
  const t = await getTranslations('AnalysesPage');
  const common = await getTranslations('Common');
  return (
    <main className="shell">
      <header className="topbar">
        <Link className="brand" href="/">
          <span className="brandMark">
            <BrainCircuit size={22} />
          </span>
          <span>LearnMap</span>
        </Link>
        <div className="headerActions">
          <Link className="ghostButton" href="/settings">
            <Settings size={17} /> {common('settings')}
          </Link>
          <AuthButton />
          <LanguageToggle />
        </div>
      </header>
      <section className="pageIntro">
        <span className="eyebrow">{t('eyebrow')}</span>
        <h1>{t('title')}</h1>
        <p>{t('description')}</p>
      </section>
      <HistoryList />
    </main>
  );
}

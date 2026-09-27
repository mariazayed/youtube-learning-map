import { BookOpenCheck, BrainCircuit, History } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { AnalysisForm } from '@/components/analysis-form';
import { AuthButton } from '@/components/auth-button';
import { HistoryList } from '@/components/history-list';
import { LanguageToggle } from '@/components/language-toggle';
import { Link } from '@/i18n/navigation';

export default async function HomePage() {
  const t = await getTranslations('Home');
  const common = await getTranslations('Common');
  return (
    <main className="shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label={common('homeLabel')}>
          <span className="brandMark">
            <BrainCircuit size={22} />
          </span>
          <span>LearnMap</span>
        </Link>
        <nav className="headerActions" aria-label={common('primaryNavigation')}>
          <Link className="ghostButton" href="/analyses">
            <History size={17} /> {common('analyses')}
          </Link>
          <AuthButton />
          <LanguageToggle />
        </nav>
      </header>

      <section className="workspaceIntro">
        <div className="eyebrow">
          <BookOpenCheck size={16} /> {t('eyebrow')}
        </div>
        <h1>{t('title')}</h1>
        <p>{t('description')}</p>
      </section>

      <AnalysisForm />
      <HistoryList limit={3} showViewAll />
      <footer className="footer">{t('footer')}</footer>
    </main>
  );
}

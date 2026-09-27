import type { Metadata } from 'next';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import '@xyflow/react/dist/style.css';
import '../globals.css';
import { AppProviders } from '@/components/app-providers';
import { messages } from '@/i18n/messages';
import { routing } from '@/i18n/routing';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  return { title: t('title'), description: t('description') };
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  // Wait for a request so Next.js can apply the middleware's fresh CSP nonce.
  await connection();
  await headers();
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  return (
    <html lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages[locale]}>
          <AppProviders>{children}</AppProviders>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

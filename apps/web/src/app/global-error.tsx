'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en" dir="ltr">
      <body>
        <main className="pageShell">
          <h1>Something went wrong</h1>
          <p>The error was reported. Please reload the page and try again.</p>
        </main>
      </body>
    </html>
  );
}

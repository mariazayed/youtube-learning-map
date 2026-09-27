'use client';

import { ExternalLink, LoaderCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

type YoutubePlayerInstance = {
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  playVideo: () => void;
  destroy: () => void;
};

type YoutubeNamespace = {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      host?: string;
      playerVars?: Record<string, number>;
      events?: { onReady?: () => void; onError?: () => void };
    },
  ) => YoutubePlayerInstance;
};

declare global {
  interface Window {
    YT?: YoutubeNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youtubeApiPromise: Promise<YoutubeNamespace> | null = null;

function loadYoutubeApi(): Promise<YoutubeNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeApiPromise) return youtubeApiPromise;
  youtubeApiPromise = new Promise((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error('YouTube player API did not initialize.'));
    };

    const existing = document.getElementById('youtube-iframe-api');
    if (existing) return;
    const script = document.createElement('script');
    script.id = 'youtube-iframe-api';
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => reject(new Error('YouTube player API could not be loaded.'));
    document.head.append(script);
  });
  return youtubeApiPromise;
}

export function timestampUrl(videoId: string, seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&t=${safeSeconds}s`;
}

export type SeekRequest = { seconds: number; token: number };

export function YoutubePlayer({
  videoId,
  title,
  seekRequest,
}: {
  videoId: string;
  title: string;
  seekRequest: SeekRequest | null;
}) {
  const t = useTranslations('Player');
  const container = useRef<HTMLDivElement>(null);
  const player = useRef<YoutubePlayerInstance | null>(null);
  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let active = true;
    const element = container.current;
    if (!element) return;
    setReady(false);
    setUnavailable(false);
    void loadYoutubeApi()
      .then((YT) => {
        if (!active) return;
        player.current = new YT.Player(element, {
          videoId,
          host: 'https://www.youtube-nocookie.com',
          playerVars: { rel: 0, playsinline: 1 },
          events: {
            onReady: () => active && setReady(true),
            onError: () => active && setUnavailable(true),
          },
        });
      })
      .catch(() => active && setUnavailable(true));
    return () => {
      active = false;
      player.current?.destroy();
      player.current = null;
    };
  }, [videoId]);

  useEffect(() => {
    if (!ready || !seekRequest || !player.current) return;
    player.current.seekTo(seekRequest.seconds, true);
    player.current.playVideo();
  }, [ready, seekRequest]);

  const fallbackSeconds = seekRequest?.seconds ?? 0;
  return (
    <div className="videoFrame" aria-label={title}>
      <div className="playerMount" dir="ltr" ref={container} />
      {!ready && !unavailable && (
        <div className="playerOverlay" role="status">
          <LoaderCircle className="spin" size={24} />
          {t('loading')}
        </div>
      )}
      {unavailable && (
        <div className="playerOverlay playerUnavailable">
          <p>{t('unavailable')}</p>
          <a
            className="primaryButton"
            href={timestampUrl(videoId, fallbackSeconds)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink size={17} />
            {t('openYoutube')}
          </a>
        </div>
      )}
    </div>
  );
}

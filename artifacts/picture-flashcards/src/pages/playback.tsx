import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { ArrowRight, Library, Pause, Play, RotateCcw, SkipForward } from 'lucide-react';
import {
  getGetRandomCardQueryKey,
  useGetRandomCard,
  useListCards,
} from '@workspace/api-client-react';
import type { Card } from '@workspace/api-client-react';
import { BrandMark } from '@/components/brand-mark';
import { FittedSingleLineTitle } from '@/components/fitted-single-line-title';
import { formatCardText, isCardTextCase, type CardTextCase } from '@/lib/card-text';

function shuffleCards(cards: Card[]) {
  const shuffled = [...cards];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function categoryKey(category: string | null | undefined) {
  return category?.trim().toLocaleLowerCase() ?? '';
}

const UNCATEGORISED_CATEGORY_KEY = '__uncategorised__';
const PLAYBACK_REMINDER_DELAY = 1400;

function selectedCategoryKey(category: string | null | undefined) {
  return categoryKey(category) || UNCATEGORISED_CATEGORY_KEY;
}

export default function Playback() {
  const [location, navigate] = useLocation();
  const [playing, setPlaying] = useState(false);
  const [playbackOrder, setPlaybackOrder] = useState<Card[]>([]);
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const [loadedPlaybackCardId, setLoadedPlaybackCardId] = useState<string | null>(null);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const lastTapRef = useRef(0);
  const cardsQuery = useListCards();
  const randomQuery = useGetRandomCard(undefined, {
    query: {
      queryKey: getGetRandomCardQueryKey(undefined),
      enabled: !cardsQuery.isLoading && (cardsQuery.data?.length ?? 0) > 0,
      refetchOnWindowFocus: false,
    },
  });
  const selectedCategoryKeys = useMemo(() => {
    const query = typeof window !== 'undefined'
      ? window.location.search
      : (location.includes('?') ? location.slice(location.indexOf('?') + 1) : '');
    const rawCategories = new URLSearchParams(query).get('categories') ?? '';
    if (!rawCategories.trim()) return [];
    return rawCategories
      .split(',')
      .map((value) => {
        try {
          return decodeURIComponent(value);
        } catch {
          return value;
        }
      })
      .map((category) => category === UNCATEGORISED_CATEGORY_KEY
        ? UNCATEGORISED_CATEGORY_KEY
        : categoryKey(category));
  }, [location]);
  const selectedTextCase = useMemo<CardTextCase>(() => {
    const query = typeof window !== 'undefined'
      ? window.location.search
      : (location.includes('?') ? location.slice(location.indexOf('?') + 1) : '');
    const value = new URLSearchParams(query).get('textCase');
    return isCardTextCase(value) ? value : 'upper';
  }, [location]);
  const card = randomQuery.data;
  const playbackCard = playbackOrder[playbackIndex];

  const nextCard = () => {
    setPlaying(false);
    void randomQuery.refetch();
  };

  const movePlayback = (direction: 1 | -1) => {
    if (playbackOrder.length < 1) return;
    setLoadedPlaybackCardId(null);
    setPlaybackIndex((currentIndex) => (
      (currentIndex + direction + playbackOrder.length) % playbackOrder.length
    ));
  };

  const startPlayback = () => {
    startPlaybackWithCards(cardsQuery.data ?? []);
  };

  const startPlaybackWithCards = (cardsInSet: Card[]) => {
    const order = shuffleCards(cardsInSet);
    if (order.length < 1) return;
    setPlaybackOrder(order);
    setPlaybackIndex(0);
    setLoadedPlaybackCardId(null);
    setPlaying(true);
  };

  useEffect(() => {
    if (
      !selectedCategoryKeys.length
      || cardsQuery.isLoading
      || playing
      || playbackOrder.length > 0
    ) return;
    const cardsInSet = (cardsQuery.data ?? []).filter((item) => (
      selectedCategoryKeys.includes(selectedCategoryKey(item.category))
    ));
    const reminderTimer = window.setTimeout(() => {
      startPlaybackWithCards(cardsInSet);
    }, PLAYBACK_REMINDER_DELAY);
    return () => window.clearTimeout(reminderTimer);
  }, [cardsQuery.data, cardsQuery.isLoading, playbackOrder.length, playing, selectedCategoryKeys]);

  const isLoading = cardsQuery.isLoading || randomQuery.isLoading;
  const hasCards = (cardsQuery.data?.length ?? 0) > 0;

  if (selectedCategoryKeys.length > 0 && !playing) {
    return (
      <main
        className="playback-focus fixed inset-0 z-50 grid min-h-[100dvh] place-items-center bg-[hsl(var(--background))] text-[hsl(var(--foreground))]"
        aria-label="Preparing picture playback"
      >
        <p className="px-6 text-center font-mono text-sm font-bold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]" data-testid="text-playback-stop-reminder">
          Double tap to stop playback
        </p>
      </main>
    );
  }

  if (playing && playbackCard) {
    return (
      <main
        className="playback-focus playback-education-font relative fixed inset-0 z-50 flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-[hsl(var(--background))] px-5 py-6 text-[hsl(var(--foreground))]"
        aria-label="Picture playback"
        onTouchStart={(event) => {
          if (event.touches.length !== 1) {
            touchStartRef.current = null;
            return;
          }
          const touch = event.touches[0];
          touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
        }}
        onTouchEnd={(event) => {
          const start = touchStartRef.current;
          touchStartRef.current = null;
          if (!start || event.changedTouches.length !== 1) return;

          const touch = event.changedTouches[0];
          const deltaX = touch.clientX - start.x;
          const deltaY = touch.clientY - start.y;
          const elapsed = Date.now() - start.time;
          const isSwipe = elapsed < 700 && Math.abs(deltaX) >= 48 && Math.abs(deltaX) > Math.abs(deltaY);

          if (isSwipe) {
            lastTapRef.current = 0;
            movePlayback(deltaX < 0 ? 1 : -1);
            return;
          }

          if (Math.abs(deltaX) < 18 && Math.abs(deltaY) < 18 && elapsed < 350) {
            const now = Date.now();
            if (now - lastTapRef.current < 350) {
              lastTapRef.current = 0;
              navigate('/');
            } else {
              lastTapRef.current = now;
            }
          } else {
            lastTapRef.current = 0;
          }
        }}
      >
        <div key={playbackCard.id} className="flex w-full max-w-5xl flex-col items-center justify-center gap-5">
          <img
            src={playbackCard.imageUrl}
            alt=""
            onLoad={() => setLoadedPlaybackCardId(playbackCard.id)}
            className="block max-h-[calc(100dvh-10rem)] w-auto max-w-[90vw] shrink-0 rounded-[1.25rem] object-contain shadow-[0_18px_50px_hsl(var(--foreground)/.12)]"
          />
          {loadedPlaybackCardId === playbackCard.id && (
            <FittedSingleLineTitle
              text={formatCardText(playbackCard.title, selectedTextCase)}
              level={1}
              maxFontSize={64}
              minFontSize={16}
              className="w-full max-w-[92vw] shrink-0 text-center font-bold leading-tight tracking-[-0.025em]"
            />
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="paper-grain min-h-[100dvh] overflow-hidden bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[1440px] flex-col px-5 py-5 sm:px-8 sm:py-7 lg:px-12">
        <header className="flex items-center justify-between">
          <BrandMark to="/practice" />
          <div className="flex items-center gap-3">
            <span className="hidden font-mono text-[0.6rem] font-bold uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))] sm:inline">a quiet moment to notice</span>
            <Link href="/admin" className="grid h-9 w-9 place-items-center rounded-full text-[hsl(var(--muted-foreground)/.5)] transition-colors hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]" aria-label="Adult access" title="Adult access" data-testid="link-adult-access">
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
            </Link>
          </div>
        </header>

        <section className="flex flex-1 flex-col justify-center py-10 sm:py-14 lg:py-16">
          <div className="mx-auto w-full max-w-[980px]">
            <div className="mb-7 sm:mb-9">
              <div className="animate-lift-in">
                <p className="mb-3 font-mono text-[0.63rem] font-bold uppercase tracking-[0.2em] text-[hsl(var(--primary))]">Look closely</p>
                <h1 className="playback-education-font max-w-xl text-4xl font-bold leading-[0.95] tracking-[-0.035em] sm:text-6xl lg:text-7xl">
                  What do you<br className="hidden sm:block" /> see?
                </h1>
              </div>
            </div>

            {isLoading ? (
              <div className="animate-pulse overflow-hidden rounded-[25px] border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
                <div className="aspect-[4/5] bg-[hsl(var(--muted))]" />
                <div className="flex items-center justify-between gap-4 p-5 sm:p-7">
                  <div className="h-8 w-44 rounded-lg bg-[hsl(var(--muted))]" />
                  <div className="h-10 w-28 rounded-full bg-[hsl(var(--muted))]" />
                </div>
              </div>
            ) : !hasCards ? (
              <div className="rounded-[25px] border border-[hsl(var(--border))] bg-[hsl(var(--card)/.7)] px-6 py-14 text-center sm:px-12">
                <span className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-[20px] bg-[hsl(var(--accent)/.22)] text-[hsl(var(--primary))]"><Library size={28} strokeWidth={1.5} /></span>
                <h2 className="font-serif text-3xl font-semibold tracking-[-0.04em]">Your picture shelf is waiting</h2>
                <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">An adult can add a few familiar pictures, then this space becomes a calm little guessing game.</p>
                <Link href="/admin" className="mt-7 inline-flex h-11 items-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-5 text-sm font-semibold text-[hsl(var(--primary-foreground))] shadow-[3px_3px_0_hsl(var(--foreground)/.14)] transition-transform hover:-translate-y-0.5" data-testid="link-empty-add-cards">
                  Add the first picture <ArrowRight size={16} />
                </Link>
              </div>
            ) : randomQuery.isError ? (
              <div className="rounded-[25px] border border-[hsl(var(--destructive)/.3)] bg-[hsl(var(--destructive)/.07)] px-6 py-14 text-center" role="alert" data-testid="status-playback-error">
                <h2 className="font-serif text-3xl font-semibold tracking-[-0.04em]">This card got away</h2>
                <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">We could not draw a picture from this set.</p>
                <button type="button" onClick={() => void randomQuery.refetch()} className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-5 text-sm font-semibold" data-testid="button-retry-playback"><RotateCcw size={16} /> Try again</button>
              </div>
            ) : card ? (
              <div className="animate-card-in overflow-hidden rounded-[25px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-[0_16px_45px_hsl(var(--foreground)/.08)]" key={card.id} data-testid={`card-playback-${card.id}`}>
                <div className="relative aspect-[4/5] overflow-hidden bg-[hsl(var(--muted))]">
                  <img src={card.imageUrl} alt={card.title} className="h-full w-full object-cover" data-testid={`img-playback-${card.id}`} />
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[hsl(var(--foreground)/.28)] to-transparent" />
                  {card.category && <span className="absolute left-4 top-4 rounded-full bg-[hsl(var(--card)/.9)] px-3 py-1.5 font-mono text-[0.6rem] font-bold uppercase tracking-[0.13em] text-[hsl(var(--primary))]">{card.category}</span>}
                </div>
                <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
                  <div>
                    <p className="mb-1 font-mono text-[0.6rem] font-bold uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">Picture card</p>
                    <FittedSingleLineTitle text={formatCardText(card.title, selectedTextCase)} level={2} maxFontSize={40} minFontSize={18} className="max-w-full font-serif font-semibold tracking-[-0.045em]" testId={`text-playback-title-${card.id}`} />
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => (playing ? setPlaying(false) : startPlayback())} className="inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-700" data-testid="button-toggle-playback">
                      {playing ? <Pause size={16} /> : <Play size={16} />}
                      {playing ? 'Pause' : 'Play'}
                    </button>
                    <button type="button" onClick={nextCard} disabled={randomQuery.isFetching} className="grid h-11 w-11 place-items-center rounded-xl border border-[hsl(var(--border))] text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--muted))] disabled:opacity-50" data-testid="button-next-card" aria-label="Next picture">
                      <SkipForward size={17} />
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <footer className="flex items-center justify-between gap-4 border-t border-[hsl(var(--border)/.65)] pt-4 text-[0.68rem] text-[hsl(var(--muted-foreground))]">
          <span>Made for noticing things together.</span>
          <span className="font-mono uppercase tracking-[0.16em]">one card at a time</span>
        </footer>
      </div>
    </main>
  );
}
import { useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Check, ChevronDown, CircleAlert, FolderOpen, LoaderCircle, Pencil, Plus, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetCardsSummaryQueryKey,
  getListCardsQueryKey,
  useDeleteCard,
  useGetCardsSummary,
  useHealthCheck,
  useListCards,
} from '@workspace/api-client-react';
import type { Card } from '@workspace/api-client-react';
import { BrandMark } from '@/components/brand-mark';
import { CardEditorDialog } from '@/components/card-editor-dialog';
import type { CardTextCase } from '@/lib/card-text';

function categoryKey(category: string | null | undefined) {
  return category?.trim().toLocaleLowerCase() ?? '';
}

export default function Admin() {
  const queryClient = useQueryClient();
  const [category, setCategory] = useState('all');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Card | null>(null);
  const [startOpen, setStartOpen] = useState(false);
  const [selectedStartCategories, setSelectedStartCategories] = useState<string[]>([]);
  const [startTextCase, setStartTextCase] = useState<CardTextCase>('upper');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(() => new Set());
  const [deleteError, setDeleteError] = useState('');
  const [, navigate] = useLocation();
  const allCardsQuery = useListCards();
  const cardsQuery = useListCards(category === 'all' ? undefined : { category });
  const summaryQuery = useGetCardsSummary();
  const healthQuery = useHealthCheck();
  const deleteCard = useDeleteCard();
  const cards = cardsQuery.data ?? [];
  const categories = useMemo(
    () => {
      const labels = new Map<string, string>();
      for (const card of allCardsQuery.data ?? []) {
        if (card.category?.trim()) {
          const label = card.category.trim();
          labels.set(categoryKey(label), labels.get(categoryKey(label)) ?? label);
        }
      }
      return Array.from(labels.values()).sort();
    },
    [allCardsQuery.data],
  );
  const groupedCards = useMemo(() => {
    const groups = new Map<string, { label: string; cards: Card[] }>();
    for (const card of cards) {
      const key = categoryKey(card.category) || 'uncategorized';
      const group = groups.get(key) ?? {
        label: card.category?.trim() || 'Uncategorized',
        cards: [],
      };
      group.cards.push(card);
      groups.set(key, group);
    }
    return Array.from(groups.values())
      .sort((left, right) => {
        if (left.label === 'Uncategorized') return 1;
        if (right.label === 'Uncategorized') return -1;
        return left.label.localeCompare(right.label);
      })
      .map((group) => [group.label, group.cards] as const);
  }, [cards]);

  const openCreate = () => {
    setEditingCard(null);
    setEditorOpen(true);
  };

  const openStart = () => {
    setSelectedStartCategories([]);
    setStartTextCase('upper');
    setStartOpen(true);
  };

  const toggleStartCategory = (value: string) => {
    const key = categoryKey(value);
    setSelectedStartCategories((current) => (
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key]
    ));
  };

  const toggleCategory = (value: string) => {
    setExpandedCategories((current) => {
      const next = new Set(current);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return next;
    });
  };

  const beginPractice = () => {
    if (!selectedStartCategories.length) return;
    navigate(`/practice?categories=${selectedStartCategories.map((item) => encodeURIComponent(item)).join(',')}&textCase=${encodeURIComponent(startTextCase)}`);
  };

  const openEdit = (card: Card) => {
    setEditingCard(card);
    setEditorOpen(true);
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setEditingCard(null);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    setDeleteError('');
    deleteCard.mutate(
      { id: deleteTarget.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCardsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetCardsSummaryQueryKey() });
          setDeleteTarget(null);
        },
        onError: () => setDeleteError('The card could not be removed. Try again.'),
      },
    );
  };

  const isLoading = cardsQuery.isLoading || allCardsQuery.isLoading || summaryQuery.isLoading;

  return (
    <main className="paper-grain min-h-[100dvh] bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <div className="mx-auto min-h-[100dvh] w-full max-w-[1440px] px-5 py-5 sm:px-8 sm:py-7 lg:px-12">
        <header className="flex items-center justify-between">
          <BrandMark to="/admin" />
          <div className="flex items-center gap-4">
            <div className="hidden items-center gap-2 font-mono text-[0.59rem] font-bold uppercase tracking-[0.15em] text-[hsl(var(--muted-foreground))] sm:flex" data-testid="status-sync">
              <span className={`h-2 w-2 rounded-full ${healthQuery.isError ? 'bg-[hsl(var(--destructive))]' : 'bg-[hsl(var(--secondary))]'}`} />
              {healthQuery.isLoading ? 'Checking shelf' : healthQuery.isError ? 'Offline' : 'Shared shelf ready'}
            </div>
            <button type="button" onClick={openStart} className="rounded-full bg-emerald-600 px-4 py-2 font-mono text-[0.6rem] font-bold uppercase tracking-[0.13em] text-white transition-colors hover:bg-emerald-700" data-testid="button-start">
              Start
            </button>
          </div>
        </header>

        <section className="flex items-center justify-between gap-4 pb-6 pt-5 sm:pb-8 sm:pt-7">
          <button type="button" onClick={openCreate} className="inline-flex h-12 w-fit items-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-5 font-semibold text-[hsl(var(--primary-foreground))] shadow-[3px_3px_0_hsl(var(--foreground)/.16)] transition-transform hover:-translate-y-0.5 animate-lift-in" data-testid="button-add-card">
            <Plus size={18} /> Add picture
          </button>
          <label className="flex shrink-0 items-center gap-2">
            <span className="font-mono text-[0.6rem] font-bold uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">Show</span>
            <select value={category} onChange={(event) => setCategory(event.target.value)} className="h-10 min-w-32 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card)/.75)] px-3 text-sm font-medium" data-testid="select-admin-category">
              <option value="all">All pictures</option>
              {categories.map((item) => <option value={item} key={item}>{item}</option>)}
            </select>
          </label>
        </section>

        <section className="pb-12 pt-0">
          {cardsQuery.isError ? (
            <div className="rounded-[22px] border border-[hsl(var(--destructive)/.3)] bg-[hsl(var(--destructive)/.07)] px-6 py-12 text-center" role="alert" data-testid="status-catalogue-error">
              <CircleAlert className="mx-auto mb-3 text-[hsl(var(--destructive))]" size={24} />
              <h3 className="font-serif text-2xl font-semibold">The shelf is out of reach</h3>
              <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">Check your connection, then refresh the catalogue.</p>
              <button type="button" onClick={() => void cardsQuery.refetch()} className="mt-5 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-2 text-sm font-semibold" data-testid="button-retry-catalogue">Try again</button>
            </div>
          ) : isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((item) => <div key={item} className="animate-pulse overflow-hidden rounded-[20px] border border-[hsl(var(--border))] bg-[hsl(var(--card))]"><div className="aspect-[4/5] bg-[hsl(var(--muted))]" /><div className="space-y-3 p-4"><div className="h-5 w-2/3 rounded bg-[hsl(var(--muted))]" /><div className="h-3 w-1/3 rounded bg-[hsl(var(--muted))]" /></div></div>)}
            </div>
          ) : cards.length === 0 ? (
            <div className="rounded-[22px] border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card)/.45)] px-6 py-16 text-center">
              <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-[18px] bg-[hsl(var(--accent)/.2)] text-[hsl(var(--primary))]"><FolderOpen size={25} strokeWidth={1.5} /></span>
              <h3 className="font-serif text-2xl font-semibold">{category === 'all' ? 'Start with one familiar thing' : 'No pictures in this set yet'}</h3>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">{category === 'all' ? 'A fruit, a shoe, a favorite cup — small, recognizable things make great first cards.' : 'Try another category or add a new picture to this shelf.'}</p>
              <button type="button" onClick={openCreate} className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-5 text-sm font-semibold text-[hsl(var(--primary-foreground))]" data-testid="button-empty-add-card"><Plus size={16} /> Add picture</button>
            </div>
          ) : (
            <div className="space-y-10">
              {groupedCards.map(([group, groupCards]) => (
                <section key={group} aria-labelledby={`category-${group.replace(/\s+/g, '-').toLowerCase()}`}>
                  {(() => {
                    const groupKey = categoryKey(group) || 'uncategorized';
                    const isExpanded = expandedCategories.has(groupKey);
                    return (
                      <>
                        <button
                          type="button"
                          onClick={() => toggleCategory(groupKey)}
                          className="mb-4 flex w-full items-center gap-3 text-left"
                          aria-expanded={isExpanded}
                          aria-controls={`category-content-${group.replace(/\s+/g, '-').toLowerCase()}`}
                          data-testid={`button-toggle-category-${groupKey}`}
                        >
                          <h3 id={`category-${group.replace(/\s+/g, '-').toLowerCase()}`} className="font-serif text-2xl font-semibold tracking-[-0.04em]">{group}</h3>
                          <span className="rounded-full bg-[hsl(var(--muted))] px-2.5 py-1 font-mono text-[0.58rem] font-bold uppercase tracking-[0.12em] text-[hsl(var(--muted-foreground))]">{groupCards.length}</span>
                          <ChevronDown size={18} className={`ml-auto text-[hsl(var(--muted-foreground))] transition-transform ${isExpanded ? 'rotate-180' : ''}`} aria-hidden="true" />
                        </button>
                        {isExpanded && (
                          <div id={`category-content-${group.replace(/\s+/g, '-').toLowerCase()}`} className="mb-8 overflow-hidden rounded-[20px] border border-[hsl(var(--border))] bg-[hsl(var(--card)/.7)]">
                            {groupCards.map((card) => (
                              <article key={card.id} className="group flex items-center gap-3 border-b border-[hsl(var(--border)/.7)] p-3 last:border-b-0 sm:gap-4 sm:p-4" data-testid={`card-catalogue-${card.id}`}>
                                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-[hsl(var(--muted))] sm:h-20 sm:w-20">
                                  <img src={card.imageUrl} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]" data-testid={`img-catalogue-${card.id}`} />
                                </div>
                                <h3 className="min-w-0 flex-1 truncate font-serif text-xl font-semibold tracking-[-0.035em]" data-testid={`text-card-title-${card.id}`}>{card.title}</h3>
                                <div className="flex shrink-0 gap-1">
                                  <button type="button" onClick={() => openEdit(card)} className="grid h-9 w-9 place-items-center rounded-lg text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]" aria-label={`Edit ${card.title}`} data-testid={`button-edit-card-${card.id}`}><Pencil size={15} /></button>
                                  <button type="button" onClick={() => { setDeleteTarget(card); setDeleteError(''); }} className="grid h-9 w-9 place-items-center rounded-lg text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--destructive)/.1)] hover:text-[hsl(var(--destructive))]" aria-label={`Delete ${card.title}`} data-testid={`button-delete-card-${card.id}`}><Trash2 size={15} /></button>
                                </div>
                              </article>
                            ))}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </section>
              ))}
            </div>
          )}
        </section>

        <footer className="flex flex-col gap-2 border-t border-[hsl(var(--border)/.65)] py-5 text-[0.68rem] text-[hsl(var(--muted-foreground))] sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-2"><Check size={14} className="text-[hsl(var(--secondary))]" /> Changes are shared across this shelf.</span>
          <span className="font-mono uppercase tracking-[0.15em]">picture practice / catalogue</span>
        </footer>
      </div>

      {startOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[hsl(var(--foreground)/.38)] p-5 backdrop-blur-[3px]" role="presentation">
          <div className="animate-lift-in w-full max-w-md rounded-[24px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-[0_24px_80px_hsl(var(--foreground)/.22)] sm:p-8" role="dialog" aria-modal="true" aria-labelledby="start-title" data-testid="dialog-start-practice">
            <p className="font-mono text-[0.61rem] font-bold uppercase tracking-[0.18em] text-[hsl(var(--primary))]">Choose a practice set</p>
            <h2 id="start-title" className="mt-2 font-serif text-3xl font-semibold leading-tight tracking-[-0.045em]">What should we practise?</h2>
            <p className="mt-3 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">Choose one or more categories for this slideshow.</p>
            <div className="mt-6 max-h-[42dvh] space-y-2 overflow-y-auto">
              {categories.length > 0 ? categories.map((item) => {
                const key = categoryKey(item);
                const selected = selectedStartCategories.includes(key);
                return (
                  <label key={key} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-4 transition-colors ${selected ? 'border-[hsl(var(--primary))] bg-[hsl(var(--accent)/.14)]' : 'border-[hsl(var(--border))] hover:bg-[hsl(var(--muted)/.55)]'}`}>
                    <input type="checkbox" checked={selected} onChange={() => toggleStartCategory(item)} className="h-4 w-4 accent-[hsl(var(--primary))]" data-testid={`checkbox-start-category-${key}`} />
                    <span className="font-medium">{item}</span>
                  </label>
                );
              }) : (
                <p className="rounded-xl bg-[hsl(var(--muted)/.55)] p-4 text-sm text-[hsl(var(--muted-foreground))]">Add a card with a category before starting practice.</p>
              )}
            </div>
            <label className="mt-5 block">
              <span className="mb-2 block font-mono text-[0.61rem] font-bold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">Card text</span>
              <select value={startTextCase} onChange={(event) => setStartTextCase(event.target.value as CardTextCase)} className="h-11 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card)/.75)] px-3 text-sm font-medium text-[hsl(var(--foreground))]" data-testid="select-start-text-case">
                <option value="upper">Upper case</option>
                <option value="mixed">Mixed case</option>
                <option value="lower">Lower case</option>
              </select>
            </label>
            <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setStartOpen(false)} className="h-11 rounded-xl px-4 text-sm font-semibold text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]" data-testid="button-cancel-start">Cancel</button>
              <button type="button" onClick={beginPractice} disabled={!selectedStartCategories.length} className="h-11 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50" data-testid="button-confirm-start">Start</button>
            </div>
          </div>
        </div>
      )}

      <CardEditorDialog open={editorOpen} card={editingCard} onClose={closeEditor} onSaved={closeEditor} />

      {deleteTarget && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[hsl(var(--foreground)/.38)] p-5 backdrop-blur-[3px]" role="presentation">
          <div className="animate-lift-in w-full max-w-md rounded-[24px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-[0_24px_80px_hsl(var(--foreground)/.22)] sm:p-8" role="dialog" aria-modal="true" aria-labelledby="delete-title" data-testid="dialog-delete-card">
            <p className="font-mono text-[0.61rem] font-bold uppercase tracking-[0.18em] text-[hsl(var(--destructive))]">Remove picture</p>
            <h2 id="delete-title" className="mt-2 font-serif text-3xl font-semibold leading-tight tracking-[-0.045em]">Take “{deleteTarget.title}” off the shelf?</h2>
            <p className="mt-3 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">This cannot be undone. The picture will disappear from practice for everyone using this catalogue.</p>
            {deleteError && <p className="mt-4 text-sm text-[hsl(var(--destructive))]" role="alert" data-testid="status-delete-error">{deleteError}</p>}
            <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setDeleteTarget(null)} className="h-11 rounded-xl px-4 text-sm font-semibold text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]" data-testid="button-cancel-delete">Keep it</button>
              <button type="button" onClick={confirmDelete} disabled={deleteCard.isPending} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[hsl(var(--destructive))] px-5 text-sm font-semibold text-[hsl(var(--destructive-foreground))] disabled:opacity-70" data-testid="button-confirm-delete">
                {deleteCard.isPending && <LoaderCircle size={15} className="animate-spin" />} Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
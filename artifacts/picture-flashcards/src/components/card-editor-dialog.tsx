import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ImagePlus, LoaderCircle, X } from 'lucide-react';
import {
  getGetCardsSummaryQueryKey,
  getListCardsQueryKey,
  useCreateCard,
  useUpdateCard,
} from '@workspace/api-client-react';
import type { Card } from '@workspace/api-client-react';

type CardEditorDialogProps = {
  open: boolean;
  card: Card | null;
  onClose: () => void;
  onSaved: () => void;
};

export function CardEditorDialog({ open, card, onClose, onSaved }: CardEditorDialogProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [imageData, setImageData] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [error, setError] = useState('');
  const createCard = useCreateCard();
  const updateCard = useUpdateCard();
  const isEditing = Boolean(card);
  const isPending = createCard.isPending || updateCard.isPending;

  useEffect(() => {
    if (!open) return;
    setTitle(card?.title ?? '');
    setCategory(card?.category ?? '');
    setImageData('');
    setPreviewUrl(card?.imageUrl ?? '');
    setError('');
  }, [card, open]);

  if (!open) return null;

  const handleFile = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Choose an image file to continue.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError('That image is larger than 8 MB. Choose a smaller one.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      setImageData(result);
      setPreviewUrl(result);
      setError('');
    };
    reader.onerror = () => setError('The image could not be read. Try again.');
    reader.readAsDataURL(file);
  };

  const refreshCatalogue = () => {
    queryClient.invalidateQueries({ queryKey: getListCardsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetCardsSummaryQueryKey() });
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedTitle = title.trim();
    const trimmedCategory = category.trim();
    if (!trimmedTitle) {
      setError('Give this picture a name first.');
      return;
    }
    if (!isEditing && !imageData) {
      setError('Add a picture before saving this card.');
      return;
    }
    setError('');
    if (card) {
      updateCard.mutate(
        {
          id: card.id,
          data: {
            title: trimmedTitle,
            category: trimmedCategory || null,
            ...(imageData ? { imageData } : {}),
          },
        },
        {
          onSuccess: () => {
            refreshCatalogue();
            onSaved();
          },
          onError: () => setError('This card could not be updated. Please try again.'),
        },
      );
    } else {
      createCard.mutate(
        {
          data: {
            title: trimmedTitle,
            category: trimmedCategory || null,
            imageData,
          },
        },
        {
          onSuccess: () => {
            refreshCatalogue();
            onSaved();
          },
          onError: () => setError('This card could not be saved. Please try again.'),
        },
      );
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-[hsl(var(--foreground)/.38)] p-0 backdrop-blur-[3px] sm:items-center sm:p-6" role="presentation">
      <div
        className="animate-lift-in editor-scrollbar max-h-[94dvh] w-full overflow-y-auto rounded-t-[28px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-[0_24px_80px_hsl(var(--foreground)/.22)] sm:max-w-2xl sm:rounded-[28px]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="editor-title"
        data-testid="dialog-card-editor"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[hsl(var(--border))] px-5 py-5 sm:px-8 sm:py-7">
          <div>
            <p className="mb-1 font-mono text-[0.63rem] font-bold uppercase tracking-[0.2em] text-[hsl(var(--primary))]">
              {isEditing ? 'Refine a card' : 'Add to the shelf'}
            </p>
            <h2 id="editor-title" className="font-serif text-3xl font-semibold tracking-[-0.04em] text-[hsl(var(--foreground))]">
              {isEditing ? 'Edit picture card' : 'New picture card'}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]" data-testid="button-close-editor" aria-label="Close editor">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 px-5 py-6 sm:px-8 sm:py-8">
          <div>
            <label className="mb-2 block font-mono text-[0.66rem] font-bold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]" htmlFor="card-image">
              Picture
            </label>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="group relative block aspect-[16/8] w-full overflow-hidden rounded-[18px] border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--muted)/.65)] text-left transition-colors hover:border-[hsl(var(--primary))] hover:bg-[hsl(var(--accent)/.12)]"
              data-testid="button-upload-image"
            >
              {previewUrl ? (
                <>
                  <img src={previewUrl} alt="Selected card preview" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]" data-testid="img-card-preview" />
                  <span className="absolute bottom-3 right-3 rounded-full bg-[hsl(var(--foreground)/.78)] px-3 py-1.5 font-mono text-[0.6rem] font-bold uppercase tracking-[0.12em] text-[hsl(var(--card))]">
                    Replace image
                  </span>
                </>
              ) : (
                <span className="flex h-full flex-col items-center justify-center gap-2 text-center">
                  <ImagePlus size={26} strokeWidth={1.5} className="text-[hsl(var(--primary))]" />
                  <span className="font-medium text-[hsl(var(--foreground))]">Choose a clear, real picture</span>
                  <span className="text-xs text-[hsl(var(--muted-foreground))]">JPG, PNG, or WEBP · up to 8 MB</span>
                </span>
              )}
            </button>
            <input ref={fileInputRef} id="card-image" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => handleFile(event.target.files?.[0])} data-testid="input-image-upload" />
            <p className="mt-2 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">The preview keeps the picture framed for a card. You can replace it any time.</p>
          </div>

          <div className="grid gap-5 sm:grid-cols-[1fr_0.72fr]">
            <label className="block">
              <span className="mb-2 block font-mono text-[0.66rem] font-bold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">Title</span>
              <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} placeholder="e.g. apple, bicycle, rain" className="h-12 w-full rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background)/.45)] px-4 text-base text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground)/.65)]" data-testid="input-card-title" />
            </label>
            <label className="block">
              <span className="mb-2 block font-mono text-[0.66rem] font-bold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">Category <span className="font-sans font-normal normal-case tracking-normal">optional</span></span>
              <input value={category} onChange={(event) => setCategory(event.target.value)} maxLength={60} placeholder="e.g. kitchen" className="h-12 w-full rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background)/.45)] px-4 text-base text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground)/.65)]" data-testid="input-card-category" />
            </label>
          </div>

          {error && <p className="rounded-xl border border-[hsl(var(--destructive)/.3)] bg-[hsl(var(--destructive)/.08)] px-4 py-3 text-sm text-[hsl(var(--destructive))]" role="alert" data-testid="status-editor-error">{error}</p>}

          <div className="flex flex-col-reverse gap-3 border-t border-[hsl(var(--border))] pt-5 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} className="h-12 rounded-xl px-5 font-semibold text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]" data-testid="button-cancel-editor">
              Cancel
            </button>
            <button type="submit" disabled={isPending} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-6 font-semibold text-[hsl(var(--primary-foreground))] shadow-[3px_3px_0_hsl(var(--foreground)/.16)] transition-transform hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-70" data-testid="button-save-card">
              {isPending && <LoaderCircle size={17} className="animate-spin" />}
              {isPending ? 'Saving…' : isEditing ? 'Save changes' : 'Add card'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
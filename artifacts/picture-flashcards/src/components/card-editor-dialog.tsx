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

type ImageSize = { width: number; height: number };

function getCrop(imageSize: ImageSize, zoom: number, focusX: number, focusY: number) {
  const aspect = 4 / 5;
  const baseWidth =
    imageSize.width / imageSize.height >= aspect
      ? imageSize.height * aspect
      : imageSize.width;
  const baseHeight = baseWidth / aspect;
  const width = baseWidth / zoom;
  const height = baseHeight / zoom;
  return {
    x: (imageSize.width - width) * focusX,
    y: (imageSize.height - height) * focusY,
    width,
    height,
  };
}

export function CardEditorDialog({ open, card, onClose, onSaved }: CardEditorDialogProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [imageData, setImageData] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [fileLabel, setFileLabel] = useState('');
  const [imageSize, setImageSize] = useState<ImageSize>();
  const [zoom, setZoom] = useState(1);
  const [focusX, setFocusX] = useState(0.5);
  const [focusY, setFocusY] = useState(0.5);
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
    setFileLabel('');
    setImageSize(undefined);
    setZoom(1);
    setFocusX(0.5);
    setFocusY(0.5);
    setError('');
  }, [card, open]);

  if (!open) return null;

  const handleFile = (file?: File) => {
    if (!file) return;
    const isHeic = file.type === 'image/heic' || file.type === 'image/heif' || /\.(heic|heif)$/i.test(file.name);
    if (!file.type.startsWith('image/') && !isHeic) {
      setError('Choose an image file to continue.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError('That image is larger than 8 MB. Choose a smaller one.');
      return;
    }
    setFileLabel(file.name);
    setImageSize(undefined);
    setZoom(1);
    setFocusX(0.5);
    setFocusY(0.5);
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      setImageData(result);
      setPreviewUrl(isHeic ? '' : result);
      if (!isHeic && result) {
        const image = new window.Image();
        image.onload = () => setImageSize({ width: image.naturalWidth, height: image.naturalHeight });
        image.src = result;
      }
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
    const crop = imageData && imageSize ? getCrop(imageSize, zoom, focusX, focusY) : undefined;
    if (card) {
      updateCard.mutate(
        {
          id: card.id,
          data: {
            title: trimmedTitle,
            category: trimmedCategory || null,
            ...(imageData ? { imageData } : {}),
            ...(crop ? { crop } : {}),
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
            ...(crop ? { crop } : {}),
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
              className="group relative block aspect-[4/5] w-full overflow-hidden rounded-[18px] border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--muted)/.65)] text-left transition-colors hover:border-[hsl(var(--primary))] hover:bg-[hsl(var(--accent)/.12)]"
              data-testid="button-upload-image"
            >
              {previewUrl ? (
                <>
                  <div className="relative h-full w-full overflow-hidden">
                    {imageSize && imageData ? (
                      <img
                        src={previewUrl}
                        alt="Selected card preview"
                        className="absolute max-w-none"
                        style={(() => {
                          const crop = getCrop(imageSize, zoom, focusX, focusY);
                          return {
                            width: `${(imageSize.width / crop.width) * 100}%`,
                            height: `${(imageSize.height / crop.height) * 100}%`,
                            left: `-${(crop.x / crop.width) * 100}%`,
                            top: `-${(crop.y / crop.height) * 100}%`,
                          };
                        })()}
                        data-testid="img-card-preview"
                      />
                    ) : (
                      <img src={previewUrl} alt="Selected card preview" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]" data-testid="img-card-preview" />
                    )}
                    {imageData && <span className="pointer-events-none absolute inset-0 border-[3px] border-[hsl(var(--card)/.82)]" />}
                  </div>
                  <span className="absolute bottom-3 right-3 rounded-full bg-[hsl(var(--foreground)/.78)] px-3 py-1.5 font-mono text-[0.6rem] font-bold uppercase tracking-[0.12em] text-[hsl(var(--card))]">
                    Replace image
                  </span>
                </>
              ) : imageData ? (
                <span className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
                  <ImagePlus size={26} strokeWidth={1.5} className="text-[hsl(var(--primary))]" />
                  <span className="font-medium text-[hsl(var(--foreground))]">HEIC image ready</span>
                  <span className="max-w-xs text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">{fileLabel || 'The server will convert this image for playback.'}</span>
                  <span className="rounded-full bg-[hsl(var(--foreground)/.08)] px-3 py-1 font-mono text-[0.58rem] font-bold uppercase tracking-[0.12em] text-[hsl(var(--muted-foreground))]">Converted when saved</span>
                </span>
              ) : (
                <span className="flex h-full flex-col items-center justify-center gap-2 text-center">
                  <ImagePlus size={26} strokeWidth={1.5} className="text-[hsl(var(--primary))]" />
                  <span className="font-medium text-[hsl(var(--foreground))]">Choose a clear, real picture</span>
                  <span className="text-xs text-[hsl(var(--muted-foreground))]">JPG, PNG, WEBP, or HEIC · up to 8 MB</span>
                </span>
              )}
            </button>
            <input ref={fileInputRef} id="card-image" type="file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif,.heic,.heif" className="sr-only" onChange={(event) => handleFile(event.target.files?.[0])} data-testid="input-image-upload" />
            <p className="mt-2 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">The fixed portrait frame matches playback. Use the controls below to choose what stays in view. HEIC photos are converted on the server.</p>
          </div>

          {imageData && imageSize && (
            <div className="space-y-3 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/.35)] p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-[0.64rem] font-bold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">Frame the portrait crop</p>
                <span className="text-xs text-[hsl(var(--muted-foreground))]">Drag the sliders</span>
              </div>
              <label className="grid grid-cols-[5rem_1fr] items-center gap-3 text-sm">
                <span>Zoom</span>
                <input type="range" min="1" max="3" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} aria-label="Picture zoom" />
              </label>
              <label className="grid grid-cols-[5rem_1fr] items-center gap-3 text-sm">
                <span>Across</span>
                <input type="range" min="0" max="1" step="0.01" value={focusX} onChange={(event) => setFocusX(Number(event.target.value))} aria-label="Picture horizontal position" />
              </label>
              <label className="grid grid-cols-[5rem_1fr] items-center gap-3 text-sm">
                <span>Up / down</span>
                <input type="range" min="0" max="1" step="0.01" value={focusY} onChange={(event) => setFocusY(Number(event.target.value))} aria-label="Picture vertical position" />
              </label>
            </div>
          )}

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
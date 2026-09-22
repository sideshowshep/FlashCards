import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ImagePlus, LoaderCircle, X } from 'lucide-react';
import ReactCrop, {
  centerCrop,
  makeAspectCrop,
  type Crop as ImageCrop,
  type PercentCrop,
} from 'react-image-crop';
import {
  getGetCardsSummaryQueryKey,
  getListCardsQueryKey,
  useCreateCard,
  useUpdateCard,
} from '@workspace/api-client-react';
import type { Card } from '@workspace/api-client-react';
import 'react-image-crop/dist/ReactCrop.css';

type CardEditorDialogProps = {
  open: boolean;
  card: Card | null;
  onClose: () => void;
  onSaved: () => void;
};

const PORTRAIT_ASPECT = 4 / 5;

function readAsDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('The image could not be read.'));
    };
    reader.onerror = () => reject(new Error('The image could not be read.'));
    reader.readAsDataURL(blob);
  });
}

function getNaturalCrop(
  crop: ImageCrop | undefined,
  image: HTMLImageElement | null,
) {
  if (!crop || !image?.naturalWidth || !image.naturalHeight) return undefined;
  const scaleX = crop.unit === '%' ? image.naturalWidth / 100 : image.naturalWidth / image.width;
  const scaleY = crop.unit === '%' ? image.naturalHeight / 100 : image.naturalHeight / image.height;
  return {
    x: crop.x * scaleX,
    y: crop.y * scaleY,
    width: crop.width * scaleX,
    height: crop.height * scaleY,
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
  const imageRef = useRef<HTMLImageElement>(null);
  const [crop, setCrop] = useState<ImageCrop>();
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
    setCrop(undefined);
    setError('');
  }, [card, open]);

  if (!open) return null;

  const handleFile = async (file?: File) => {
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
    setCrop(undefined);
    try {
      let previewBlob: Blob = file;
      if (isHeic) {
        const { default: heic2any } = await import('heic2any');
        const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
        previewBlob = Array.isArray(converted) ? converted[0] : converted;
      }
      const result = await readAsDataUrl(previewBlob);
      setImageData(result);
      setPreviewUrl(result);
      setError('');
    } catch {
      if (isHeic) {
        try {
          const result = await readAsDataUrl(file);
          setImageData(result);
          setPreviewUrl('');
          setError('HEIC preview is unavailable here, but the original will be converted when saved.');
        } catch {
          setError('The image could not be read. Try again.');
        }
      } else {
        setError('The image could not be read. Try again.');
      }
    }
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
    const selectedCrop = imageData && previewUrl
      ? getNaturalCrop(crop, imageRef.current)
      : undefined;
    if (card) {
      updateCard.mutate(
        {
          id: card.id,
          data: {
            title: trimmedTitle,
            category: trimmedCategory || null,
            ...(imageData ? { imageData } : {}),
            ...(selectedCrop ? { crop: selectedCrop } : {}),
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
            ...(selectedCrop ? { crop: selectedCrop } : {}),
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
            <div className="group relative flex min-h-80 w-full items-center justify-center overflow-hidden rounded-[18px] border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--muted)/.65)] text-left transition-colors hover:border-[hsl(var(--primary))] hover:bg-[hsl(var(--accent)/.12)]">
              {previewUrl && imageData ? (
                <ReactCrop
                  crop={crop}
                  onChange={(_, percentCrop: PercentCrop) => setCrop(percentCrop)}
                  onComplete={(_, percentCrop: PercentCrop) => setCrop(percentCrop)}
                  aspect={PORTRAIT_ASPECT}
                  keepSelection
                  minWidth={60}
                  minHeight={75}
                  className="max-h-[52dvh] max-w-full"
                  data-testid="image-crop-tool"
                >
                  <img
                    ref={imageRef}
                    src={previewUrl}
                    alt="Select the part of the picture to keep"
                    className="block max-h-[52dvh] max-w-full object-contain"
                    onLoad={(event) => {
                      const { width, height } = event.currentTarget;
                      setCrop(
                        centerCrop(
                          makeAspectCrop(
                            { unit: '%', width: 80 },
                            PORTRAIT_ASPECT,
                            width,
                            height,
                          ),
                          width,
                          height,
                        ),
                      );
                    }}
                    data-testid="img-card-preview"
                  />
                </ReactCrop>
              ) : previewUrl ? (
                <img
                  ref={imageRef}
                  src={previewUrl}
                  alt="Selected card preview"
                  className="max-h-[52dvh] max-w-full object-contain"
                  data-testid="img-card-preview"
                />
              ) : imageData ? (
                <div className="flex min-h-80 flex-col items-center justify-center gap-2 px-6 text-center">
                  <ImagePlus size={26} strokeWidth={1.5} className="text-[hsl(var(--primary))]" />
                  <span className="font-medium text-[hsl(var(--foreground))]">HEIC image ready</span>
                  <span className="max-w-xs text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">{fileLabel || 'The server will convert this image for playback.'}</span>
                  <span className="rounded-full bg-[hsl(var(--foreground)/.08)] px-3 py-1 font-mono text-[0.58rem] font-bold uppercase tracking-[0.12em] text-[hsl(var(--muted-foreground))]">Converted when saved</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex min-h-80 w-full flex-col items-center justify-center gap-2 text-center"
                  data-testid="button-upload-image"
                >
                  <ImagePlus size={26} strokeWidth={1.5} className="text-[hsl(var(--primary))]" />
                  <span className="font-medium text-[hsl(var(--foreground))]">Choose a clear, real picture</span>
                  <span className="text-xs text-[hsl(var(--muted-foreground))]">JPG, PNG, WEBP, or HEIC · up to 8 MB</span>
                </button>
              )}
              {(previewUrl || imageData) && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-3 right-3 rounded-full bg-[hsl(var(--foreground)/.78)] px-3 py-1.5 font-mono text-[0.6rem] font-bold uppercase tracking-[0.12em] text-[hsl(var(--card))]"
                  data-testid="button-replace-image"
                >
                  Replace image
                </button>
              )}
            </div>
            <input ref={fileInputRef} id="card-image" type="file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif,.heic,.heif" className="sr-only" onChange={(event) => handleFile(event.target.files?.[0])} data-testid="input-image-upload" />
            <p className="mt-2 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">Drag the crop box over the picture and use its handles to resize it. The portrait shape stays fixed at 4:5. HEIC photos are converted for editing and saved as JPEG.</p>
          </div>

          {imageData && previewUrl && (
            <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/.35)] p-4 text-sm text-[hsl(var(--muted-foreground))]">
              <strong className="font-semibold text-[hsl(var(--foreground))]">Portrait crop</strong>
              <span className="ml-2">Drag inside the box to move it. Drag a corner or edge handle to resize it.</span>
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
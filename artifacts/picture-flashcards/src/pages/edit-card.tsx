import { useLocation } from 'wouter';
import { useListCards } from '@workspace/api-client-react';
import { CardEditorDialog } from '@/components/card-editor-dialog';

function PageMessage({ children, onBack }: { children: string; onBack: () => void }) {
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-[hsl(var(--background))] px-5 text-center">
      <div>
        <p className="font-serif text-3xl font-semibold">{children}</p>
        <button
          type="button"
          onClick={onBack}
          className="mt-5 rounded-xl bg-[hsl(var(--primary))] px-5 py-3 text-sm font-semibold text-[hsl(var(--primary-foreground))]"
        >
          Back to catalogue
        </button>
      </div>
    </main>
  );
}

export default function EditCard() {
  const [location, navigate] = useLocation();
  const cardsQuery = useListCards();
  const cardId = decodeURIComponent(location.split('?')[0].split('/').pop() ?? '');
  const card = cardsQuery.data?.find((item) => item.id === cardId);

  if (cardsQuery.isLoading) {
    return <PageMessage onBack={() => navigate('/')}>Loading picture…</PageMessage>;
  }
  if (cardsQuery.isError) {
    return <PageMessage onBack={() => navigate('/')}>The picture could not be loaded.</PageMessage>;
  }
  if (!card) {
    return <PageMessage onBack={() => navigate('/')}>That picture is no longer on the shelf.</PageMessage>;
  }

  return (
    <CardEditorDialog
      open
      card={card}
      page
      onClose={() => navigate('/')}
      onSaved={() => navigate('/')}
    />
  );
}
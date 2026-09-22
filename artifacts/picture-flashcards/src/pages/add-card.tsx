import { useLocation } from 'wouter';
import { CardEditorDialog } from '@/components/card-editor-dialog';

export default function AddCard() {
  const [, navigate] = useLocation();

  return (
    <CardEditorDialog
      open
      card={null}
      page
      onClose={() => navigate('/')}
      onSaved={() => navigate('/')}
    />
  );
}
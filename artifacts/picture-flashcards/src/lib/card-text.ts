export type CardTextCase = 'upper' | 'mixed' | 'lower' | 'none';

export function isCardTextCase(value: string | null | undefined): value is CardTextCase {
  return value === 'upper' || value === 'mixed' || value === 'lower' || value === 'none';
}

export function formatCardText(text: string, textCase: CardTextCase) {
  if (textCase === 'upper') return text.toLocaleUpperCase();
  if (textCase === 'lower') return text.toLocaleLowerCase();
  if (textCase === 'none') return '';
  return text;
}
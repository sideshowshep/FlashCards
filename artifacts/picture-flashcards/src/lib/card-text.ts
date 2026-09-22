export type CardTextCase = 'upper' | 'mixed' | 'lower';

export function isCardTextCase(value: string | null | undefined): value is CardTextCase {
  return value === 'upper' || value === 'mixed' || value === 'lower';
}

export function formatCardText(text: string, textCase: CardTextCase) {
  if (textCase === 'upper') return text.toLocaleUpperCase();
  if (textCase === 'lower') return text.toLocaleLowerCase();
  return text;
}
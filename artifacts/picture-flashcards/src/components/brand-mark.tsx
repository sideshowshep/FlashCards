import { Link } from 'wouter';

type BrandMarkProps = {
  to?: string;
  compact?: boolean;
};

export function BrandMark({ to = '/', compact = false }: BrandMarkProps) {
  return (
    <Link
      href={to}
      className={`group inline-flex items-center gap-3 no-underline ${compact ? 'gap-2' : ''}`}
      data-testid={to === '/' ? 'link-brand-home' : 'link-brand-admin'}
      aria-label={to === '/' ? 'Go to picture practice' : 'Go to catalogue'}
    >
      <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-[13px] bg-[hsl(var(--secondary))] shadow-[3px_3px_0_hsl(var(--foreground)/.14)] transition-transform duration-200 group-hover:-translate-y-0.5">
        <span className="absolute left-[9px] top-[9px] h-3 w-3 rounded-full bg-[hsl(var(--accent))]" />
        <span className="absolute bottom-[8px] right-[8px] h-3.5 w-5 -rotate-12 rounded-[3px] bg-[hsl(var(--primary))]" />
        <span className="absolute bottom-[8px] left-[8px] h-2 w-2 rounded-full bg-[hsl(var(--card))]" />
      </span>
      {!compact && (
        <span className="leading-[0.95]">
          <span className="block font-serif text-[1.35rem] font-semibold tracking-[-0.035em] text-[hsl(var(--foreground))]">
            Flash
          </span>
          <span className="block font-mono text-[0.58rem] font-bold uppercase tracking-[0.24em] text-[hsl(var(--muted-foreground))]">
            Cards
          </span>
        </span>
      )}
    </Link>
  );
}
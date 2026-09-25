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
      <span className="grid h-10 w-10 shrink-0 overflow-hidden rounded-[13px] shadow-[3px_3px_0_hsl(var(--foreground)/.14)] transition-transform duration-200 group-hover:-translate-y-0.5">
        <img
          src={`${import.meta.env.BASE_URL}pwa-icon-192.png`}
          alt=""
          className="h-full w-full object-cover"
        />
      </span>
      {!compact && (
        <span className="font-serif text-[1.35rem] font-semibold tracking-[-0.035em] text-[hsl(var(--foreground))]">
          Flash Cards
          </span>
      )}
    </Link>
  );
}
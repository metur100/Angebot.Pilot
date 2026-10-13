import iconUrl from '@angebotpilot/brand/assets/icon.svg?url';
import { cx } from '@/lib/cx';

/** AngebotPilot logo: brand mark plus wordmark rendered in Inter. */
export function BrandLogo({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const icon = size === 'lg' ? 'size-9' : size === 'sm' ? 'size-6' : 'size-7';
  const text = size === 'lg' ? 'text-[22px]' : size === 'sm' ? 'text-[15px]' : 'text-[17px]';
  return (
    <span className={cx('inline-flex items-center gap-2', className)}>
      <img src={iconUrl} alt="" aria-hidden className={cx(icon, 'shrink-0')} />
      <span className={cx(text, 'font-bold tracking-[-0.02em] text-neutral-900')}>
        Angebot<span className="text-brand-600">Pilot</span>
      </span>
    </span>
  );
}

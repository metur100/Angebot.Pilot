import { Loader2, type LucideIcon } from 'lucide-react';
import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';
import { cx } from '@/lib/cx';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dangerGhost' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

const base =
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ' +
  'disabled:cursor-not-allowed disabled:opacity-55 aria-disabled:cursor-not-allowed aria-disabled:opacity-55 select-none';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-800 disabled:hover:bg-brand-600',
  secondary:
    'border border-neutral-300 bg-white text-neutral-800 shadow-sm hover:bg-neutral-50 hover:border-neutral-400 active:bg-neutral-100',
  ghost: 'text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 active:bg-neutral-200',
  danger: 'bg-danger-text text-white shadow-sm hover:brightness-95 active:brightness-90',
  dangerGhost: 'text-danger-text hover:bg-danger-bg',
  link: 'text-brand-600 underline-offset-4 hover:underline hover:text-brand-700 px-0! h-auto!',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-9 px-3.5 text-sm',
  lg: 'h-11 px-5 text-[15px]',
};

const iconSizes: Record<ButtonSize, number> = { sm: 15, md: 16, lg: 18 };

export function buttonClasses(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', className?: string) {
  return cx(base, variants[variant], sizes[size], className);
}

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  loading?: boolean;
  children?: ReactNode;
}

export type ButtonProps = CommonProps & ButtonHTMLAttributes<HTMLButtonElement>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon: Icon, iconRight: IconRight, loading, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClasses(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <Loader2 aria-hidden size={iconSizes[size]} className="animate-spin" />
      ) : (
        Icon && <Icon aria-hidden size={iconSizes[size]} strokeWidth={2} />
      )}
      {children}
      {IconRight && !loading && <IconRight aria-hidden size={iconSizes[size]} strokeWidth={2} />}
    </button>
  );
});

export type ButtonLinkProps = CommonProps & LinkProps;

/** A router link that looks like a button. */
export function ButtonLink({ variant = 'secondary', size = 'md', icon: Icon, iconRight: IconRight, className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={buttonClasses(variant, size, className)} {...rest}>
      {Icon && <Icon aria-hidden size={iconSizes[size]} strokeWidth={2} />}
      {children}
      {IconRight && <IconRight aria-hidden size={iconSizes[size]} strokeWidth={2} />}
    </Link>
  );
}

export type ExternalLinkProps = CommonProps & AnchorHTMLAttributes<HTMLAnchorElement>;

/** An external anchor that looks like a button. Opens in a new tab with safe rel attributes. */
export function ButtonAnchor({ variant = 'secondary', size = 'md', icon: Icon, className, children, ...rest }: ExternalLinkProps) {
  return (
    <a className={buttonClasses(variant, size, className)} target="_blank" rel="noopener noreferrer" {...rest}>
      {Icon && <Icon aria-hidden size={iconSizes[size]} strokeWidth={2} />}
      {children}
    </a>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  /** Accessible name (also shown as native tooltip). */
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon: Icon, label, variant = 'ghost', size = 'md', className, type = 'button', ...rest },
  ref,
) {
  const square = size === 'sm' ? 'w-8 px-0!' : size === 'lg' ? 'w-11 px-0!' : 'w-9 px-0!';
  return (
    <button ref={ref} type={type} aria-label={label} title={label} className={buttonClasses(variant, size, cx(square, className))} {...rest}>
      <Icon aria-hidden size={iconSizes[size]} strokeWidth={2} />
    </button>
  );
});

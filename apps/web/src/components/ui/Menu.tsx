import { CircleHelp, type LucideIcon } from 'lucide-react';
import { DropdownMenu, Popover, Tabs as RadixTabs, Tooltip as RadixTooltip } from 'radix-ui';
import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';

export const Menu = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;

export function MenuContent({ children, align = 'end', className }: { children: ReactNode; align?: 'start' | 'end' | 'center'; className?: string }) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        align={align}
        sideOffset={6}
        collisionPadding={8}
        className={cx(
          'ap-popover z-50 min-w-[200px] rounded-lg border border-neutral-200 bg-white p-1 shadow-lg focus:outline-none',
          className,
        )}
      >
        {children}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  );
}

interface MenuItemProps {
  icon?: LucideIcon;
  children: ReactNode;
  onSelect?: () => void;
  disabled?: boolean;
  danger?: boolean;
  description?: ReactNode;
}

export function MenuItem({ icon: Icon, children, onSelect, disabled, danger, description }: MenuItemProps) {
  return (
    <DropdownMenu.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cx(
        'flex cursor-pointer items-start gap-2.5 rounded-md px-2.5 py-2 text-sm outline-none select-none',
        'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[highlighted]:bg-neutral-100',
        danger ? 'text-danger-text data-[highlighted]:bg-danger-bg' : 'text-neutral-800',
      )}
    >
      {Icon && <Icon aria-hidden size={16} className={cx('mt-0.5 shrink-0', danger ? 'text-danger-text' : 'text-neutral-500')} />}
      <span className="min-w-0">
        <span className="block">{children}</span>
        {description && <span className="mt-0.5 block text-xs text-neutral-500">{description}</span>}
      </span>
    </DropdownMenu.Item>
  );
}

export function MenuSeparator() {
  return <DropdownMenu.Separator className="my-1 h-px bg-neutral-100" />;
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <DropdownMenu.Label className="px-2.5 pt-2 pb-1 text-xs font-medium text-neutral-500">{children}</DropdownMenu.Label>;
}

/** Small "?" button that reveals an explanation. Works with touch and keyboard (unlike hover tooltips). */
export function HelpPopover({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cx(
            'inline-flex size-6 shrink-0 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700',
            className,
          )}
        >
          <CircleHelp aria-hidden size={15} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="center"
          sideOffset={6}
          collisionPadding={12}
          className="ap-popover z-50 max-w-[320px] rounded-lg border border-neutral-200 bg-white px-3.5 py-3 text-[13px] leading-[19px] text-neutral-700 shadow-lg focus:outline-none"
        >
          {children}
          <Popover.Arrow className="fill-white" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function Tooltip({ content, children }: { content: ReactNode; children: ReactNode }) {
  return (
    <RadixTooltip.Provider delayDuration={300}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content
            sideOffset={6}
            collisionPadding={8}
            className="ap-popover z-50 max-w-[280px] rounded-md bg-neutral-900 px-2.5 py-1.5 text-xs leading-4 text-white shadow-md"
          >
            {content}
            <RadixTooltip.Arrow className="fill-neutral-900" />
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
}

export const Tabs = RadixTabs.Root;
export const TabsContent = RadixTabs.Content;

export function TabsList({ children, label, className }: { children: ReactNode; label: string; className?: string }) {
  return (
    <RadixTabs.List
      aria-label={label}
      className={cx('flex gap-1 overflow-x-auto border-b border-neutral-200 [scrollbar-width:none]', className)}
    >
      {children}
    </RadixTabs.List>
  );
}

export function TabsTrigger({ value, children, count }: { value: string; children: ReactNode; count?: number }) {
  return (
    <RadixTabs.Trigger
      value={value}
      className={cx(
        '-mb-px inline-flex h-10 shrink-0 items-center gap-2 border-b-2 border-transparent px-3 text-sm font-medium whitespace-nowrap text-neutral-500',
        'hover:text-neutral-800 data-[state=active]:border-brand-600 data-[state=active]:text-neutral-900',
        'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500',
      )}
    >
      {children}
      {count !== undefined && (
        <span className="rounded-full bg-neutral-100 px-1.5 py-px text-xs font-medium text-neutral-600 tabular">{count}</span>
      )}
    </RadixTabs.Trigger>
  );
}

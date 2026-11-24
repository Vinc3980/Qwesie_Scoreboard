import React from 'react';
import { cn } from '../../utils/cn.js';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost' | 'teamA' | 'teamB';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  className,
  variant = 'secondary',
  size = 'md',
  isLoading = false,
  children,
  disabled,
  ...props
}) => {
  // Semantic, theme-aware controls. Disabled states swap to neutral tokens instead of
  // fading the whole control, so labels/icons keep AA contrast.
  const base = 'inline-flex items-center justify-center font-semibold rounded-[10px] transition-colors transition-transform active:scale-[0.98] motion-reduce:transform-none focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed select-none';

  const variants = {
    primary: 'bg-accent hover:bg-accent-hover text-accent-fg border border-accent/40 shadow-none',
    secondary: 'bg-surface-raised hover:bg-surface-alt text-fg border border-border-strong shadow-none',
    danger: 'bg-danger-subtle hover:bg-danger/20 text-danger border border-danger/40 shadow-none',
    outline: 'bg-transparent hover:bg-surface-alt text-fg border border-border-strong shadow-none',
    ghost: 'bg-transparent hover:bg-surface-alt text-fg-muted hover:text-fg border border-transparent shadow-none',
    teamA: 'bg-teamA/10 hover:bg-teamA/20 text-teamA border border-teamA/40 shadow-none',
    teamB: 'bg-teamB/10 hover:bg-teamB/20 text-teamB border border-teamB/40 shadow-none',
  };

  const sizes = {
    sm: 'text-xs px-2.5 py-1.5 gap-1.5 min-h-[36px]',
    md: 'text-sm px-3.5 py-2 gap-2 min-h-[40px]',
    lg: 'text-base px-4 py-2.5 gap-2.5 min-h-[44px]',
    icon: 'h-9 w-9 p-0',
  };

  // Keep loading controls in their variant colours (spinner + label); only user-disabled
  // controls switch to the neutral disabled surface. `disabled:` variants win over
  // caller-supplied background/text classes without relying on class-string order.
  const disabledVariant = 'disabled:bg-surface-sunken disabled:text-fg-muted disabled:border disabled:border-border disabled:shadow-none disabled:saturate-50';

  return (
    <button
      className={cn(base, variants[variant], sizes[size], !isLoading && disabledVariant, className)}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
      ) : null}
      {children}
    </button>
  );
};

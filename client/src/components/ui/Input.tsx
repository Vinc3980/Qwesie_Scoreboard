import React from 'react';
import { cn } from '../../utils/cn.js';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'w-full rounded-[10px] border border-border-strong bg-surface-sunken px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:border-accent transition-colors disabled:bg-surface-alt disabled:text-fg-muted disabled:cursor-not-allowed',
        className
      )}
      {...props}
    />
  )
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'w-full min-h-[84px] rounded-[10px] border border-border-strong bg-surface-sunken px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:border-accent transition-colors disabled:bg-surface-alt disabled:text-fg-muted disabled:cursor-not-allowed',
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = 'Textarea';

export const Label: React.FC<React.LabelHTMLAttributes<HTMLLabelElement>> = ({ className, ...props }) => (
  <label className={cn('block text-[11px] font-bold uppercase tracking-[0.08em] text-fg-muted mb-1.5 font-display', className)} {...props} />
);

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'w-full rounded-[10px] border border-border-strong bg-surface-sunken px-3 py-2 text-sm text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:border-accent transition-colors disabled:bg-surface-alt disabled:text-fg-muted disabled:cursor-not-allowed',
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
);
Select.displayName = 'Select';

import React from 'react';
import { cn } from '../../utils/cn.js';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'live' | 'finished' | 'teamA' | 'teamB' | 'neutral' | 'server' | 'success' | 'warning' | 'danger' | 'info';
}

export const Badge: React.FC<BadgeProps> = ({ className, variant = 'neutral', children, ...props }) => {
  // Semantic status colors; pair with icon/label text (not color alone)
  const variants = {
    live: 'bg-danger-subtle text-danger border-danger/30',
    finished: 'bg-surface-alt text-fg-muted border-border',
    teamA: 'bg-teamA/15 text-teamA border-teamA/30',
    teamB: 'bg-teamB/15 text-teamB border-teamB/30',
    server: 'bg-warning-subtle text-warning border-warning/30',
    neutral: 'bg-surface-alt text-fg-muted border-border',
    success: 'bg-success-subtle text-success border-success/30',
    warning: 'bg-warning-subtle text-warning border-warning/30',
    danger: 'bg-danger-subtle text-danger border-danger/30',
    info: 'bg-info-subtle text-info border-info/30',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-[0.08em] border font-display',
        variants[variant],
        className
      )}
      {...props}
    >
      {variant === 'live' && (
        <span className="w-2 h-2 rounded-full bg-live animate-pulse" aria-hidden="true" />
      )}
      {children}
    </span>
  );
};

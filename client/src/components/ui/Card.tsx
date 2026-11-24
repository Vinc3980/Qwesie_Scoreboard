import React from 'react';
import { cn } from '../../utils/cn.js';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  glass?: boolean;
}

export const Card: React.FC<CardProps> = ({ className, glass = true, children, ...props }) => {
  return (
    <div
      className={cn(
        'rounded-[14px] border border-border p-4 shadow-none bg-surface text-fg',
        glass ? 'backdrop-blur-none' : '',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, children, ...props }) => {
  return (
    <div className={cn('flex items-center justify-between pb-3 mb-3 border-b border-border', className)} {...props}>
      {children}
    </div>
  );
};

export const CardTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({ className, children, ...props }) => {
  return (
    <h3 className={cn('text-sm font-bold uppercase tracking-[0.08em] text-fg-muted font-display', className)} {...props}>
      {children}
    </h3>
  );
};

import React from 'react';

export const PageHeader: React.FC<{
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}> = ({ eyebrow, title, description, actions }) => (
  <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between mb-5 pb-4 border-b border-border">
    <div>
      {eyebrow && <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-fg-muted mb-1 font-display">{eyebrow}</p>}
      <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-fg font-display leading-none">{title}</h1>
      {description && <p className="mt-1.5 text-sm text-fg-muted max-w-3xl">{description}</p>}
    </div>
    {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
  </div>
);

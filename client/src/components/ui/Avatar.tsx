import React, { useState } from 'react';

function initials(name?: string | null) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const Avatar: React.FC<{
  src?: string | null;
  name?: string | null;
  size?: number;
  color?: string | null;
  textColor?: string | null;
  className?: string;
  rounded?: 'full' | 'lg' | 'md';
}> = ({ src, name, size = 40, color, textColor, className = '', rounded = 'full' }) => {
  const [broken, setBroken] = useState(false);
  const showImg = !!src && !broken;
  const bg = color || 'var(--app-surface-sunken)';
  const fg = textColor || (color ? '#fff' : 'var(--app-foreground)');
  const r = rounded === 'full' ? 'rounded-full' : rounded === 'lg' ? 'rounded-lg' : 'rounded-md';
  return (
    <div
      className={`inline-flex items-center justify-center overflow-hidden shrink-0 font-bold ${r} ${className}`}
      style={{ width: size, height: size, background: showImg ? 'var(--app-surface-sunken)' : bg, color: fg, fontSize: Math.max(11, Math.round(size * 0.34)) }}
      aria-label={name || 'Avatar'}
    >
      {showImg ? (
        <img src={src!} alt={name || ''} width={size} height={size} loading="lazy" decoding="async" className="w-full h-full object-cover" onError={() => setBroken(true)} />
      ) : (
        <span aria-hidden="true">{initials(name)}</span>
      )}
    </div>
  );
};

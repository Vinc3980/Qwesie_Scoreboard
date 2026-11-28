import React from 'react';

export const TeamLogo: React.FC<{ src?: string | null; name?: string; shortName?: string; color?: string; textColor?: string; size?: number; className?: string; style?: React.CSSProperties; }> = ({ src, name, shortName, color = 'var(--team-a)', textColor = '#fff', size = 84, className = '', style }) => {
  const mono = (shortName || name || '?').trim().slice(0, 3).toUpperCase();
  return (
    <div className={`relative overflow-hidden flex items-center justify-center font-display font-bold ${className}`} style={{ width: size, height: size, borderRadius: Math.max(12, size * 0.18), background: src ? 'rgba(255,255,255,0.06)' : color, color: src ? textColor : textColor, ...style }}>
      {src ? <img src={src} alt={name || ''} width={size} height={size} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <span style={{ fontSize: Math.max(28, size * 0.38), lineHeight: 1 }}>{mono}</span>}
    </div>
  );
};

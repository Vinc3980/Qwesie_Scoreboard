import React from 'react';

export const ServeMarker: React.FC<{ active?: boolean; color?: string; size?: number; }> = ({ active, color = '#facc15', size = 18 }) => (
  <span style={{ width: size, height: size, borderRadius: 999, display: 'inline-block', background: active ? color : 'transparent', boxShadow: active ? `0 0 0 4px rgba(250,204,21,0.18), 0 0 14px ${color}` : 'none', opacity: active ? 1 : 0, transition: 'all var(--broadcast-dur) var(--broadcast-ease)' }} />
);

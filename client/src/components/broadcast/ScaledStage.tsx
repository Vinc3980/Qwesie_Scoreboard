import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { applyTeamCssVars } from '../../utils/broadcastTheme.js';
import { overlayBgStyle, type OverlayBg } from '../../utils/overlay.js';

type Props = {
  children: React.ReactNode;
  match?: any;
  className?: string;
  hideCursor?: boolean;
  /** `?bg=` test background. Transparent by default for OBS/vMix. */
  bg?: OverlayBg;
  /** 'window' (default, OBS/fullscreen) or 'container' (fits parent box for console monitors). */
  fit?: 'window' | 'container';
  stageWidth?: number;
  stageHeight?: number;
};

export const ScaledStage: React.FC<Props> = ({ children, match, className = '', hideCursor = true, bg = 'transparent', fit = 'window', stageWidth = 1920, stageHeight = 1080 }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    if (fit === 'container') {
      const el = containerRef.current;
      if (!el) return;
      const update = () => {
        const rect = el.getBoundingClientRect();
        const w = rect.width || el.clientWidth || 1;
        const h = rect.height || el.clientHeight || 1;
        setScale(Math.min(w / stageWidth, h / stageHeight));
      };
      update();
      const ro = new ResizeObserver(update);
      ro.observe(el);
      return () => ro.disconnect();
    }

    const update = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      // Uniform fit, anchored to top-left (no centering offsets, no stretch).
      setScale(Math.min(w / stageWidth, h / stageHeight));
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [fit, stageWidth, stageHeight]);

  useEffect(() => {
    if (fit === 'container') return;
    const prevOverflow = document.body.style.overflow;
    const prevCursor = document.body.style.cursor;
    document.body.classList.add('broadcast-transparent');
    document.body.style.overflow = 'hidden';
    if (hideCursor) document.body.style.cursor = 'none';
    return () => {
      document.body.classList.remove('broadcast-transparent');
      document.body.style.overflow = prevOverflow;
      document.body.style.cursor = prevCursor;
    };
  }, [hideCursor, fit]);

  useEffect(() => {
    applyTeamCssVars(rootRef.current, match);
  }, [match]);

  if (fit === 'container') {
    const scaledW = stageWidth * scale;
    const scaledH = stageHeight * scale;
    return (
      <div ref={containerRef} className={`broadcast-stage-root ${className}`} style={{ ...overlayBgStyle(bg), position: 'relative', width: '100%', height: '100%', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: scaledW, height: scaledH, position: 'relative', flex: '0 0 auto' }}>
          <div
            ref={rootRef}
            className="broadcast-canvas"
            data-stage-width={stageWidth}
            data-stage-height={stageHeight}
            data-stage-scale={scale}
            style={{
              width: stageWidth,
              height: stageHeight,
              position: 'absolute',
              left: 0,
              top: 0,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              background: 'transparent',
            }}
          >
            {children}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`broadcast-stage-root ${className}`} style={{ ...overlayBgStyle(bg), position: 'fixed', inset: 0, overflow: 'hidden' }}>
      <div
        ref={rootRef}
        className="broadcast-canvas"
        data-stage-width={stageWidth}
        data-stage-height={stageHeight}
        data-stage-scale={scale}
        style={{
          width: stageWidth,
          height: stageHeight,
          position: 'absolute',
          left: 0,
          top: 0,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          background: 'transparent',
        }}
      >
        {children}
      </div>
    </div>
  );
};

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Crop, ImagePlus, Loader2, Trash2, Upload, X } from 'lucide-react';
import { uploadsApi } from '../../services/api.js';
import { Button } from './Button.js';

export type ImageValue = {
  url?: string | null;
  thumbUrl?: string | null;
  key?: string | null;
  thumbKey?: string | null;
};

type Scope = 'player-photo' | 'team-logo' | 'team-coach' | 'team-photo' | 'generic';

type Props = {
  label?: string;
  value?: ImageValue | null;
  scope: Scope;
  aspect?: number; // width/height, e.g. 3/4 or 1
  previewShape?: 'square' | 'portrait' | 'landscape';
  disabled?: boolean;
  className?: string;
  onChange: (value: ImageValue | null) => void;
  helpText?: string;
};

type CropState = { x: number; y: number; zoom: number };

function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

async function cropToBlob(img: HTMLImageElement, crop: CropState, aspect: number): Promise<Blob> {
  const viewportW = 360;
  const viewportH = Math.round(viewportW / aspect);
  const baseScale = Math.max(viewportW / img.naturalWidth, viewportH / img.naturalHeight);
  const scale = baseScale * crop.zoom;
  const drawW = img.naturalWidth * scale;
  const drawH = img.naturalHeight * scale;
  const cx = viewportW / 2 + crop.x;
  const cy = viewportH / 2 + crop.y;
  const sx = (0 - (cx - drawW / 2)) / scale;
  const sy = (0 - (cy - drawH / 2)) / scale;
  const sw = viewportW / scale;
  const sh = viewportH / scale;

  const outW = Math.round(Math.max(320, Math.min(1200, aspect >= 1 ? 1200 : 900)));
  const outH = Math.round(outW / aspect);
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, outW, outH);
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
  return new Promise((resolve, reject) => canvas.toBlob((b) => b ? resolve(b) : reject(new Error('Failed to crop image')), 'image/jpeg', 0.92));
}

function CropModal({ src, aspect, onCancel, onConfirm }: { src: string; aspect: number; onCancel: () => void; onConfirm: (blob: Blob) => void }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState<CropState>({ x: 0, y: 0, zoom: 1 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const dragRef = useRef<{ x: number; y: number; sx: number; sy: number } | null>(null);

  useEffect(() => { let alive = true; loadImage(src).then(i => { if (alive) setImg(i); }).catch(e => { if (alive) setErr(e?.message || 'Failed to load image'); }); return () => { alive = false; }; }, [src]);

  const viewportW = 360;
  const viewportH = Math.round(viewportW / aspect);

  const frame = useMemo(() => {
    if (!img) return null;
    const baseScale = Math.max(viewportW / img.naturalWidth, viewportH / img.naturalHeight);
    const scale = baseScale * crop.zoom;
    const drawW = img.naturalWidth * scale;
    const drawH = img.naturalHeight * scale;
    const left = viewportW / 2 + crop.x - drawW / 2;
    const top = viewportH / 2 + crop.y - drawH / 2;
    return { drawW, drawH, left, top };
  }, [img, crop, viewportW, viewportH]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, sx: crop.x, sy: crop.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    setCrop(c => ({ ...c, x: dragRef.current!.sx + (e.clientX - dragRef.current!.x), y: dragRef.current!.sy + (e.clientY - dragRef.current!.y) }));
  };
  const onPointerUp = () => { dragRef.current = null; };

  const confirm = async () => {
    if (!img) return;
    try { setBusy(true); setErr(null); onConfirm(await cropToBlob(img, crop, aspect)); }
    catch (e: any) { setErr(e?.message || 'Failed to crop image'); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Crop image">
      <div className="w-full max-w-xl rounded-xl border border-border bg-surface p-4 space-y-4 text-fg">
        <div className="flex items-center justify-between gap-3">
          <div className="font-semibold flex items-center gap-2"><Crop className="w-4 h-4" />Crop image</div>
          <button type="button" onClick={onCancel} className="p-2 rounded hover:bg-surface-alt" aria-label="Close crop dialog"><X className="w-4 h-4" /></button>
        </div>
        <div className="mx-auto rounded-lg overflow-hidden bg-black/80 border border-border" style={{ width: viewportW, height: viewportH, maxWidth: '100%', touchAction: 'none' }}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          {frame && img ? (
            <div className="relative w-full h-full select-none">
              <img src={img.src} alt="Crop preview" draggable={false} className="absolute max-w-none pointer-events-none" style={{ width: frame.drawW, height: frame.drawH, left: frame.left, top: frame.top }} />
              <div className="absolute inset-0 ring-1 ring-white/30 pointer-events-none" />
            </div>
          ) : <div className="w-full h-full flex items-center justify-center text-fg-muted text-sm">Loading…</div>}
        </div>
        <div>
          <label className="text-xs text-fg-muted block mb-1">Zoom</label>
          <input type="range" min={1} max={3} step={0.01} value={crop.zoom} onChange={e => setCrop(c => ({ ...c, zoom: Number(e.target.value) }))} className="w-full" aria-label="Zoom" />
        </div>
        {err && <div className="text-sm text-danger" role="alert">{err}</div>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={confirm} isLoading={busy} disabled={!img}>Use image</Button>
        </div>
      </div>
    </div>
  );
}

export const ImageUpload: React.FC<Props> = ({
  label, value, scope, aspect = 1, previewShape = 'square', disabled, className = '', onChange, helpText,
}) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);

  const previewUrl = value?.thumbUrl || value?.url || null;

  const shapeClass = previewShape === 'portrait' ? 'aspect-[3/4] w-28' : previewShape === 'landscape' ? 'aspect-video w-40' : 'aspect-square w-24';

  const pick = () => !disabled && fileRef.current?.click();
  const pickCamera = () => !disabled && cameraRef.current?.click();

  const clear = () => { setError(null); setProgress(0); onChange(null); };

  const handleFile = useCallback((file?: File | null) => {
    if (!file) return;
    setError(null);
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) { setError('Use a JPEG, PNG, or WebP image.'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('Image must be 5 MB or smaller.'); return; }
    const reader = new FileReader();
    reader.onload = () => setCropSrc(String(reader.result || ''));
    reader.onerror = () => setError('Failed to read image file.');
    reader.readAsDataURL(file);
  }, []);

  const uploadBlob = async (blob: Blob) => {
    setCropSrc(null);
    setBusy(true); setProgress(0); setError(null);
    try {
      const file = new File([blob], `upload-${Date.now()}.jpg`, { type: 'image/jpeg' });
      const up = await uploadsApi.upload(file, scope, setProgress);
      onChange({ url: up.url, thumbUrl: up.thumbUrl || up.url, key: up.key, thumbKey: up.thumbKey });
    } catch (e: any) {
      setError(e?.message || 'Upload failed');
    } finally {
      setBusy(false); setProgress(0);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDrag(false);
    if (disabled) return;
    handleFile(e.dataTransfer.files?.[0]);
  };

  return (
    <div className={className}>
      {label && <div className="text-sm font-medium text-fg mb-1">{label}</div>}
      <div
        className={`rounded-xl border border-dashed p-3 flex gap-3 items-start ${drag ? 'border-accent bg-accent/5' : 'border-border-strong bg-surface/30'} ${disabled ? 'opacity-60' : ''}`}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
      >
        <div className={`${shapeClass} rounded-lg border border-border bg-surface-sunken overflow-hidden flex items-center justify-center shrink-0`}>
          {previewUrl ? <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" width={160} height={160} loading="lazy" decoding="async" /> : <ImagePlus className="w-7 h-7 text-fg-subtle" />}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={pick} disabled={disabled || busy}><Upload className="w-4 h-4" />Choose image</Button>
            <Button type="button" variant="outline" size="sm" onClick={pickCamera} disabled={disabled || busy}><Camera className="w-4 h-4" />Camera</Button>
            {value?.url && <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={disabled || busy}><Trash2 className="w-4 h-4" />Remove</Button>}
          </div>
          <div className="text-xs text-fg-muted">{helpText || 'JPEG, PNG or WebP. Max 5 MB. Drag and drop, click, or use camera on mobile.'}</div>
          {busy && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs text-fg-muted"><Loader2 className="w-3.5 h-3.5 animate-spin" />Uploading… {progress}%</div>
              <div className="h-1.5 rounded bg-surface-sunken overflow-hidden"><div className="h-full bg-accent transition-all" style={{ width: `${progress}%` }} /></div>
            </div>
          )}
          {error && <div className="text-xs text-danger" role="alert">{error} <button type="button" className="underline ml-1" onClick={() => setError(null)}>Dismiss</button></div>}
        </div>
      </div>

      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e => { handleFile(e.target.files?.[0]); e.currentTarget.value = ''; }} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { handleFile(e.target.files?.[0]); e.currentTarget.value = ''; }} />

      {cropSrc && <CropModal src={cropSrc} aspect={aspect} onCancel={() => setCropSrc(null)} onConfirm={uploadBlob} />}
    </div>
  );
};

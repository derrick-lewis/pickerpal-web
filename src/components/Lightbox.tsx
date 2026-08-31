import { useCallback, useEffect, useRef, useState } from 'react';
import { AuthImage } from './AuthImage';

export interface LightboxProps {
  photoId: string;
  /** '/v1/photos' (own items) or '/v1/feed/photos' (the crowd feed). */
  basePath?: string;
  alt: string;
  onClose: () => void;
  /** Present when the gallery has multiple photos. */
  counter?: string;
  onStep?: (step: 1 | -1) => void;
}

const MIN_SCALE = 1;
const MAX_SCALE = 6;
const DOUBLE_CLICK_SCALE = 2.5;

/**
 * Full-screen photo viewer with real zoom — the level of scrutiny a maker's
 * mark deserves:
 *
 *  - scroll wheel (and trackpad pinch, which browsers deliver as
 *    ctrl+wheel) zooms anchored under the cursor;
 *  - drag pans while zoomed; two-finger touch pinches;
 *  - double-click toggles 1x ↔ 2.5x at the click point;
 *  - Escape resets the zoom first, then closes; clicking the backdrop
 *    closes only at 1x, so a pan can never fall out of the viewer.
 *
 * The transform lives on a full-viewport canvas div with origin 0,0, so
 * viewport coordinates ARE canvas coordinates and the anchored-zoom math
 * stays one line (same scheme as the app's ZoomableMap).
 */
export function Lightbox({ photoId, basePath = '/v1/photos', alt, onClose, counter, onStep }: LightboxProps) {
  const [transform, setTransform] = useState({ scale: 1, tx: 0, ty: 0 });
  const dragging = useRef(false);
  const dragMoved = useRef(false);
  const lastPoint = useRef({ x: 0, y: 0 });
  // Active pointers for touch pinch (id -> position).
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchDistance = useRef<number | null>(null);

  // A new photo starts fresh — carrying a zoom across a step disorients.
  useEffect(() => {
    setTransform({ scale: 1, tx: 0, ty: 0 });
  }, [photoId]);

  const zoomAt = useCallback((cx: number, cy: number, factor: number) => {
    setTransform((t) => {
      const scale = Math.min(Math.max(t.scale * factor, MIN_SCALE), MAX_SCALE);
      if (scale === t.scale) return t;
      const k = scale / t.scale;
      // Keep the point under the cursor fixed: screen = translate + scale*local.
      const tx = cx - k * (cx - t.tx);
      const ty = cy - k * (cy - t.ty);
      return scale <= MIN_SCALE ? { scale: 1, tx: 0, ty: 0 } : { scale, tx, ty };
    });
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setTransform((t) => {
          if (t.scale > 1) return { scale: 1, tx: 0, ty: 0 };
          onClose();
          return t;
        });
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    // Trackpad pinch arrives as ctrl+wheel with small deltas; plain wheel
    // zooms too — in a photo viewer nobody expects scroll to scroll.
    const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002));
    zoomAt(e.clientX, e.clientY, factor);
  }

  function handlePointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchDistance.current = Math.hypot(a.x - b.x, a.y - b.y);
    } else {
      dragging.current = true;
      dragMoved.current = false;
      lastPoint.current = { x: e.clientX, y: e.clientY };
    }
  }

  function handlePointerMove(e: React.PointerEvent) {
    const tracked = pointers.current.get(e.pointerId);
    if (!tracked) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2 && pinchDistance.current !== null) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (distance > 0 && pinchDistance.current > 0) {
        zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, distance / pinchDistance.current);
      }
      pinchDistance.current = distance;
      return;
    }

    if (dragging.current) {
      const dx = e.clientX - lastPoint.current.x;
      const dy = e.clientY - lastPoint.current.y;
      lastPoint.current = { x: e.clientX, y: e.clientY };
      if (Math.abs(dx) + Math.abs(dy) > 2) dragMoved.current = true;
      setTransform((t) => (t.scale > 1 ? { ...t, tx: t.tx + dx, ty: t.ty + dy } : t));
    }
  }

  function handlePointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchDistance.current = null;
    if (pointers.current.size === 0) dragging.current = false;
  }

  function handleBackdropClick() {
    // A drag that ends over the backdrop is a pan, not a close; a zoomed
    // view stays put too — Escape or × is the deliberate exit.
    if (dragMoved.current || transform.scale > 1) return;
    onClose();
  }

  function handleDoubleClick(e: React.MouseEvent) {
    if (transform.scale > 1) {
      setTransform({ scale: 1, tx: 0, ty: 0 });
    } else {
      zoomAt(e.clientX, e.clientY, DOUBLE_CLICK_SCALE);
    }
  }

  return (
    <div className="lightbox" role="dialog" aria-modal="true" onClick={handleBackdropClick}>
      <div
        className={`lightbox-canvas ${transform.scale > 1 ? 'lightbox-canvas--zoomed' : ''}`}
        style={{ transform: `translate(${transform.tx}px, ${transform.ty}px) scale(${transform.scale})` }}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={handleDoubleClick}
      >
        <AuthImage photoId={photoId} basePath={basePath} variant="file" alt={alt} />
      </div>
      {onStep && (
        <>
          <button
            type="button"
            className="gallery-arrow gallery-arrow--prev"
            onClick={(e) => {
              e.stopPropagation();
              onStep(-1);
            }}
            aria-label="Previous photo"
          >
            ‹
          </button>
          <button
            type="button"
            className="gallery-arrow gallery-arrow--next"
            onClick={(e) => {
              e.stopPropagation();
              onStep(1);
            }}
            aria-label="Next photo"
          >
            ›
          </button>
          {counter && <span className="gallery-counter">{counter}</span>}
        </>
      )}
      <button type="button" className="lightbox-close" aria-label="Close" onClick={onClose}>
        ×
      </button>
    </div>
  );
}

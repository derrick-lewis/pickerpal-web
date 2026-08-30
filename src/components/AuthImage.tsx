import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { apiFetchBlob } from '../api/client';
import { useAuth } from '../auth/AuthContext';

interface CacheEntry {
  url: string;
  refCount: number;
}

// Module-level cache so scrolling a list (which re-renders cards but keeps
// the same photo ids) doesn't refetch bytes already in hand. Entries are
// reference-counted: the object URL is only revoked once nothing is
// displaying it anymore.
const cache = new Map<string, CacheEntry>();

function acquire(key: string): CacheEntry | undefined {
  const entry = cache.get(key);
  if (entry) entry.refCount += 1;
  return entry;
}

function store(key: string, url: string): CacheEntry {
  // Two uncached mounts of the same key can race their fetches; keep the
  // first entry (and its refcount) and discard the newer URL, otherwise the
  // loser's release() would revoke an object URL the winner still displays.
  const existing = cache.get(key);
  if (existing) {
    URL.revokeObjectURL(url);
    existing.refCount += 1;
    return existing;
  }
  const entry: CacheEntry = { url, refCount: 1 };
  cache.set(key, entry);
  return entry;
}

function release(key: string) {
  const entry = cache.get(key);
  if (!entry) return;
  entry.refCount -= 1;
  if (entry.refCount <= 0) {
    URL.revokeObjectURL(entry.url);
    cache.delete(key);
  }
}

// The app renders thumbnails at 320px on the longest side
// (pickerpal src/lib/photoStorage.ts). Displayed larger than that — a grid
// card on any retina display — they're visibly soft, so 'auto' upgrades to
// the full-res file once the thumb has painted. The small slack means a
// card a hair over 320 physical px doesn't pay for a multi-MB original.
const THUMB_LONGEST_SIDE = 320;
const UPGRADE_SLACK = 40;

interface AuthImageProps {
  photoId: string;
  /**
   * Endpoint prefix for the photo bytes. Defaults to the owner surface;
   * the crowd feed passes '/v1/feed/photos', whose authorization is "is
   * this item published and its owner subscribed" rather than "is it mine".
   */
  basePath?: string;
  /**
   * 'thumb' and 'file' fetch that rendition eagerly. 'auto' is for images
   * whose ideal resolution depends on layout: it waits until the element
   * nears the viewport, paints the thumbnail immediately, and — when the
   * rendered size × devicePixelRatio outgrows the thumb — quietly swaps in
   * the full-res file after decoding it off-screen (no flash, no reflow).
   */
  variant: 'thumb' | 'file' | 'auto';
  alt: string;
  className?: string;
  /** Shown when the photo bytes can't be fetched (e.g. never uploaded). */
  fallback?: ReactNode;
}

export function AuthImage({ photoId, variant, alt, className, fallback, basePath = '/v1/photos' }: AuthImageProps) {
  const { token } = useAuth();
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  // 'auto' stays dormant until the element approaches the viewport, so a
  // long grid doesn't fetch every photo on mount.
  const [inView, setInView] = useState(variant !== 'auto');

  useEffect(() => {
    if (variant !== 'auto') return;
    const el = imgRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: '400px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [variant]);

  useEffect(() => {
    if (!token || !inView) return;
    // A new photoId on the same mount (e.g. the detail gallery flipping
    // photos) starts clean: blank + fade back in rather than showing the
    // previous photo under the new one's alt text.
    setSrc(null);
    setLoaded(false);
    setFailed(false);

    // Which renditions this mount will show, in paint order.
    const wantsUpgrade = () => {
      const el = imgRef.current;
      const cssPx = el ? el.getBoundingClientRect().width || el.parentElement?.clientWidth || 0 : 0;
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      return cssPx * dpr > THUMB_LONGEST_SIDE + UPGRADE_SLACK;
    };
    const plan: ('thumb' | 'file')[] =
      variant === 'file' ? ['file'] : variant === 'thumb' || !wantsUpgrade() ? ['thumb'] : ['thumb', 'file'];

    let cancelled = false;
    const held: string[] = [];

    const show = (url: string) => {
      // Decode before swapping so the upgrade never paints a half-decoded
      // frame; falls through on browsers without Image.decode.
      const probe = new Image();
      probe.src = url;
      const ready = probe.decode ? probe.decode().catch(() => undefined) : Promise.resolve();
      void ready.then(() => {
        if (!cancelled) setSrc(url);
      });
    };

    const load = (kind: 'thumb' | 'file') => {
      const key = `${basePath}/${photoId}:${kind}`;
      const existing = acquire(key);
      if (existing) {
        held.push(key);
        show(existing.url);
        return Promise.resolve(true);
      }
      return apiFetchBlob(`${basePath}/${photoId}/${kind}`, token)
        .then((blob) => {
          if (cancelled) return false;
          const entry = store(key, URL.createObjectURL(blob));
          held.push(key);
          show(entry.url);
          return true;
        })
        .catch(() => false);
    };

    void (async () => {
      let painted = false;
      for (const kind of plan) {
        if (cancelled) break;
        const ok = await load(kind);
        painted = painted || ok;
        // A missing thumb shouldn't sink the card if the file exists (and
        // vice versa): keep walking the plan.
      }
      if (!painted && !cancelled) setFailed(true);
    })();

    return () => {
      cancelled = true;
      held.forEach(release);
    };
  }, [photoId, variant, token, inView, basePath]);

  if (failed && fallback) {
    return <>{fallback}</>;
  }
  if (failed) {
    return <div className={className} aria-hidden="true" />;
  }
  return (
    <img
      ref={imgRef}
      src={src ?? undefined}
      alt={alt}
      className={`${className ?? ''} auth-img ${loaded ? 'auth-img-loaded' : ''}`.trim()}
      onLoad={() => setLoaded(true)}
      draggable={false}
    />
  );
}

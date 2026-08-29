import { useEffect, useState } from 'react';
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

interface AuthImageProps {
  photoId: string;
  variant: 'thumb' | 'file';
  alt: string;
  className?: string;
  /** Shown when the photo bytes can't be fetched (e.g. never uploaded). */
  fallback?: ReactNode;
}

export function AuthImage({ photoId, variant, alt, className, fallback }: AuthImageProps) {
  const { token } = useAuth();
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!token) return;
    setFailed(false);
    const key = `${photoId}:${variant}`;

    const existing = acquire(key);
    if (existing) {
      setSrc(existing.url);
      return () => release(key);
    }

    let cancelled = false;
    setSrc(null);
    apiFetchBlob(`/v1/photos/${photoId}/${variant}`, token)
      .then((blob) => {
        if (cancelled) return;
        const entry = store(key, URL.createObjectURL(blob));
        setSrc(entry.url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      release(key);
    };
  }, [photoId, variant, token]);

  if (failed && fallback) {
    return <>{fallback}</>;
  }
  if (failed || !src) {
    return <div className={className} aria-hidden="true" />;
  }
  return <img src={src} alt={alt} className={className} />;
}

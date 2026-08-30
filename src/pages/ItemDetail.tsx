import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchItem } from '../api/items';
import { ApiError } from '../api/client';
import type { ItemDetail as ItemDetailType } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { AuthImage } from '../components/AuthImage';
import { formatCents, formatDate } from '../lib/format';

export function ItemDetail() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const [item, setItem] = useState<ItemDetailType | null>(null);
  const [activePhoto, setActivePhoto] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!token || !id) return;
    setLoading(true);
    setError(null);
    setNotFound(false);
    fetchItem(token, id)
      .then((res) => {
        setItem(res);
        setActivePhoto(0);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
        } else {
          setError(err instanceof ApiError ? err.message : 'Failed to load item.');
        }
      })
      .finally(() => setLoading(false));
  }, [token, id]);

  const photos = item?.photos ?? [];
  const stepPhoto = useCallback(
    (step: 1 | -1) => {
      if (photos.length < 2) return;
      setActivePhoto((i) => (i + step + photos.length) % photos.length);
    },
    [photos.length],
  );

  // Arrow keys page the gallery; Escape leaves the lightbox. Attached at the
  // document so it works without the gallery holding focus.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') stepPhoto(1);
      else if (e.key === 'ArrowLeft') stepPhoto(-1);
      else if (e.key === 'Escape') setLightbox(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [stepPhoto]);

  if (loading) {
    return (
      <div>
        <Link to="/items" className="back-link">
          &larr; Back to items
        </Link>
        <div className="detail-layout" aria-busy="true">
          <div className="gallery-main shimmer" />
          <div>
            <div className="skeleton-line shimmer" style={{ width: '55%', height: '1.6rem' }} />
            <div className="skeleton-line shimmer" style={{ width: '35%' }} />
            <div className="skeleton-line shimmer" style={{ width: '25%', height: '1.4rem' }} />
          </div>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div>
        <Link to="/items" className="back-link">
          &larr; Back to items
        </Link>
        <p className="empty-state">This item couldn&rsquo;t be found.</p>
      </div>
    );
  }

  if (error || !item) {
    return (
      <div>
        <Link to="/items" className="back-link">
          &larr; Back to items
        </Link>
        <p className="error-banner">{error ?? 'Failed to load item.'}</p>
      </div>
    );
  }

  const currentPhoto = photos[activePhoto];
  const gone = item.status === 'unavailable';
  const previous = item.prices.length > 1 ? item.prices[1] : null;
  const priceDropped =
    previous !== null && item.priceCents !== null && item.priceCents < previous.priceCents;

  return (
    <div>
      <Link to="/items" className="back-link">
        &larr; Back to items
      </Link>

      <div className="detail-layout">
        <div className="gallery">
          <div className="gallery-main">
            {currentPhoto ? (
              <button
                type="button"
                className="gallery-zoom"
                onClick={() => setLightbox(true)}
                aria-label="View full screen"
              >
                <AuthImage
                  photoId={currentPhoto.id}
                  variant="file"
                  alt={item.makerName ?? item.categoryName ?? 'Item photo'}
                />
              </button>
            ) : (
              <span className="placeholder" aria-hidden="true">
                🕰️
              </span>
            )}
            {photos.length > 1 && (
              <>
                <button
                  type="button"
                  className="gallery-arrow gallery-arrow--prev"
                  onClick={() => stepPhoto(-1)}
                  aria-label="Previous photo"
                >
                  ‹
                </button>
                <button
                  type="button"
                  className="gallery-arrow gallery-arrow--next"
                  onClick={() => stepPhoto(1)}
                  aria-label="Next photo"
                >
                  ›
                </button>
                <span className="gallery-counter">
                  {activePhoto + 1} / {photos.length}
                </span>
              </>
            )}
          </div>
          {photos.length > 1 && (
            <div className="gallery-strip" role="tablist" aria-label="Photos">
              {photos.map((photo, i) => (
                <button
                  key={photo.id}
                  type="button"
                  role="tab"
                  aria-selected={i === activePhoto}
                  className={i === activePhoto ? 'active' : ''}
                  onClick={() => setActivePhoto(i)}
                >
                  <AuthImage photoId={photo.id} variant="thumb" alt={`Photo ${i + 1}`} />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="detail-info">
          <div className="detail-eyebrow">
            {[item.categoryName, item.subcategoryName].filter(Boolean).join(' · ') || 'Item'}
          </div>
          <h1 className="detail-heading">
            {item.makerName ?? 'Unmarked'}
            {item.makerUncertain && item.makerName && <span className="uncertain">?</span>}
          </h1>

          <div className="detail-priceline">
            <span className="detail-price">{formatCents(item.priceCents)}</span>
            {priceDropped && <s className="detail-was">{formatCents(previous.priceCents)}</s>}
            <span className={`status-chip ${gone ? 'status-chip--sold' : 'status-chip--available'}`}>
              {gone ? 'Gone' : 'Available'}
            </span>
          </div>

          <dl className="detail-facts">
            <div className="fact">
              <dt>Shop</dt>
              <dd>{item.storeName ?? '—'}</dd>
            </div>
            {(item.boothLabel || item.sellerCode) && (
              <div className="fact">
                <dt>Booth</dt>
                <dd>
                  {item.boothLabel ?? '—'}
                  {item.sellerCode ? ` · code ${item.sellerCode}` : ''}
                </dd>
              </div>
            )}
            <div className="fact">
              <dt>Found</dt>
              <dd>{formatDate(item.createdAt)}</dd>
            </div>
            {gone && item.soldAt && (
              <div className="fact">
                <dt>Gone since</dt>
                <dd>{formatDate(item.soldAt)}</dd>
              </div>
            )}
          </dl>

          {item.notes && (
            <div className="detail-notes-card">
              <div className="label">Notes</div>
              <div className="detail-notes">{item.notes}</div>
            </div>
          )}

          {item.prices.length > 1 && (
            <div className="detail-notes-card">
              <div className="label">Price history</div>
              <ul className="price-history">
                {item.prices.map((p, i) => {
                  const older = item.prices[i + 1];
                  const dir = older ? Math.sign(p.priceCents - older.priceCents) : 0;
                  return (
                    <li key={p.id}>
                      <span>{formatDate(p.recordedAt)}</span>
                      <span className={dir < 0 ? 'price-down' : dir > 0 ? 'price-up' : ''}>
                        {dir < 0 ? '↓ ' : dir > 0 ? '↑ ' : ''}
                        {formatCents(p.priceCents)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>

      {lightbox && currentPhoto && (
        <div className="lightbox" role="dialog" aria-modal="true" onClick={() => setLightbox(false)}>
          <AuthImage
            photoId={currentPhoto.id}
            variant="file"
            alt={item.makerName ?? item.categoryName ?? 'Item photo'}
          />
          {photos.length > 1 && (
            <>
              <button
                type="button"
                className="gallery-arrow gallery-arrow--prev"
                onClick={(e) => {
                  e.stopPropagation();
                  stepPhoto(-1);
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
                  stepPhoto(1);
                }}
                aria-label="Next photo"
              >
                ›
              </button>
              <span className="gallery-counter">
                {activePhoto + 1} / {photos.length}
              </span>
            </>
          )}
          <button type="button" className="lightbox-close" aria-label="Close">
            ×
          </button>
        </div>
      )}
    </div>
  );
}

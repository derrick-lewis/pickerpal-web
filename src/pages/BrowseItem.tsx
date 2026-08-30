import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { fetchFeedItem, type FeedDetail } from '../api/feed';
import { useAuth } from '../auth/AuthContext';
import { AuthImage } from '../components/AuthImage';
import { formatCents, formatDate } from '../lib/format';

/**
 * One published find, as the crowd sees it — the feed's twin of ItemDetail,
 * sharing its layout classes. Everything here came through the feed's
 * sanitized wire shape: the publisher's notes, price history, and booth map
 * are never served, and the seller code appears only on left_behind leads.
 */
export function BrowseItem() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const [item, setItem] = useState<FeedDetail | null>(null);
  const [activePhoto, setActivePhoto] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!token || !id) return;
    setLoading(true);
    setError(null);
    setNotFound(false);
    fetchFeedItem(token, id)
      .then((res) => {
        setItem(res);
        setActivePhoto(0);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
        } else {
          setError(err instanceof ApiError ? err.message : 'Failed to load this find.');
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

  if (loading) {
    return <p className="loading-state">Loading…</p>;
  }
  if (notFound) {
    return (
      <div className="section">
        <h2>This find is gone</h2>
        <p>It may have been made private, or its publisher&rsquo;s subscription lapsed.</p>
        <Link to="/browse" className="btn btn-secondary">
          Back to Finds
        </Link>
      </div>
    );
  }
  if (error || !item) {
    return <p className="form-error">{error ?? 'Something went wrong.'}</p>;
  }

  const currentPhoto = photos[activePhoto];
  const sold = item.status === 'sold';
  const whereLine = [item.storeName, [item.storeCity, item.storeState].filter(Boolean).join(', ')]
    .filter(Boolean)
    .join(' — ');

  return (
    <div>
      <Link to="/browse" className="back-link">
        &larr; Back to Finds
      </Link>

      <div className="detail-layout">
        <div className="gallery">
          <div className="gallery-main">
            {currentPhoto ? (
              <AuthImage
                photoId={currentPhoto.id}
                basePath="/v1/feed/photos"
                variant={currentPhoto.hasFile ? 'file' : 'thumb'}
                alt={item.makerName ?? item.categoryName ?? 'Find photo'}
              />
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
                  <AuthImage photoId={photo.id} basePath="/v1/feed/photos" variant="thumb" alt={`Photo ${i + 1}`} />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="detail-info">
          <div className="detail-eyebrow">
            {item.visibility === 'left_behind' ? 'Left behind' : 'Bought'}
            {item.isMine ? ' · from your catalog' : ''}
          </div>
          <h1 className="detail-heading">
            {item.makerName ?? item.categoryName ?? 'Unmarked'}
            {item.makerUncertain && item.makerName && <span className="uncertain">?</span>}
          </h1>

          <div className="detail-priceline">
            <span className="detail-price">{formatCents(item.priceCents)}</span>
            <span className={`status-chip ${sold ? 'status-chip--sold' : 'status-chip--available'}`}>
              {sold ? 'Sold' : 'Available'}
            </span>
          </div>

          <dl className="detail-facts">
            {item.makerName && (item.categoryName || item.subcategoryName) && (
              <div className="fact">
                <dt>Category</dt>
                <dd>{[item.categoryName, item.subcategoryName].filter(Boolean).join(' · ')}</dd>
              </div>
            )}
            <div className="fact">
              <dt>Shop</dt>
              <dd>{whereLine || '—'}</dd>
            </div>
            {item.sellerCode != null && (
              <div className="fact">
                <dt>Seller code</dt>
                <dd>{item.sellerCode}</dd>
              </div>
            )}
            <div className="fact">
              <dt>{item.visibility === 'left_behind' ? 'Spotted' : 'Cataloged'}</dt>
              <dd>{formatDate(item.createdAt)}</dd>
            </div>
          </dl>

          {item.visibility === 'left_behind' && (
            <div className="detail-notes-card">
              <div className="label">Heads up</div>
              <div className="detail-notes">
                A live lead ages fast — another picker may have already grabbed it.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

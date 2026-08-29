import { useEffect, useState } from 'react';
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

  if (loading) {
    return <p className="loading-state">Loading…</p>;
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

  const photos = item.photos ?? [];
  const currentPhoto = photos[activePhoto];

  return (
    <div>
      <Link to="/items" className="back-link">
        &larr; Back to items
      </Link>

      <div className="detail-layout">
        <div>
          <div className="gallery-main">
            {currentPhoto ? (
              <AuthImage photoId={currentPhoto.id} variant="file" alt={item.categoryName ?? 'Item photo'} />
            ) : (
              <span className="placeholder" aria-hidden="true">
                🕰️
              </span>
            )}
          </div>
          {photos.length > 1 && (
            <div className="gallery-strip">
              {photos.map((photo, i) => (
                <button
                  key={photo.id}
                  type="button"
                  className={i === activePhoto ? 'active' : ''}
                  onClick={() => setActivePhoto(i)}
                >
                  <AuthImage photoId={photo.id} variant="thumb" alt={`Photo ${i + 1}`} />
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <h1 className="detail-heading">
            {item.makerName ?? item.categoryName ?? 'Unknown item'}
            {item.makerUncertain && item.makerName && <span className="detail-uncertain">?</span>}
          </h1>
          {(item.categoryName || item.subcategoryName) && (
            <p className="detail-cats">
              {[item.categoryName, item.subcategoryName].filter(Boolean).join(' · ')}
            </p>
          )}

          <div className="detail-priceline">
            <span className="detail-price">{formatCents(item.priceCents)}</span>
            <span className={`badge ${item.status === 'sold' ? 'badge-sold' : 'badge-available'}`}>
              {item.status}
            </span>
          </div>

          <div className="detail-card">
            <div className="label">Store</div>
            <div>{item.storeName ?? '—'}</div>
          </div>

          {(item.boothLabel || item.sellerCode) && (
            <div className="detail-card">
              <div className="label">Booth</div>
              <div>
                {item.boothLabel ?? '—'}
                {item.sellerCode ? ` · seller code ${item.sellerCode}` : ''}
              </div>
            </div>
          )}

          {item.status === 'sold' && item.soldAt && (
            <div className="detail-card">
              <div className="label">Sold</div>
              <div>{formatDate(item.soldAt)}</div>
            </div>
          )}

          {item.notes && (
            <div className="detail-card">
              <div className="label">Notes</div>
              <div className="detail-notes">{item.notes}</div>
            </div>
          )}

          {item.prices.length > 0 && (
            <div className="detail-card">
              <div className="label">Price history</div>
              <ul className="price-history">
                {item.prices.map((p) => (
                  <li key={p.id}>
                    <span>{formatDate(p.recordedAt)}</span>
                    <span>{formatCents(p.priceCents)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

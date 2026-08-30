import { Link } from 'react-router-dom';
import type { Entry } from '../api/types';
import { formatCents } from '../lib/format';
import { AuthImage } from './AuthImage';

/**
 * One find in the grid. Image-forward: the photo owns the card, with the
 * status told on the photo itself (a Sold scrim, a photo-count chip) and the
 * words kept to the three things a picker scans for — maker, where, price.
 * "Unmarked" is the trade's word for a piece with no maker attribution.
 */
export function ItemCard({ item }: { item: Entry }) {
  const sold = item.status === 'sold';
  const priceDropped =
    item.previousPriceCents !== null &&
    item.priceCents !== null &&
    item.priceCents < item.previousPriceCents;

  return (
    <Link to={`/items/${item.id}`} className={`item-card ${sold ? 'item-card--sold' : ''}`}>
      <div className="item-card-thumb">
        {item.firstPhotoId ? (
          <AuthImage
            photoId={item.firstPhotoId}
            variant="auto"
            alt=""
            className="item-card-thumb-img"
            fallback={
              <span className="placeholder" aria-hidden="true">
                🕰️
              </span>
            }
          />
        ) : (
          <span className="placeholder" aria-hidden="true">
            🕰️
          </span>
        )}
        {sold && <span className="item-card-scrim">Sold</span>}
        {item.photoCount > 1 && (
          <span className="item-card-count" aria-label={`${item.photoCount} photos`}>
            {item.photoCount}
          </span>
        )}
      </div>
      <div className="item-card-body">
        <div className="item-card-maker">
          {item.makerName ?? 'Unmarked'}
          {item.makerUncertain && item.makerName && <span className="uncertain">?</span>}
        </div>
        <div className="item-card-store">{item.storeName ?? '—'}</div>
        <div className="item-card-footer">
          <span className="item-card-price">
            {formatCents(item.priceCents)}
            {priceDropped && (
              <s className="item-card-was">{formatCents(item.previousPriceCents)}</s>
            )}
          </span>
        </div>
      </div>
    </Link>
  );
}

/** Placeholder card shown while the first page loads; pure shimmer. */
export function ItemCardSkeleton() {
  return (
    <div className="item-card item-card--skeleton" aria-hidden="true">
      <div className="item-card-thumb shimmer" />
      <div className="item-card-body">
        <div className="skeleton-line shimmer" style={{ width: '70%' }} />
        <div className="skeleton-line shimmer" style={{ width: '45%' }} />
        <div className="skeleton-line shimmer" style={{ width: '30%' }} />
      </div>
    </div>
  );
}

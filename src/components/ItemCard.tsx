import { Link } from 'react-router-dom';
import type { Entry } from '../api/types';
import { formatCents } from '../lib/format';
import { AuthImage } from './AuthImage';

export function ItemCard({ item }: { item: Entry }) {
  return (
    <Link to={`/items/${item.id}`} className="item-card">
      <div className="item-card-thumb">
        {item.firstPhotoId ? (
          <AuthImage
            photoId={item.firstPhotoId}
            variant="thumb"
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
      </div>
      <div className="item-card-body">
        <div className="item-card-maker">
          {item.makerName ?? 'Unknown maker'}
          {item.makerUncertain && item.makerName && '?'}
        </div>
        <div className="item-card-store">{item.storeName ?? '—'}</div>
        <div className="item-card-footer">
          <span className="item-card-price">{formatCents(item.priceCents)}</span>
          <span className={`badge ${item.status === 'sold' ? 'badge-sold' : 'badge-available'}`}>
            {item.status}
          </span>
        </div>
      </div>
    </Link>
  );
}

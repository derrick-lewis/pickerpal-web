import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <div className="empty-state">
      <h1>Page not found</h1>
      <p>
        <Link to="/">Back home</Link>
      </p>
    </div>
  );
}

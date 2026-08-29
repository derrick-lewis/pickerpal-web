import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function NavBar() {
  const { token, user, signOut } = useAuth();
  const navigate = useNavigate();

  function handleSignOut() {
    signOut();
    navigate('/');
  }

  return (
    <nav className="nav">
      <div className="nav-inner">
        <Link to="/" className="nav-brand">
          PickerPal
        </Link>
        <div className="nav-actions">
          {token && (
            <Link to="/items" className="nav-link">
              Items
            </Link>
          )}
          {token && user && <span className="nav-user">{user.email}</span>}
          {token ? (
            <button type="button" className="btn-link" onClick={handleSignOut}>
              Sign out
            </button>
          ) : (
            <>
              <Link to="/login" className="nav-link">
                Sign in
              </Link>
              <Link to="/signup" className="btn btn-primary">
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

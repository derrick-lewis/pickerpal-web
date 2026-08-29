import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function Home() {
  const { token } = useAuth();

  return (
    <div>
      <div className="hero">
        <h1>PickerPal</h1>
        <p className="tagline">Catalog your antique finds.</p>

        <p>
          PickerPal is an iPhone app for antique pickers: snap a photo of an item, tag its category and
          price, and pin it to the store&rsquo;s booth map so you can walk straight back to it next visit.
        </p>

        <div className="hero-actions">
          {token ? (
            <Link to="/items" className="btn btn-primary">
              Go to my items
            </Link>
          ) : (
            <>
              <Link to="/signup" className="btn btn-primary">
                Sign up
              </Link>
              <Link to="/login" className="btn btn-secondary">
                Sign in
              </Link>
            </>
          )}
        </div>
      </div>

      <div className="section">
        <h2>Support</h2>
        <p>
          Questions, bug reports, or feature ideas? Email{' '}
          <a href="mailto:pickerpal.support@gmail.com">pickerpal.support@gmail.com</a> and you&rsquo;ll
          hear back within a few days.
        </p>
      </div>

      <div className="section">
        <h2>Frequently asked</h2>
        <p>
          <strong>Where is my data stored?</strong>
          <br />
          Entirely on your device. Signing in to sync your catalog to the web is optional — deleting the
          app deletes any items you haven&rsquo;t synced, so export photos you care about first (Settings
          &rarr; Save photos to Photos library).
        </p>

        <p>
          <strong>How do I remove ads?</strong>
          <br />
          Settings &rarr; Remove ads. It&rsquo;s a one-time purchase. Already bought it on another device?
          Use Restore purchases.
        </p>

        <p>
          <strong>Why does PickerPal ask for my location?</strong>
          <br />
          To suggest the store you&rsquo;re standing in and to search for shops near you. Location is used
          on-device and never sent to us — see the <a href="/privacy.html">privacy policy</a>.
        </p>
      </div>

      <footer className="page-footer">
        &copy; 2026 Derrick Lewis &middot; <a href="/privacy.html">Privacy policy</a>
      </footer>
    </div>
  );
}

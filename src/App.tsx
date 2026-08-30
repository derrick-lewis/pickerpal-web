import { Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { NavBar } from './components/NavBar';
import { ForgotPassword } from './pages/ForgotPassword';
import { Home } from './pages/Home';
import { ItemDetail } from './pages/ItemDetail';
import { ItemsList } from './pages/ItemsList';
import { Browse } from './pages/Browse';
import { BrowseItem } from './pages/BrowseItem';
import { Login } from './pages/Login';
import { NotFound } from './pages/NotFound';
import { ResetPassword } from './pages/ResetPassword';
import { Signup } from './pages/Signup';
import { VerifyEmail } from './pages/VerifyEmail';

export function App() {
  return (
    <>
      <NavBar />
      <main className="page">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route
            path="/items"
            element={
              <ProtectedRoute>
                <ItemsList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/items/:id"
            element={
              <ProtectedRoute>
                <ItemDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/browse"
            element={
              <ProtectedRoute requireTier="plus">
                <Browse />
              </ProtectedRoute>
            }
          />
          <Route
            path="/browse/:id"
            element={
              <ProtectedRoute requireTier="plus">
                <BrowseItem />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </>
  );
}

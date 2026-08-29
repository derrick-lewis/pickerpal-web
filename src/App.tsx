import { Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { NavBar } from './components/NavBar';
import { Home } from './pages/Home';
import { ItemDetail } from './pages/ItemDetail';
import { ItemsList } from './pages/ItemsList';
import { Login } from './pages/Login';
import { NotFound } from './pages/NotFound';
import { Signup } from './pages/Signup';

export function App() {
  return (
    <>
      <NavBar />
      <main className="page">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
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
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </>
  );
}

import { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './routes/ProtectedRoute';

// Layouts
import { Layout } from '../features/header/Layout';

// Auth Pages
import Login from '../pages/Login';
import VerifySuccess from '../pages/VerifySuccess';

// Feature Pages
import { MoviesPage } from '../features/movies/pages/MoviesPage';
import { ShowsPage } from '../features/shows/pages/ShowsPage';
import { UpcomingPage } from '../features/upcoming/pages/UpcomingPage';

// Components
import { WelcomeSplash } from '../features/auth/components/WelcomeSplash';

// This flag resets to false on every page refresh (full JS reload),
// but stays true during in-app navigation.
let initialSplashShown = false;

/**
 * App Router
 * Centralized route definitions for the application.
 */
export const AppRouter = () => {
  // Welcome Splash Logic (Handles first-time, returning, and simple session entry)
  const [welcomeData, setWelcomeData] = useState<{ show: boolean, type: 'welcome' | 'returning' | 'entry' }>(() => {
    const showSignupWelcome = sessionStorage.getItem('show_welcome') === 'true';
    if (showSignupWelcome) {
      const type = (sessionStorage.getItem('splash_type') as 'welcome' | 'returning') || 'welcome';
      return { show: true, type };
    }

    // If no explicit signup/signin welcome, show the 1s entry splash on every refresh/boot
    if (!initialSplashShown) {
      return { show: true, type: 'entry' };
    }

    return { show: false, type: 'welcome' };
  });

  const handleWelcomeComplete = () => {
    setWelcomeData({ show: false, type: 'welcome' });
    sessionStorage.removeItem('show_welcome');
    sessionStorage.removeItem('splash_type');
    initialSplashShown = true; // Prevents splash on in-app navigation, but resets on refresh
  };

  return (
    <>
      {welcomeData.show && (
        <WelcomeSplash
          type={welcomeData.type}
          onComplete={handleWelcomeComplete}
        />
      )}
      <Routes>
        {/* Public Routes */}
        <Route path="/auth" element={<Login />} />
        <Route path="/auth/verified" element={<VerifySuccess />} />

        {/* Protected Routes */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          {/* Default redirect */}
          <Route index element={<Navigate to="/upcoming/onOTT" replace />} />

          {/* Movies Routes */}
          <Route path="movies" element={<Navigate to="/movies/unwatched" replace />} />
          <Route path="movies/:status" element={<MoviesPage />} />

          {/* Shows Routes */}
          <Route path="shows" element={<Navigate to="/shows/watching" replace />} />
          <Route path="shows/:status" element={<ShowsPage />} />

          {/* Upcoming Routes */}
          <Route path="upcoming" element={<Navigate to="/upcoming/onOTT" replace />} />
          <Route path="upcoming/:status" element={<UpcomingPage />} />

          {/* Games Routes (placeholder) */}
          <Route path="games" element={<Navigate to="/games/unplayed" replace />} />
          <Route path="games/:status" element={<div />} />
        </Route>

        {/* 404 Catch-All */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
};

export default AppRouter;

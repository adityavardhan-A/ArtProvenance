import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { WalletProvider } from './contexts/WalletContext';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import DashboardPage from './pages/DashboardPage';
import AccountPage from './pages/AccountPage';
import ManageArtworksPage from './pages/ManageArtworksPage';
import { lazy, Suspense } from 'react';
import LoadingSpinner from './components/LoadingSpinner';

// The explorer is the largest page; load it only when someone opens it.
const ExplorerPage = lazy(() => import('./pages/ExplorerPage'));

function App() {
  return (
    <Router>
      <AuthProvider>
        <WalletProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route 
            path="/dashboard" 
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/account" 
            element={
              <ProtectedRoute>
                <AccountPage />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/manage-artworks" 
            element={
              <ProtectedRoute>
                <ManageArtworksPage />
              </ProtectedRoute>
            } 
          />
          <Route path="/explorer" element={<ProtectedRoute><Suspense fallback={<LoadingSpinner />}><ExplorerPage view="overview" /></Suspense></ProtectedRoute>} />
          <Route path="/explorer/block/:id" element={<ProtectedRoute><Suspense fallback={<LoadingSpinner />}><ExplorerPage view="block" /></Suspense></ProtectedRoute>} />
          <Route path="/explorer/tx/:id" element={<ProtectedRoute><Suspense fallback={<LoadingSpinner />}><ExplorerPage view="tx" /></Suspense></ProtectedRoute>} />
          <Route path="/explorer/address/:address" element={<ProtectedRoute><Suspense fallback={<LoadingSpinner />}><ExplorerPage view="address" /></Suspense></ProtectedRoute>} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Routes>
        </WalletProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
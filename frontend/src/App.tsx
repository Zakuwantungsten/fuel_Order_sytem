import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AmendedDOsProvider } from './contexts/AmendedDOsContext';
import Login from './components/Login';
import ProtectedRoute, { UnauthorizedPage } from './components/ProtectedRoute';
import EnhancedDashboard from './components/EnhancedDashboard';
import { RESOURCES, ACTIONS } from './utils/permissions';

// App content with authentication
function AppContent() {
  const { isAuthenticated, isLoading, user, logout } = useAuth();

  // Show loading spinner during authentication check
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center transition-colors">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 max-w-md w-full mx-4">
          <div className="flex items-center justify-center space-x-3 mb-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            <span className="text-gray-700 dark:text-gray-200 font-medium">Loading...</span>
          </div>
        </div>
      </div>
    );
  }

  // Show login if not authenticated
  if (!isAuthenticated) {
    return <Login />;
  }

  // Show enhanced dashboard for authenticated users
  // Note: We don't require DASHBOARD permission here because import/export officers
  // don't have that permission but should still access the system
  return (
    <Routes>
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <EnhancedDashboard user={user} onLogout={logout} />
          </ProtectedRoute>
        }
      />
      <Route path="/unauthorized" element={<UnauthorizedPage />} />
      <Route path="/login" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <AmendedDOsProvider>
        <Router>
          <AppContent />
        </Router>
      </AmendedDOsProvider>
    </AuthProvider>
  );
}

export default App;

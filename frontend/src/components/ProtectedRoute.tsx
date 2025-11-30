import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Shield, AlertTriangle } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredPermission?: {
    resource: string;
    action: string;
  };
  allowedRoles?: Array<string>;
  fallbackPath?: string;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requiredPermission,
  allowedRoles,
  fallbackPath = '/unauthorized',
}) => {
  const { isAuthenticated, user, hasPermission, isLoading } = useAuth();
  const location = useLocation();

  // Show loading spinner while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center transition-colors">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 max-w-md w-full mx-4 transition-colors">
          <div className="flex items-center justify-center space-x-3 mb-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            <span className="text-gray-700 dark:text-gray-200 font-medium">Checking authentication...</span>
          </div>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Check role-based access if allowedRoles is specified
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={fallbackPath} replace />;
  }

  // Check permission-based access if requiredPermission is specified
  if (requiredPermission) {
    const { resource, action } = requiredPermission;
    if (!hasPermission(resource, action)) {
      return <Navigate to={fallbackPath} replace />;
    }
  }

  // User is authenticated and authorized
  return <>{children}</>;
};

// Unauthorized page component
export const UnauthorizedPage: React.FC = () => {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center p-4 transition-colors">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 max-w-md w-full mx-4 text-center transition-colors">
        <div className="flex justify-center mb-6">
          <div className="bg-red-100 rounded-full p-4">
            <AlertTriangle className="w-12 h-12 text-red-600" />
          </div>
        </div>
        
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">Access Denied</h1>
        
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          You don't have permission to access this page. Please contact your administrator 
          if you believe this is an error.
        </p>
        
        {user && (
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-6">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              <span className="font-medium">Current Role:</span> {user.role.replace('_', ' ').toUpperCase()}
            </p>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              <span className="font-medium">Username:</span> {user.username}
            </p>
          </div>
        )}
        
        <div className="space-y-3">
          <button
            onClick={() => window.history.back()}
            className="w-full bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
          >
            Go Back
          </button>
          
          <button
            onClick={() => window.location.href = '/'}
            className="w-full bg-primary-600 hover:bg-primary-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
};

// Permission Guard Component - for inline permission checking
interface PermissionGuardProps {
  children: React.ReactNode;
  resource: string;
  action: string;
  fallback?: React.ReactNode;
  showFallback?: boolean;
}

export const PermissionGuard: React.FC<PermissionGuardProps> = ({
  children,
  resource,
  action,
  fallback = null,
  showFallback = false,
}) => {
  const { hasPermission } = useAuth();

  if (!hasPermission(resource, action)) {
    if (showFallback && fallback) {
      return <>{fallback}</>;
    }
    
    if (showFallback) {
      return (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
          <Shield className="w-6 h-6 text-yellow-600 mx-auto mb-2" />
          <p className="text-sm text-yellow-800">
            Insufficient permissions to view this content
          </p>
          <p className="text-xs text-yellow-700 mt-1">
            Required: {action} on {resource}
          </p>
        </div>
      );
    }
    
    return null;
  }

  return <>{children}</>;
};

// Role Guard Component - for role-based rendering
interface RoleGuardProps {
  children: React.ReactNode;
  allowedRoles: Array<string>;
  fallback?: React.ReactNode;
  showFallback?: boolean;
}

export const RoleGuard: React.FC<RoleGuardProps> = ({
  children,
  allowedRoles,
  fallback = null,
  showFallback = false,
}) => {
  const { user } = useAuth();

  if (!user || !allowedRoles.includes(user.role)) {
    if (showFallback && fallback) {
      return <>{fallback}</>;
    }
    
    if (showFallback) {
      return (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
          <Shield className="w-6 h-6 text-yellow-600 mx-auto mb-2" />
          <p className="text-sm text-yellow-800">
            Insufficient role permissions
          </p>
          <p className="text-xs text-yellow-700 mt-1">
            Required roles: {allowedRoles.join(', ')}
          </p>
        </div>
      );
    }
    
    return null;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
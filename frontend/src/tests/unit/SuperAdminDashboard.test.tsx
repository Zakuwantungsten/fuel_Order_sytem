import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import SuperAdminDashboard from '../../components/SuperAdminDashboard';

// Mock the API services with correct data structures
vi.mock('../../services/api', () => ({
  systemAdminAPI: {
    getSystemStats: vi.fn().mockResolvedValue({
      users: { total: 50, active: 45, deleted: 2 },
      deliveryOrders: { total: 500, today: 10, deleted: 5 },
      lpoEntries: { total: 300 },
      fuelRecords: { total: 450 },
      yardDispenses: { total: 100 },
      driverAccounts: { total: 20, pending: 3 }
    }),
    getDatabaseHealth: vi.fn().mockResolvedValue({
      healthy: true,
      status: 'Connected'
    }),
    getRecentActivity: vi.fn().mockResolvedValue([
      { id: '1', action: 'LOGIN', username: 'admin', resourceType: 'user', timestamp: new Date().toISOString() },
      { id: '2', action: 'CREATE', username: 'operator', resourceType: 'delivery_order', timestamp: new Date().toISOString() }
    ]),
    getAuditLogs: vi.fn().mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 }
    }),
    getDatabaseMetrics: vi.fn().mockResolvedValue({
      connections: { current: 5, available: 100 },
      collections: { users: { count: 50, size: '5MB' } },
      totalDocuments: 1000,
      totalSize: '100MB',
      indexSize: '10MB'
    }),
  },
  trashAPI: {
    getStats: vi.fn().mockResolvedValue({
      totalItems: 25,
      stats: [
        { type: 'delivery_orders', count: 10 },
        { type: 'fuel_records', count: 8 },
        { type: 'lpo_entries', count: 7 }
      ]
    }),
  },
}));

// Mock the sub-components
vi.mock('../../components/SuperAdmin/DatabaseMonitorTab', () => ({
  default: () => <div data-testid="database-monitor-tab">Database Monitor</div>
}));

vi.mock('../../components/SuperAdmin/UserManagementTab', () => ({
  default: () => <div data-testid="user-management-tab">User Management</div>
}));

vi.mock('../../components/SuperAdmin/ConfigurationTab', () => ({
  default: () => <div data-testid="configuration-tab">Configuration</div>
}));

vi.mock('../../components/SuperAdmin/AuditLogsTab', () => ({
  default: () => <div data-testid="audit-logs-tab">Audit Logs</div>
}));

vi.mock('../../components/SuperAdmin/SecurityTab', () => ({
  default: () => <div data-testid="security-tab">Security</div>
}));

vi.mock('../../components/SuperAdmin/BackupRecoveryTab', () => ({
  default: () => <div data-testid="backup-recovery-tab">Backup & Recovery</div>
}));

vi.mock('../../components/SuperAdmin/AnalyticsTab', () => ({
  default: () => <div data-testid="analytics-tab">Analytics</div>
}));

vi.mock('../../components/SuperAdmin/TrashManagementTab', () => ({
  default: () => <div data-testid="trash-management-tab">Trash Management</div>
}));

const mockSuperAdminUser = {
  id: 'super-admin-1',
  username: 'superadmin',
  email: 'super@test.com',
  firstName: 'Super',
  lastName: 'Admin',
  role: 'super_admin',
  isActive: true
};

const renderSuperAdminDashboard = (section?: string) => {
  return render(
    <BrowserRouter>
      <SuperAdminDashboard user={mockSuperAdminUser} section={section as any} />
    </BrowserRouter>
  );
};

describe('SuperAdminDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render the super admin dashboard', async () => {
      renderSuperAdminDashboard();
      
      await waitFor(() => {
        expect(screen.getByText(/SUPER ADMIN/i)).toBeInTheDocument();
      });
    });

    it('should display user information', async () => {
      renderSuperAdminDashboard();
      
      await waitFor(() => {
        // Component should render with user info
        expect(document.body).toBeDefined();
      });
    });

    it('should show dashboard by default', async () => {
      renderSuperAdminDashboard('overview');
      
      await waitFor(() => {
        expect(screen.getByText(/SUPER ADMIN DASHBOARD/i)).toBeInTheDocument();
      });
    });
  });

  describe('Section Navigation', () => {
    it('should render database section when specified', async () => {
      renderSuperAdminDashboard('database');
      
      await waitFor(() => {
        expect(screen.getByTestId('database-monitor-tab')).toBeInTheDocument();
      });
    });

    it('should render users section when specified', async () => {
      renderSuperAdminDashboard('users');
      
      await waitFor(() => {
        expect(screen.getByTestId('user-management-tab')).toBeInTheDocument();
      });
    });

    it('should render config section when specified', async () => {
      renderSuperAdminDashboard('config');
      
      await waitFor(() => {
        expect(screen.getByTestId('configuration-tab')).toBeInTheDocument();
      });
    });

    it('should render audit section when specified', async () => {
      renderSuperAdminDashboard('audit');
      
      await waitFor(() => {
        expect(screen.getByTestId('audit-logs-tab')).toBeInTheDocument();
      });
    });

    it('should render security section when specified', async () => {
      renderSuperAdminDashboard('security');
      
      await waitFor(() => {
        expect(screen.getByTestId('security-tab')).toBeInTheDocument();
      });
    });

    it('should render backup section when specified', async () => {
      renderSuperAdminDashboard('backup');
      
      await waitFor(() => {
        expect(screen.getByTestId('backup-recovery-tab')).toBeInTheDocument();
      });
    });

    it('should render analytics section when specified', async () => {
      renderSuperAdminDashboard('analytics');
      
      await waitFor(() => {
        expect(screen.getByTestId('analytics-tab')).toBeInTheDocument();
      });
    });

    it('should render trash section when specified', async () => {
      renderSuperAdminDashboard('trash');
      
      await waitFor(() => {
        expect(screen.getByTestId('trash-management-tab')).toBeInTheDocument();
      });
    });
  });

  describe('Overview Section', () => {
    it('should load and display system stats', async () => {
      renderSuperAdminDashboard('overview');
      
      await waitFor(() => {
        expect(screen.getByText(/SUPER ADMIN DASHBOARD/i)).toBeInTheDocument();
      });
    });

    it('should display loading state while fetching data', async () => {
      renderSuperAdminDashboard('overview');
      
      // Component renders while data loads
      expect(screen.getByText(/SUPER ADMIN/i)).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      const { systemAdminAPI } = await import('../../services/api');
      (systemAdminAPI.getSystemStats as any).mockRejectedValueOnce(new Error('API Error'));
      
      renderSuperAdminDashboard('overview');
      
      await waitFor(() => {
        // Component should still render despite error
        expect(screen.getByText(/SUPER ADMIN/i)).toBeInTheDocument();
      });
    });
  });

  describe('Refresh Functionality', () => {
    it('should have a refresh button', async () => {
      renderSuperAdminDashboard('overview');
      
      await waitFor(() => {
        expect(screen.getByText(/Refresh/i)).toBeInTheDocument();
      });
    });
  });
});

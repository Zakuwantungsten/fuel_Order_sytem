import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import AdminDashboard from '../../components/AdminDashboard';

// Mock the API services with correct structure
vi.mock('../../services/api', () => ({
  adminAPI: {
    getStats: vi.fn().mockResolvedValue({
      users: { total: 20, active: 18, inactive: 2 },
      records: { deliveryOrders: 100, lpos: 60, fuelRecords: 85, yardDispenses: 30 },
      roleDistribution: [{ role: 'admin', count: 5 }],
      recentUsers: []
    }),
  },
}));

// Mock the sub-components - passing the correct prop name 'showMessage' that component uses
vi.mock('../../components/StandardAdmin/OperationalOverviewTab', () => ({
  default: ({ stats, onRefresh }: any) => (
    <div data-testid="operational-overview-tab">
      <h2>Operational Overview</h2>
      {stats && <span data-testid="stats-loaded">Stats Loaded</span>}
      <button onClick={onRefresh}>Refresh</button>
    </div>
  )
}));

vi.mock('../../components/StandardAdmin/DataManagementTab', () => ({
  default: ({ showMessage }: any) => (
    <div data-testid="data-management-tab">
      <h2>Data Management</h2>
      <button onClick={() => showMessage && showMessage('success', 'Test message')}>Show Message</button>
    </div>
  )
}));

vi.mock('../../components/StandardAdmin/UserSupportTab', () => ({
  default: ({ showMessage }: any) => (
    <div data-testid="user-support-tab">
      <h2>User Support</h2>
    </div>
  )
}));

vi.mock('../../components/StandardAdmin/BasicReportsTab', () => ({
  default: ({ showMessage }: any) => (
    <div data-testid="basic-reports-tab">
      <h2>Basic Reports</h2>
    </div>
  )
}));

vi.mock('../../components/StandardAdmin/QuickActionsPanel', () => ({
  default: ({ showMessage }: any) => (
    <div data-testid="quick-actions-panel">
      <h2>Quick Actions</h2>
      <button onClick={() => showMessage && showMessage('success', 'Action completed')}>Quick Action</button>
    </div>
  )
}));

const mockStandardAdminUser = {
  id: 'std-admin-1',
  username: 'stdadmin',
  email: 'stdadmin@test.com',
  firstName: 'Standard',
  lastName: 'Admin',
  role: 'admin',
  isActive: true
};

const renderAdminDashboard = (section: string = 'overview') => {
  return render(
    <BrowserRouter>
      <AdminDashboard user={mockStandardAdminUser} section={section as any} />
    </BrowserRouter>
  );
};

describe('AdminDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render the admin dashboard', async () => {
      renderAdminDashboard();
      
      await waitFor(() => {
        expect(screen.getByText(/Operational Overview/i)).toBeInTheDocument();
      });
    });

    it('should display user name and role', async () => {
      renderAdminDashboard();
      
      await waitFor(() => {
        expect(screen.getByText(/Standard Admin/i)).toBeInTheDocument();
      });
    });

    it('should show the correct section title', async () => {
      renderAdminDashboard('overview');
      
      await waitFor(() => {
        expect(screen.getByText(/Operational Overview/i)).toBeInTheDocument();
      });
    });
  });

  describe('Section Navigation', () => {
    it('should render overview section by default', async () => {
      renderAdminDashboard('overview');
      
      await waitFor(() => {
        expect(screen.getByTestId('operational-overview-tab')).toBeInTheDocument();
      });
    });

    it('should render data management section', async () => {
      renderAdminDashboard('data');
      
      await waitFor(() => {
        expect(screen.getByTestId('data-management-tab')).toBeInTheDocument();
      });
    });

    it('should render user support section', async () => {
      renderAdminDashboard('users');
      
      await waitFor(() => {
        expect(screen.getByTestId('user-support-tab')).toBeInTheDocument();
      });
    });

    it('should render reports section', async () => {
      renderAdminDashboard('reports');
      
      await waitFor(() => {
        expect(screen.getByTestId('basic-reports-tab')).toBeInTheDocument();
      });
    });

    it('should render quick actions section', async () => {
      renderAdminDashboard('quick-actions');
      
      await waitFor(() => {
        expect(screen.getByTestId('quick-actions-panel')).toBeInTheDocument();
      });
    });
  });

  describe('Data Loading', () => {
    it('should load stats on overview section', async () => {
      renderAdminDashboard('overview');
      
      await waitFor(() => {
        expect(screen.getByTestId('stats-loaded')).toBeInTheDocument();
      });
    });

    it('should call API to get stats', async () => {
      const { adminAPI } = await import('../../services/api');
      
      renderAdminDashboard('overview');
      
      await waitFor(() => {
        expect(adminAPI.getStats).toHaveBeenCalled();
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      const { adminAPI } = await import('../../services/api');
      (adminAPI.getStats as any).mockRejectedValueOnce(new Error('API Error'));
      
      renderAdminDashboard('overview');
      
      await waitFor(() => {
        // Dashboard should still render
        expect(screen.getByText(/Operational Overview/i)).toBeInTheDocument();
      });
    });
  });

  describe('Success Messages', () => {
    it('should display success messages', async () => {
      renderAdminDashboard('data');
      const user = userEvent.setup();
      
      await waitFor(() => {
        expect(screen.getByTestId('data-management-tab')).toBeInTheDocument();
      });
      
      const showMessageBtn = screen.getByText('Show Message');
      await user.click(showMessageBtn);
      
      await waitFor(() => {
        expect(screen.getByText('Test message')).toBeInTheDocument();
      });
    });
  });

  describe('Refresh Functionality', () => {
    it('should refresh data when refresh button is clicked', async () => {
      const { adminAPI } = await import('../../services/api');
      
      renderAdminDashboard('overview');
      const user = userEvent.setup();
      
      await waitFor(() => {
        expect(screen.getByTestId('operational-overview-tab')).toBeInTheDocument();
      });
      
      // Clear the mock to check if it's called again
      (adminAPI.getStats as any).mockClear();
      
      const refreshBtn = screen.getByText('Refresh');
      await user.click(refreshBtn);
      
      await waitFor(() => {
        expect(adminAPI.getStats).toHaveBeenCalled();
      });
    });
  });

  describe('Section Titles', () => {
    it('should show correct title for overview', async () => {
      renderAdminDashboard('overview');
      
      await waitFor(() => {
        expect(screen.getByText(/Operational Overview/i)).toBeInTheDocument();
      });
    });

    it('should show correct title for data management', async () => {
      renderAdminDashboard('data');
      
      await waitFor(() => {
        expect(screen.getByTestId('data-management-tab')).toBeInTheDocument();
      });
    });

    it('should show correct title for user support', async () => {
      renderAdminDashboard('users');
      
      await waitFor(() => {
        expect(screen.getByTestId('user-support-tab')).toBeInTheDocument();
      });
    });

    it('should show correct title for reports', async () => {
      renderAdminDashboard('reports');
      
      await waitFor(() => {
        expect(screen.getByTestId('basic-reports-tab')).toBeInTheDocument();
      });
    });

    it('should show correct title for quick actions', async () => {
      renderAdminDashboard('quick-actions');
      
      await waitFor(() => {
        expect(screen.getByTestId('quick-actions-panel')).toBeInTheDocument();
      });
    });
  });
});

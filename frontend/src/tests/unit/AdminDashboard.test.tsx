import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { toast } from 'react-toastify';
import AdminDashboard from '../../components/AdminDashboard';

// Mock react-toastify so we can assert calls without mounting a ToastContainer
vi.mock('react-toastify', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock the sub-components - passing the correct prop name 'showMessage' that component uses
vi.mock('../../components/StandardAdmin/UserSupportTab', () => ({
  default: ({ showMessage }: any) => (
    <div data-testid="user-support-tab">
      <h2>User Support Content</h2>
      <button onClick={() => showMessage && showMessage('success', 'Test message')}>Show Message</button>
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

vi.mock('../../components/SuperAdmin/FuelStationsTab', () => ({
  default: () => (
    <div data-testid="fuel-stations-tab">
      <h2>Fuel Stations</h2>
    </div>
  )
}));

vi.mock('../../components/SuperAdmin/RoutesTab', () => ({
  default: () => (
    <div data-testid="routes-tab">
      <h2>Routes</h2>
    </div>
  )
}));

vi.mock('../../components/SuperAdmin/FuelPriceTab', () => ({
  default: () => (
    <div data-testid="fuel-price-tab">
      <h2>Fuel Prices</h2>
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

const renderAdminDashboard = (section: string = 'users') => {
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
        expect(screen.getByTestId('user-support-tab')).toBeInTheDocument();
      });
    });

    it('should display user name and role', async () => {
      renderAdminDashboard();

      await waitFor(() => {
        expect(screen.getByText(/Standard Admin/i)).toBeInTheDocument();
      });
    });

    it('should show the correct section title', async () => {
      renderAdminDashboard('users');

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1, name: 'User Support' })).toBeInTheDocument();
      });
    });
  });

  describe('Section Navigation', () => {
    it('should render user support section by default', async () => {
      renderAdminDashboard('users');

      await waitFor(() => {
        expect(screen.getByTestId('user-support-tab')).toBeInTheDocument();
      });
    });

    it('should render fuel stations section', async () => {
      renderAdminDashboard('fuel_stations');

      await waitFor(() => {
        expect(screen.getByTestId('fuel-stations-tab')).toBeInTheDocument();
      });
    });

    it('should render fuel prices section', async () => {
      renderAdminDashboard('fuel_prices');

      await waitFor(() => {
        expect(screen.getByTestId('fuel-price-tab')).toBeInTheDocument();
      });
    });

    it('should render routes section', async () => {
      renderAdminDashboard('routes');

      await waitFor(() => {
        expect(screen.getByTestId('routes-tab')).toBeInTheDocument();
      });
    });

    it('should render reports section', async () => {
      renderAdminDashboard('reports');

      await waitFor(() => {
        expect(screen.getByTestId('basic-reports-tab')).toBeInTheDocument();
      });
    });
  });

  describe('Success Messages', () => {
    it('should display success messages', async () => {
      renderAdminDashboard('users');
      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.getByTestId('user-support-tab')).toBeInTheDocument();
      });

      const showMessageBtn = screen.getByText('Show Message');
      await user.click(showMessageBtn);

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith('Test message');
      });
    });
  });

  describe('Section Titles', () => {
    it('should show correct title for fuel stations', async () => {
      renderAdminDashboard('fuel_stations');

      await waitFor(() => {
        expect(screen.getByText('Fuel Stations Management')).toBeInTheDocument();
      });
    });

    it('should show correct title for routes', async () => {
      renderAdminDashboard('routes');

      await waitFor(() => {
        expect(screen.getByText('Routes Management')).toBeInTheDocument();
      });
    });

    it('should show correct title for reports', async () => {
      renderAdminDashboard('reports');

      await waitFor(() => {
        expect(screen.getByText('Reports')).toBeInTheDocument();
      });
    });
  });
});

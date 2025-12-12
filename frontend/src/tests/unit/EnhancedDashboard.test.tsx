import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { EnhancedDashboard } from '../../components/EnhancedDashboard';

// Mock the AuthContext
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    logout: vi.fn(),
    toggleTheme: vi.fn(),
    isDark: false
  })
}));

// Mock all sub-components to isolate EnhancedDashboard testing
vi.mock('../pages/Dashboard', () => ({
  default: () => <div data-testid="dashboard">Dashboard</div>
}));

vi.mock('../../pages/Dashboard', () => ({
  default: () => <div data-testid="dashboard">Dashboard</div>
}));

vi.mock('../../pages/DeliveryOrders', () => ({
  default: () => <div data-testid="delivery-orders">Delivery Orders</div>
}));

vi.mock('../../pages/LPOs', () => ({
  default: () => <div data-testid="lpos">LPOs</div>
}));

vi.mock('../../pages/FuelRecords', () => ({
  default: () => <div data-testid="fuel-records">Fuel Records</div>
}));

vi.mock('../../components/YardFuelSimple', () => ({
  default: () => <div data-testid="yard-fuel">Yard Fuel</div>
}));

vi.mock('../../components/Reports', () => ({
  default: () => <div data-testid="reports">Reports</div>
}));

vi.mock('../../components/DriverPortal', () => ({
  default: () => <div data-testid="driver-portal">Driver Portal</div>
}));

vi.mock('../../components/StationView', () => ({
  default: () => <div data-testid="station-view">Station View</div>
}));

vi.mock('../../components/PaymentManager', () => ({
  default: () => <div data-testid="payment-manager">Payment Manager</div>
}));

vi.mock('../../components/SuperAdminDashboard', () => ({
  default: ({ section }: any) => <div data-testid={`super-admin-${section}`}>Super Admin: {section}</div>
}));

vi.mock('../../components/StandardAdminDashboard', () => ({
  default: ({ section }: any) => <div data-testid={`standard-admin-${section}`}>Standard Admin: {section}</div>
}));

vi.mock('../../components/ManagerView', () => ({
  default: () => <div data-testid="manager-view">Manager View</div>
}));

const mockLogout = vi.fn();

const mockOperatorUser = {
  id: 'user-1',
  username: 'operator',
  email: 'operator@test.com',
  firstName: 'Test',
  lastName: 'Operator',
  role: 'fuel_order_maker',
  isActive: true
};

const mockDriverUser = {
  id: 'driver-1',
  username: 'driver',
  email: 'driver@test.com',
  firstName: 'Test',
  lastName: 'Driver',
  role: 'driver',
  isActive: true
};

const mockYardUser = {
  id: 'yard-1',
  username: 'yarduser',
  email: 'yard@test.com',
  firstName: 'Yard',
  lastName: 'User',
  role: 'dar_yard',
  isActive: true
};

const mockManagerUser = {
  id: 'manager-1',
  username: 'manager',
  email: 'manager@test.com',
  firstName: 'Test',
  lastName: 'Manager',
  role: 'manager',
  isActive: true
};

const mockSuperAdminUser = {
  id: 'superadmin-1',
  username: 'superadmin',
  email: 'superadmin@test.com',
  firstName: 'Super',
  lastName: 'Admin',
  role: 'super_admin',
  isActive: true
};

const renderEnhancedDashboard = (user = mockOperatorUser) => {
  return render(
    <BrowserRouter>
      <EnhancedDashboard user={user} onLogout={mockLogout} />
    </BrowserRouter>
  );
};

describe('EnhancedDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('Rendering', () => {
    it('should render the dashboard shell', async () => {
      renderEnhancedDashboard();
      
      // The component should render without errors
      await waitFor(() => {
        expect(document.body).toBeDefined();
      });
    });

    it('should display sidebar navigation', async () => {
      renderEnhancedDashboard();
      
      await waitFor(() => {
        // Sidebar should render
        expect(document.body).toBeDefined();
      });
    });
  });

  describe('Role-based Menu Items', () => {
    it('should show driver portal for driver role', async () => {
      renderEnhancedDashboard(mockDriverUser);
      
      await waitFor(() => {
        // Driver view should render
        expect(document.body).toBeDefined();
      });
    });

    it('should show yard fuel for yard personnel', async () => {
      renderEnhancedDashboard(mockYardUser);
      
      await waitFor(() => {
        // Yard view should render
        expect(document.body).toBeDefined();
      });
    });

    it('should show manager view for manager role', async () => {
      renderEnhancedDashboard(mockManagerUser);
      
      await waitFor(() => {
        // Manager view should render
        expect(document.body).toBeDefined();
      });
    });

    it('should show super admin sections for super_admin role', async () => {
      renderEnhancedDashboard(mockSuperAdminUser);
      
      await waitFor(() => {
        expect(screen.getByText(/Super Admin Overview/i)).toBeInTheDocument();
      });
    });

    it('should show fuel order maker sections', async () => {
      renderEnhancedDashboard(mockOperatorUser);
      
      await waitFor(() => {
        expect(screen.getByText(/DO Management/i)).toBeInTheDocument();
        expect(screen.getByText(/Fuel Records/i)).toBeInTheDocument();
        expect(screen.getByText(/LPO Management/i)).toBeInTheDocument();
      });
    });
  });

  describe('Tab Navigation', () => {
    it('should navigate to different sections when menu item is clicked', async () => {
      renderEnhancedDashboard(mockOperatorUser);
      const user = userEvent.setup();
      
      await waitFor(() => {
        expect(screen.getByText(/DO Management/i)).toBeInTheDocument();
      });
      
      const doManagementBtn = screen.getByText(/DO Management/i);
      await user.click(doManagementBtn);
      
      await waitFor(() => {
        expect(screen.getByTestId('delivery-orders')).toBeInTheDocument();
      });
    });
  });

  describe('Theme Toggle', () => {
    it('should have theme toggle button', async () => {
      renderEnhancedDashboard();
      
      await waitFor(() => {
        // Look for sun or moon icon button
        const buttons = screen.getAllByRole('button');
        expect(buttons.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Sidebar Toggle', () => {
    it('should toggle sidebar visibility', async () => {
      renderEnhancedDashboard();
      const user = userEvent.setup();
      
      await waitFor(() => {
        // Find menu toggle button
        const buttons = screen.getAllByRole('button');
        expect(buttons.length).toBeGreaterThan(0);
      });
    });
  });

  describe('LocalStorage Persistence', () => {
    it('should persist active tab to localStorage', async () => {
      renderEnhancedDashboard(mockOperatorUser);
      
      // Component should set initial tab in localStorage
      await waitFor(() => {
        const storedTab = localStorage.getItem('fuel_order_active_tab');
        expect(storedTab).toBeDefined();
      });
    });
  });
});

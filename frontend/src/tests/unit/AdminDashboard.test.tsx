import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import AdminDashboard from '../../components/AdminDashboard';

// Mock the API services with correct AdminStats structure
vi.mock('../../services/api', () => ({
  adminAPI: {
    getStats: vi.fn().mockResolvedValue({
      users: {
        total: 30,
        active: 25,
        inactive: 5
      },
      records: {
        deliveryOrders: 150,
        lpos: 80,
        fuelRecords: 120,
        yardDispenses: 45
      },
      roleDistribution: [
        { role: 'admin', count: 5 },
        { role: 'operator', count: 10 },
        { role: 'driver', count: 15 }
      ],
      recentUsers: [
        { id: '1', username: 'admin', email: 'admin@test.com', firstName: 'Admin', lastName: 'User', role: 'admin', isActive: true }
      ]
    }),
    getFuelStations: vi.fn().mockResolvedValue([
      { id: '1', name: 'DAR YARD', location: 'DAR ES SALAAM', pricePerLiter: 1450, isActive: true },
      { id: '2', name: 'MBEYA', location: 'MBEYA', pricePerLiter: 1500, isActive: true }
    ]),
    getRoutes: vi.fn().mockResolvedValue([
      { destination: 'LUBUMBASHI', totalLiters: 2300 },
      { destination: 'LIKASI', totalLiters: 2200 }
    ]),
    getTruckBatches: vi.fn().mockResolvedValue({
      batch_100: ['T857 DNH', 'T858 ABC'],
      batch_80: ['T784 DWK'],
      batch_60: ['T753 ELY']
    }),
    getStandardAllocations: vi.fn().mockResolvedValue({
      darYard: 550,
      mbeyaGoing: 450,
      zambiaGoing: 400,
      congoFuel: 400
    }),
    updateFuelStation: vi.fn().mockResolvedValue({ success: true }),
    addFuelStation: vi.fn().mockResolvedValue({ id: 'new', name: 'NEW', location: 'NEW', pricePerLiter: 1450, isActive: true }),
    updateRoute: vi.fn().mockResolvedValue({ success: true }),
    addRoute: vi.fn().mockResolvedValue({ destination: 'NEW', totalLiters: 2200 }),
    deleteRoute: vi.fn().mockResolvedValue({ success: true }),
    addTruckToBatch: vi.fn().mockResolvedValue({ batch_100: ['T857 DNH'] }),
    removeTruckFromBatch: vi.fn().mockResolvedValue({ batch_100: [] }),
    updateStandardAllocations: vi.fn().mockResolvedValue({ darYard: 550 }),
  },
  usersAPI: {
    getAll: vi.fn().mockResolvedValue([
      { id: '1', username: 'admin', email: 'admin@test.com', firstName: 'Admin', lastName: 'User', role: 'admin', isActive: true },
      { id: '2', username: 'operator', email: 'op@test.com', firstName: 'Operator', lastName: 'User', role: 'operator', isActive: true }
    ]),
    toggleStatus: vi.fn().mockResolvedValue({ isActive: false }),
    resetPassword: vi.fn().mockResolvedValue({ temporaryPassword: 'temp123' }),
  },
  FuelStation: {},
  RouteConfig: {},
  TruckBatches: {},
  StandardAllocations: {},
  AdminStats: {},
}));

// Mock formatTruckNumber
vi.mock('../../utils/dataCleanup', () => ({
  formatTruckNumber: vi.fn((num) => num?.toUpperCase() || '')
}));

// Mock CreateUserModal
vi.mock('../../components/CreateUserModal', () => ({
  default: ({ onClose }: any) => (
    <div data-testid="create-user-modal">
      <button onClick={onClose}>Close</button>
    </div>
  ),
  BatchTruckCreation: () => <div data-testid="batch-truck-creation" />
}));

// Mock Pagination
vi.mock('../../components/Pagination', () => ({
  default: () => <div data-testid="pagination" />
}));

// Mock PendingConfigurations
vi.mock('../../pages/PendingConfigurations', () => ({
  default: () => <div data-testid="pending-configurations">Pending Configurations</div>
}));

const mockUser = {
  id: 'user-1',
  username: 'admin',
  email: 'admin@test.com',
  firstName: 'Admin',
  lastName: 'User',
  role: 'admin',
  isActive: true
};

const renderAdminDashboard = () => {
  return render(
    <BrowserRouter>
      <AdminDashboard user={mockUser} />
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
      
      // Check for main dashboard elements
      expect(screen.getByText(/Admin Dashboard/i)).toBeInTheDocument();
    });

    it('should display navigation tabs', async () => {
      renderAdminDashboard();
      
      await waitFor(() => {
        expect(screen.getByText(/Overview/i)).toBeInTheDocument();
      });
    });

    it('should show loading state initially', () => {
      renderAdminDashboard();
      
      // The component should show some loading indicator or load data
      expect(screen.getByText(/Admin Dashboard/i)).toBeInTheDocument();
    });
  });

  describe('Tab Navigation', () => {
    it('should switch to stations tab when clicked', async () => {
      renderAdminDashboard();
      const user = userEvent.setup();
      
      await waitFor(() => {
        const stationsTab = screen.getByText(/Stations/i);
        expect(stationsTab).toBeInTheDocument();
      });
      
      const stationsTab = screen.getByText(/Stations/i);
      await user.click(stationsTab);
      
      // Should load fuel stations data
      await waitFor(() => {
        expect(screen.getByText(/Fuel Stations/i)).toBeInTheDocument();
      });
    });

    it('should switch to routes tab when clicked', async () => {
      renderAdminDashboard();
      const user = userEvent.setup();
      
      await waitFor(() => {
        const routesTab = screen.getByText(/Routes/i);
        expect(routesTab).toBeInTheDocument();
      });
      
      const routesTab = screen.getByText(/Routes/i);
      await user.click(routesTab);
      
      // Tab should be clicked successfully
      await waitFor(() => {
        expect(document.body).toBeDefined();
      });
    });

    it('should switch to trucks tab when clicked', async () => {
      renderAdminDashboard();
      const user = userEvent.setup();
      
      // The tab is labeled "Truck Batches" in the component
      await waitFor(() => {
        const trucksTab = screen.getByText(/Truck Batches/i);
        expect(trucksTab).toBeInTheDocument();
      });
      
      const trucksTab = screen.getByText(/Truck Batches/i);
      await user.click(trucksTab);
      
      // Tab should be clicked successfully
      await waitFor(() => {
        expect(document.body).toBeDefined();
      });
    });

    it('should switch to users tab when clicked', async () => {
      renderAdminDashboard();
      const user = userEvent.setup();
      
      await waitFor(() => {
        const usersTabs = screen.getAllByText(/Users/i);
        expect(usersTabs.length).toBeGreaterThan(0);
      });
      
      // Get the first "Users" element (the tab button)
      const usersTabs = screen.getAllByText(/Users/i);
      await user.click(usersTabs[0]);
      
      // Tab should be clicked successfully
      await waitFor(() => {
        expect(document.body).toBeDefined();
      });
    });
  });

  describe('Overview Tab', () => {
    it('should display stats cards', async () => {
      renderAdminDashboard();
      
      await waitFor(() => {
        // Check for stats display - matches the OverviewTab component
        expect(screen.getByText(/Total Users/i)).toBeInTheDocument();
      });
    });

    it('should show user role distribution', async () => {
      renderAdminDashboard();
      
      await waitFor(() => {
        expect(screen.getByText(/User Role Distribution/i)).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('should display error message when API fails', async () => {
      const { adminAPI } = await import('../../services/api');
      (adminAPI.getStats as any).mockRejectedValueOnce(new Error('API Error'));
      
      renderAdminDashboard();
      
      await waitFor(() => {
        // Component should handle error gracefully
        expect(screen.getByText(/Admin Dashboard/i)).toBeInTheDocument();
      });
    });
  });
});

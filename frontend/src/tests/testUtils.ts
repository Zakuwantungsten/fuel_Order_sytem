import React, { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';

// Types
import { DeliveryOrder, FuelRecord, LPOEntry, User } from '../types';

// Custom render with providers
interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  route?: string;
}

const AllProviders: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <BrowserRouter>
      {children}
    </BrowserRouter>
  );
};

const customRender = (ui: ReactElement, options?: CustomRenderOptions) => {
  if (options?.route) {
    window.history.pushState({}, 'Test page', options.route);
  }
  
  return render(ui, { wrapper: AllProviders, ...options });
};

export * from '@testing-library/react';
export { customRender as render };

// Test Data Factories
export const createMockUser = (overrides: Partial<User> = {}): User => ({
  id: 'user-1',
  username: 'testuser',
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  role: 'admin',
  isActive: true,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
  ...overrides
});

export const createMockDeliveryOrder = (overrides: Partial<DeliveryOrder> = {}): DeliveryOrder => ({
  id: 'do-1',
  sn: 1,
  date: '2025-12-05',
  importOrExport: 'IMPORT',
  doType: 'DO',
  doNumber: 'DO-001',
  clientName: 'Test Client',
  truckNo: 'T123 ABC',
  trailerNo: 'TR001',
  loadingPoint: 'DAR ES SALAAM',
  destination: 'LUBUMBASHI',
  haulier: 'Test Haulier',
  tonnages: 30,
  ratePerTon: 100,
  status: 'active',
  ...overrides
});

export const createMockFuelRecord = (overrides: Partial<FuelRecord> = {}): FuelRecord => ({
  id: 'fr-1',
  date: '2025-12-05',
  month: 'December 2025',
  truckNo: 'T123 ABC',
  goingDo: 'DO-001',
  start: 'DAR',
  from: 'DAR ES SALAAM',
  to: 'LUBUMBASHI',
  totalLts: 2300,
  extra: 60,
  balance: 900,
  tangaYard: 0,
  darYard: 550,
  mmsaYard: 0,
  darGoing: 0,
  moroGoing: 0,
  mbeyaGoing: 450,
  tdmGoing: 0,
  zambiaGoing: 400,
  congoFuel: 400,
  zambiaReturn: 0,
  tundumaReturn: 0,
  mbeyaReturn: 0,
  moroReturn: 0,
  darReturn: 0,
  tangaReturn: 0,
  ...overrides
});

export const createMockLPOEntry = (overrides: Partial<LPOEntry> = {}): LPOEntry => ({
  id: 'lpo-1',
  sn: 1,
  date: '2025-12-05',
  lpoNo: 'LPO-001',
  dieselAt: 'LAKE CHILABOMBWE',
  doSdo: 'DO-001',
  truckNo: 'T123 ABC',
  ltrs: 400,
  pricePerLtr: 1.5,
  destinations: 'LUBUMBASHI',
  ...overrides
});

// Mock API response helper
export const mockApiResponse = <T>(data: T, success = true) => ({
  success,
  message: success ? 'Success' : 'Error',
  data
});

export const mockPaginatedResponse = <T>(
  data: T[],
  page = 1,
  limit = 10,
  total = 100
) => ({
  success: true,
  message: 'Success',
  data: {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  }
});

// Mock fetch helper
export const mockFetch = (responseData: any, status = 200) => {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(responseData),
    text: () => Promise.resolve(JSON.stringify(responseData))
  });
};

// Wait for async operations
export const waitForAsync = () => new Promise(resolve => setTimeout(resolve, 0));

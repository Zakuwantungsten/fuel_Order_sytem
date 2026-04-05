import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import Login from '../../components/Login';
import { AuthProvider } from '../../contexts/AuthContext';

// Mock the auth context
const mockLogin = vi.fn();
const mockClearError = vi.fn();

vi.mock('../../contexts/AuthContext', async () => {
  const actual = await vi.importActual('../../contexts/AuthContext');
  return {
    ...actual,
    useAuth: () => ({
      login: mockLogin,
      isLoading: false,
      error: null,
      clearError: mockClearError,
      user: null,
      isAuthenticated: false
    })
  };
});

// Mock images
vi.mock('../../assets/logo.png', () => ({ default: 'logo.png' }));
vi.mock('../../assets/Dec 2, 2025, 06_08_52 PM.png', () => ({ default: 'logo-dark.png' }));

const renderLogin = () => {
  return render(
    <BrowserRouter>
      <Login />
    </BrowserRouter>
  );
};

describe('Login Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render the login form', () => {
      renderLogin();
      
      expect(screen.getByText('Welcome Back')).toBeInTheDocument();
      expect(screen.getByText('Sign in to Fuel Order Management System')).toBeInTheDocument();
    });

    it('should render username input field', () => {
      renderLogin();
      
      const usernameInput = screen.getByPlaceholderText('Enter your username');
      expect(usernameInput).toBeInTheDocument();
    });

    it('should render password input field', () => {
      renderLogin();
      
      const passwordInput = screen.getByPlaceholderText('Enter your password');
      expect(passwordInput).toBeInTheDocument();
    });

    it('should render sign in button', () => {
      renderLogin();
      
      const signInButton = screen.getByRole('button', { name: /sign in/i });
      expect(signInButton).toBeInTheDocument();
    });

    it('should render remember me checkbox', () => {
      renderLogin();
      
      const checkbox = screen.getByLabelText(/remember me/i);
      expect(checkbox).toBeInTheDocument();
    });
  });

  describe('User Interactions', () => {
    it('should update username on input', async () => {
      renderLogin();
      const user = userEvent.setup();
      
      const usernameInput = screen.getByPlaceholderText('Enter your username');
      await user.type(usernameInput, 'testuser');
      
      expect(usernameInput).toHaveValue('testuser');
    });

    it('should update password on input', async () => {
      renderLogin();
      const user = userEvent.setup();
      
      const passwordInput = screen.getByPlaceholderText('Enter your password');
      await user.type(passwordInput, 'password123');
      
      expect(passwordInput).toHaveValue('password123');
    });

    it('should toggle password visibility', async () => {
      renderLogin();
      const user = userEvent.setup();
      
      const passwordInput = screen.getByPlaceholderText('Enter your password');
      expect(passwordInput).toHaveAttribute('type', 'password');
      
      // Find the toggle button by its role (button in password field)
      const toggleButton = screen.getByRole('button', { name: '' }); // The eye icon button
      if (toggleButton) {
        await user.click(toggleButton);
        // After click, password should be visible (type="text")
        expect(passwordInput).toHaveAttribute('type', 'text');
      }
    });

    it('should toggle remember me checkbox', async () => {
      renderLogin();
      const user = userEvent.setup();
      
      const checkbox = screen.getByLabelText(/remember me/i);
      expect(checkbox).not.toBeChecked();
      
      await user.click(checkbox);
      expect(checkbox).toBeChecked();
    });
  });

  describe('Form Submission', () => {
    it('should call login with credentials on submit', async () => {
      renderLogin();
      const user = userEvent.setup();
      
      const usernameInput = screen.getByPlaceholderText('Enter your username');
      const passwordInput = screen.getByPlaceholderText('Enter your password');
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      await user.type(usernameInput, 'admin');
      await user.type(passwordInput, 'admin123');
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledWith({
          username: 'admin',
          password: 'admin123',
          rememberMe: false
        });
      });
    });

    it('should not submit with empty fields', async () => {
      renderLogin();
      const user = userEvent.setup();
      
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      await user.click(submitButton);

      expect(mockLogin).not.toHaveBeenCalled();
    });
  });

  describe('Remember Me', () => {
    it('should pass rememberMe: true when checkbox is checked', async () => {
      renderLogin();
      const user = userEvent.setup();

      const checkbox = screen.getByLabelText(/remember me/i);
      await user.click(checkbox);
      expect(checkbox).toBeChecked();

      const usernameInput = screen.getByPlaceholderText('Enter your username');
      const passwordInput = screen.getByPlaceholderText('Enter your password');
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      await user.type(usernameInput, 'testuser');
      await user.type(passwordInput, 'pass123');
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledWith({
          username: 'testuser',
          password: 'pass123',
          rememberMe: true
        });
      });
    });

    it('should save username to localStorage when rememberMe is checked', async () => {
      renderLogin();
      const user = userEvent.setup();

      const checkbox = screen.getByLabelText(/remember me/i);
      await user.click(checkbox);

      const usernameInput = screen.getByPlaceholderText('Enter your username');
      const passwordInput = screen.getByPlaceholderText('Enter your password');
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      await user.type(usernameInput, 'saveduser');
      await user.type(passwordInput, 'pass123');
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalled();
      });

      // localStorage is mocked via vi.fn() in setup.ts, so check the spy
      expect(localStorage.setItem).toHaveBeenCalledWith('fuel_order_last_username', 'saveduser');
    });

    it('should initialize username from localStorage when remember me was previously set', () => {
      // Configure getItem mock to return values for specific keys
      const getItemMock = vi.fn((key: string) => {
        if (key === 'fuel_order_remember_me') return '1';
        if (key === 'fuel_order_last_username') return 'remembered_user';
        return null;
      });
      (localStorage.getItem as ReturnType<typeof vi.fn>).mockImplementation(getItemMock);

      renderLogin();

      const usernameInput = screen.getByPlaceholderText('Enter your username');
      const checkbox = screen.getByLabelText(/remember me/i);

      expect(usernameInput).toHaveValue('remembered_user');
      expect(checkbox).toBeChecked();

      // Restore default mock
      (localStorage.getItem as ReturnType<typeof vi.fn>).mockImplementation(() => null);
    });
  });

  describe('Accessibility', () => {
    it('should have accessible form elements', () => {
      renderLogin();
      
      const usernameInput = screen.getByPlaceholderText('Enter your username');
      const passwordInput = screen.getByPlaceholderText('Enter your password');
      
      expect(usernameInput).toHaveAttribute('name', 'username');
      expect(passwordInput).toHaveAttribute('name', 'password');
    });

    it('should support keyboard navigation', async () => {
      renderLogin();
      const user = userEvent.setup();
      
      // Tab through form elements
      await user.tab();
      expect(screen.getByPlaceholderText('Enter your username')).toHaveFocus();
      
      await user.tab();
      expect(screen.getByPlaceholderText('Enter your password')).toHaveFocus();
    });
  });
});

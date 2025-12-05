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
          password: 'admin123'
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

  describe('Demo Accounts', () => {
    it('should display demo accounts section', () => {
      renderLogin();
      
      // Demo accounts should be visible
      expect(screen.getByText(/demo accounts/i)).toBeInTheDocument();
    });

    it('should fill credentials when demo account is clicked', async () => {
      renderLogin();
      const user = userEvent.setup();
      
      // Find and click a demo account button
      const adminButton = screen.getByText('admin');
      await user.click(adminButton);

      const usernameInput = screen.getByPlaceholderText('Enter your username');
      expect(usernameInput).toHaveValue('admin');
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

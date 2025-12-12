import React, { useState } from 'react';
import { Mail, ArrowLeft, CheckCircle, AlertCircle, Loader } from 'lucide-react';
import { Link } from 'react-router-dom';
import { authAPI } from '../services/api';
import tahmeedLogo from '../assets/logo.png';
import tahmeedLogoDark from '../assets/Dec 2, 2025, 06_08_52 PM.png';

const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!email) {
      setError('Please enter your email address');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setIsLoading(true);

    try {
      await authAPI.forgotPassword(email);
      setSuccess(true);
      setEmail(''); // Clear the form
    } catch (err: any) {
      // Show generic message for security
      setSuccess(true); // Still show success to prevent email enumeration
      console.error('Forgot password error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-6 transition-all duration-500">
      <div className="w-full max-w-md bg-white/95 dark:bg-gray-800/95 backdrop-blur-xl rounded-3xl shadow-2xl overflow-hidden border border-white/20 dark:border-gray-700/50">
        <div className="p-8 lg:p-12">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="w-32 h-20 mx-auto mb-4">
              <img src={tahmeedLogo} alt="Tahmeed Logo" className="w-full h-full object-contain dark:hidden" />
              <img src={tahmeedLogoDark} alt="Tahmeed Logo" className="w-full h-full object-contain hidden dark:block" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              Forgot Password?
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              No worries, we'll send you reset instructions
            </p>
          </div>

          {/* Success Message */}
          {success && (
            <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg flex items-start space-x-3">
              <CheckCircle className="w-5 h-5 text-green-500 dark:text-green-400 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-medium text-green-800 dark:text-green-300">Check Your Email</h4>
                <p className="text-sm text-green-700 dark:text-green-400 mt-1">
                  If an account with that email exists, we've sent password reset instructions.
                  Please check your inbox and spam folder.
                </p>
              </div>
            </div>
          )}

          {/* Error Alert */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-medium text-red-800 dark:text-red-300">Error</h4>
                <p className="text-sm text-red-700 dark:text-red-400 mt-1">{error}</p>
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email Input */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError(null);
                  }}
                  className="block w-full pl-10 pr-3 py-3 border border-gray-300 dark:border-gray-600 rounded-lg
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                           placeholder-gray-400 dark:placeholder-gray-500
                           focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 focus:border-transparent
                           transition-colors duration-200"
                  placeholder="your.email@company.com"
                  disabled={isLoading}
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-lg
                       shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700
                       dark:bg-primary-500 dark:hover:bg-primary-600
                       focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98]"
            >
              {isLoading ? (
                <>
                  <Loader className="animate-spin -ml-1 mr-3 h-5 w-5" />
                  Sending...
                </>
              ) : (
                <>
                  <Mail className="-ml-1 mr-3 h-5 w-5" />
                  Send Reset Link
                </>
              )}
            </button>
          </form>

          {/* Back to Login */}
          <div className="mt-6 text-center">
            <Link
              to="/login"
              className="inline-flex items-center text-sm font-medium text-primary-600 hover:text-primary-500 dark:text-primary-400 dark:hover:text-primary-300 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Login
            </Link>
          </div>

          {/* Help Text */}
          <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-center text-gray-500 dark:text-gray-400">
              Remember your password?{' '}
              <Link to="/login" className="font-medium text-primary-600 hover:text-primary-500 dark:text-primary-400 dark:hover:text-primary-300">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;

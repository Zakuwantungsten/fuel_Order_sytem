import { useState } from 'react';
import { Truck, Loader, AlertCircle } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '../services/api';
import { formatTruckNumber } from '../utils/dataCleanup';

interface DriverLoginProps {
  onLoginSuccess: (truckNo: string) => void;
}

export function DriverLogin({ onLoginSuccess }: DriverLoginProps) {
  const [truckNo, setTruckNo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleTruckNoChange = (value: string) => {
    setTruckNo(formatTruckNumber(value));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!truckNo.trim()) {
      setError('Please enter your truck number');
      return;
    }

    try {
      setLoading(true);
      
      // Check if truck exists in the system
      const response = await api.get('/delivery-orders/trucks');
      const trucks = response.data.data?.trucks || [];
      
      const truckExists = trucks.some(
        (t: any) => t.truckNo.toLowerCase() === truckNo.trim().toLowerCase()
      );

      if (truckExists) {
        // Store truck number and mark as driver session
        localStorage.setItem('driverTruckNo', truckNo.trim());
        localStorage.setItem('isDriverSession', 'true');
        toast.success(`Welcome! Access granted for ${truckNo}`);
        onLoginSuccess(truckNo.trim());
      } else {
        setError('Truck number not found. Please check and try again.');
        toast.error('Invalid truck number');
      }
    } catch (error: any) {
      console.error('Driver login error:', error);
      setError('Unable to verify truck number. Please try again.');
      toast.error('Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-3 sm:p-4 transition-colors">
      <div className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-2xl dark:shadow-gray-900/50 p-5 sm:p-8 w-full max-w-md transition-colors">
        {/* Header */}
        <div className="text-center mb-6 sm:mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 bg-indigo-600 dark:bg-indigo-500 rounded-full mb-3 sm:mb-4">
            <Truck className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Driver Access
          </h1>
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
            Enter your truck number to view orders
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
          <div>
            <label htmlFor="truckNo" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Truck Number
            </label>
            <input
              id="truckNo"
              type="text"
              value={truckNo}
              onChange={(e) => handleTruckNoChange(e.target.value)}
              placeholder="e.g., T699 DXY"
              className="w-full px-3 sm:px-4 py-3 text-base sm:text-lg border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:border-indigo-500 dark:focus:border-indigo-400 transition-colors uppercase bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
              disabled={loading}
              autoFocus
            />
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 flex items-start space-x-2">
              <AlertCircle className="w-5 h-5 text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !truckNo.trim()}
            className="w-full bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white font-semibold py-3 sm:py-3.5 px-4 sm:px-6 rounded-lg text-base sm:text-lg transition-colors disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
          >
            {loading ? (
              <>
                <Loader className="w-5 h-5 sm:w-6 sm:h-6 animate-spin" />
                <span>Verifying...</span>
              </>
            ) : (
              <>
                <Truck className="w-5 h-5 sm:w-6 sm:h-6" />
                <span>Access Portal</span>
              </>
            )}
          </button>
        </form>

        {/* Info */}
        <div className="mt-6 sm:mt-8 pt-4 sm:pt-6 border-t border-gray-200 dark:border-gray-700">
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 text-center">
            This portal is for drivers only. If you're not a driver, please use the main login portal.
          </p>
          <div className="mt-3 sm:mt-4 text-center">
            <a 
              href="/" 
              className="text-sm sm:text-base text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 font-medium inline-flex items-center"
            >
              ← Back to Main Login
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DriverLogin;

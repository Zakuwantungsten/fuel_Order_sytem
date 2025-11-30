import { useState } from 'react';
import { Truck, Loader, AlertCircle } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '../services/api';

interface DriverLoginProps {
  onLoginSuccess: (truckNo: string) => void;
}

export function DriverLogin({ onLoginSuccess }: DriverLoginProps) {
  const [truckNo, setTruckNo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-indigo-600 rounded-full mb-4">
            <Truck className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Driver Access
          </h1>
          <p className="text-gray-600">
            Enter your truck number to view orders
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="truckNo" className="block text-sm font-medium text-gray-700 mb-2">
              Truck Number
            </label>
            <input
              id="truckNo"
              type="text"
              value={truckNo}
              onChange={(e) => setTruckNo(e.target.value.toUpperCase())}
              placeholder="e.g., T699 DXY"
              className="w-full px-4 py-3 text-lg border-2 border-gray-300 rounded-lg focus:outline-none focus:border-indigo-500 transition-colors uppercase"
              disabled={loading}
              autoFocus
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start space-x-2">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !truckNo.trim()}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
          >
            {loading ? (
              <>
                <Loader className="w-5 h-5 animate-spin" />
                <span>Verifying...</span>
              </>
            ) : (
              <>
                <Truck className="w-5 h-5" />
                <span>Access Portal</span>
              </>
            )}
          </button>
        </form>

        {/* Info */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <p className="text-xs text-gray-500 text-center">
            This portal is for drivers only. If you're not a driver, please use the main login portal.
          </p>
          <div className="mt-4 text-center">
            <a 
              href="/" 
              className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
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

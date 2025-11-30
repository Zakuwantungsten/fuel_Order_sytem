import { useState } from 'react';
import { Truck } from 'lucide-react';

interface LoginProps {
  onLogin: (user: any) => void;
}

export function Login({ onLogin }: LoginProps) {
  const [selectedRole, setSelectedRole] = useState('fuel_order_maker');
  const [name, setName] = useState('');

  const roles = [
    { value: 'fuel_order_maker', label: 'Fuel Order Maker' },
    { value: 'boss', label: 'Manager/Boss' },
    { value: 'fuel_attendant', label: 'Fuel Attendant' },
    { value: 'station_manager', label: 'Station Manager' },
    { value: 'yard_personnel', label: 'Yard Personnel' },
    { value: 'driver', label: 'Driver' },
    { value: 'payment_manager', label: 'Payment Manager (Bilal)' },
  ];

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    onLogin({
      id: Math.random().toString(36).substr(2, 9),
      name: name || 'Demo User',
      role: selectedRole,
      station: selectedRole === 'fuel_attendant' || selectedRole === 'station_manager' ? 'LAKE KAPIRI' : undefined,
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
        <div className="flex items-center justify-center mb-8">
          <Truck className="w-12 h-12 text-indigo-600 mr-3" />
          <div>
            <h1 className="text-indigo-900">Tahmeed Transporters</h1>
            <p className="text-gray-600 text-sm">Fuel Management System</p>
          </div>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-gray-700 mb-2">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="Enter your name"
              required
            />
          </div>

          <div>
            <label className="block text-gray-700 mb-2">Select Role</label>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              {roles.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            className="w-full bg-indigo-600 text-white py-3 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Login
          </button>
        </form>
      </div>
    </div>
  );
}

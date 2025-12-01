import { useState } from 'react';
import { 
  Plus, 
  X, 
  Save, 
  Users,
  Mail,
  Lock,
  User as UserIcon,
  Briefcase,
  Shield
} from 'lucide-react';
import { usersAPI } from '../services/api';
import { UserRole } from '../types';

interface CreateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUserCreated: () => void;
}

export default function CreateUserModal({ isOpen, onClose, onUserCreated }: CreateUserModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    role: 'viewer' as UserRole,
    department: '',
    station: '',
    truckNo: '',
  });

  const roles: { value: UserRole; label: string; description: string }[] = [
    { value: 'super_admin', label: 'Super Admin', description: 'Full system access' },
    { value: 'admin', label: 'Admin', description: 'Administrative access' },
    { value: 'manager', label: 'Manager', description: 'Management operations' },
    { value: 'supervisor', label: 'Supervisor', description: 'Supervisory access' },
    { value: 'clerk', label: 'Clerk', description: 'Data entry' },
    { value: 'driver', label: 'Driver', description: 'Driver portal' },
    { value: 'viewer', label: 'Viewer', description: 'Read-only access' },
    { value: 'fuel_order_maker', label: 'Fuel Order Maker', description: 'Create fuel orders' },
    { value: 'boss', label: 'Boss', description: 'Executive view' },
    { value: 'yard_personnel', label: 'Yard Personnel', description: 'Yard operations' },
    { value: 'fuel_attendant', label: 'Fuel Attendant', description: 'Fuel station operations' },
    { value: 'station_manager', label: 'Station Manager', description: 'Station management' },
    { value: 'payment_manager', label: 'Payment Manager', description: 'Payment operations' },
    { value: 'dar_yard', label: 'DAR Yard', description: 'DAR yard dispense' },
    { value: 'tanga_yard', label: 'Tanga Yard', description: 'Tanga yard dispense' },
    { value: 'mmsa_yard', label: 'MMSA Yard', description: 'MMSA yard dispense' },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.username || !formData.email || !formData.password || !formData.firstName || !formData.lastName) {
      setError('Please fill in all required fields');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await usersAPI.create({
        ...formData,
        isActive: true,
      } as any);
      
      setFormData({
        username: '',
        email: '',
        password: '',
        firstName: '',
        lastName: '',
        role: 'viewer',
        department: '',
        station: '',
        truckNo: '',
      });
      
      onUserCreated();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto transition-colors">
        {/* Header */}
        <div className="bg-indigo-600 dark:bg-indigo-700 text-white px-6 py-4 rounded-t-xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users className="w-6 h-6" />
            <h2 className="text-xl font-semibold">Create New User</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-indigo-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {/* Name Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                First Name <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={e => setFormData({ ...formData, firstName: e.target.value })}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                  placeholder="John"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Last Name <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
                <input
                  type="text"
                  value={formData.lastName}
                  onChange={e => setFormData({ ...formData, lastName: e.target.value })}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                  placeholder="Doe"
                  required
                />
              </div>
            </div>
          </div>

          {/* Credentials */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Username <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
                <input
                  type="text"
                  value={formData.username}
                  onChange={e => setFormData({ ...formData, username: e.target.value })}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                  placeholder="johndoe"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Email <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
                <input
                  type="email"
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                  placeholder="john@example.com"
                  required
                />
              </div>
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Password <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
              <input
                type="password"
                value={formData.password}
                onChange={e => setFormData({ ...formData, password: e.target.value })}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                placeholder="••••••••"
                minLength={6}
                required
              />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Minimum 6 characters</p>
          </div>

          {/* Role Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Role <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Shield className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
              <select
                value={formData.role}
                onChange={e => setFormData({ ...formData, role: e.target.value as UserRole })}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 appearance-none transition-colors"
                required
              >
                {roles.map(role => (
                  <option key={role.value} value={role.value}>
                    {role.label} - {role.description}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Additional Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Department
              </label>
              <div className="relative">
                <Briefcase className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
                <input
                  type="text"
                  value={formData.department}
                  onChange={e => setFormData({ ...formData, department: e.target.value })}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                  placeholder="Operations"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Station
              </label>
              <input
                type="text"
                value={formData.station}
                onChange={e => setFormData({ ...formData, station: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                placeholder="DAR ES SALAAM"
              />
            </div>
          </div>

          {/* Driver-specific field */}
          {(formData.role === 'driver') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Truck Number
              </label>
              <input
                type="text"
                value={formData.truckNo}
                onChange={e => setFormData({ ...formData, truckNo: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                placeholder="T XXX ABC"
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Save className="w-5 h-5" />
              )}
              Create User
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Batch User Creation Component
interface BatchUserCreationProps {
  onUsersCreated: () => void;
}

export function BatchTruckCreation({ onUsersCreated }: BatchUserCreationProps) {
  const [trucks, setTrucks] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!trucks.trim()) {
      setError('Please enter truck numbers');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    // Parse truck numbers (comma or newline separated)
    const truckList = trucks
      .split(/[,\n]/)
      .map(t => t.trim().toUpperCase())
      .filter(t => t);

    let created = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const truckNo of truckList) {
      try {
        // Extract suffix for username
        const suffix = truckNo.split(' ').pop()?.toLowerCase() || truckNo.toLowerCase();
        const username = `driver_${suffix}`;
        
        await usersAPI.create({
          username,
          email: `${username}@fuelorder.com`,
          password: 'driver123', // Default password
          firstName: 'Driver',
          lastName: truckNo,
          role: 'driver',
          department: 'Transport',
          truckNo,
          isActive: true,
        } as any);
        
        created++;
      } catch (err: any) {
        failed++;
        errors.push(`${truckNo}: ${err.response?.data?.message || 'Failed'}`);
      }
    }

    setLoading(false);
    
    if (created > 0) {
      setSuccess(`Created ${created} driver accounts${failed > 0 ? `. ${failed} failed.` : ''}`);
      onUsersCreated();
      setTrucks('');
    }
    
    if (errors.length > 0 && created === 0) {
      setError(errors.join('\n'));
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 transition-colors">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
        <Plus className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
        Batch Create Driver Accounts
      </h3>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Enter truck numbers (one per line or comma-separated) to create driver accounts for each truck.
        Default password will be: <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-gray-900 dark:text-gray-100">driver123</code>
      </p>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg whitespace-pre-wrap text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/50 text-green-700 dark:text-green-400 px-4 py-3 rounded-lg">
            {success}
          </div>
        )}
        
        <textarea
          value={trucks}
          onChange={e => setTrucks(e.target.value)}
          rows={6}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono text-sm transition-colors"
          placeholder="T 123 ABC&#10;T 456 DEF&#10;T 789 GHI"
        />
        
        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <Plus className="w-5 h-5" />
          )}
          Create Driver Accounts
        </button>
      </form>
    </div>
  );
}

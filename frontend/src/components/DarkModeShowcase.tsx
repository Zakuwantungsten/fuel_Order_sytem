import React, { useState } from 'react';
import { 
  Sun, 
  Moon, 
  Eye, 
  EyeOff, 
  CheckCircle, 
  AlertCircle, 
  Info, 
  X,
  Search,
  Filter,
  Download
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const DarkModeShowcase: React.FC = () => {
  const { theme, toggleTheme, isDark } = useAuth();
  const [formData, setFormData] = useState({
    text: 'Sample text input',
    email: 'user@example.com',
    password: 'password123',
    select: 'option1',
    textarea: 'This is a sample textarea content...',
    checkbox: true,
    radio: 'option1'
  });
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 transition-all duration-500 p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent dark:from-blue-400 dark:to-purple-400">
              Theme Showcase
            </h1>
            <p className="text-slate-600 dark:text-gray-400 mt-2 text-lg">
              Comprehensive demonstration of light and dark mode styling across all UI elements
            </p>
          </div>
          
          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="flex items-center gap-3 px-6 py-3 btn btn-primary shadow-lg hover:shadow-xl transition-all duration-300"
          >
            {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            <span className="font-semibold">
              Switch to {isDark ? 'Light' : 'Dark'} Mode
            </span>
          </button>
        </div>

        {/* Cards Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="card p-6 border-2">
            <h3 className="text-xl font-bold text-slate-900 dark:text-gray-100 mb-3 flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
              Enhanced Card
            </h3>
            <p className="text-slate-600 dark:text-gray-400">
              This card showcases the enhanced light mode styling with subtle gradients and improved shadows.
            </p>
            <div className="mt-4 flex gap-2">
              <span className="badge px-3 py-1 text-xs rounded-full">Light</span>
              <span className="badge px-3 py-1 text-xs rounded-full">Modern</span>
            </div>
          </div>
          
          <div className="card p-6 border-2 cursor-pointer group">
            <h3 className="text-xl font-bold text-slate-900 dark:text-gray-100 mb-3 flex items-center gap-2">
              <div className="w-3 h-3 bg-green-500 rounded-full group-hover:scale-125 transition-transform"></div>
              Interactive Card
            </h3>
            <p className="text-slate-600 dark:text-gray-400 group-hover:text-slate-700 dark:group-hover:text-gray-300 transition-colors">
              Hover me to see smooth animations and state changes in both themes.
            </p>
            <div className="mt-4">
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div className="bg-gradient-to-r from-blue-500 to-green-500 h-2 rounded-full w-3/4 group-hover:w-full transition-all duration-500"></div>
              </div>
            </div>
          </div>
          
          <div className="bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 rounded-xl p-6 text-white shadow-2xl hover:shadow-3xl transition-all duration-300 transform hover:-rotate-1">
            <h3 className="text-xl font-bold mb-3 flex items-center gap-2">
              <div className="w-6 h-6 bg-white/20 rounded-lg flex items-center justify-center">
                ✨
              </div>
              Gradient Card
            </h3>
            <p className="text-white/90">
              Beautiful gradients and premium styling that works perfectly in both light and dark themes.
            </p>
          </div>
        </div>

        {/* Form Elements */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">
            Form Elements
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Text Inputs */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-gray-300 mb-3">
                  Text Input
                </label>
                <input
                  type="text"
                  value={formData.text}
                  onChange={(e) => setFormData({...formData, text: e.target.value})}
                  className="w-full px-4 py-3 border-2 border-slate-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-slate-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:border-blue-400 transition-all duration-200 placeholder:text-slate-400"
                  placeholder="Enter some text..."
                />
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-gray-300 mb-3">
                  Email Input
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  className="w-full px-4 py-3 border-2 border-slate-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-slate-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:border-blue-400 transition-all duration-200 placeholder:text-slate-400"
                  placeholder="user@example.com"
                />
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-gray-300 mb-3">
                  Password Input
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                    className="w-full px-4 py-3 pr-12 border-2 border-slate-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-slate-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:border-blue-400 transition-all duration-200 placeholder:text-slate-400"
                    placeholder="Enter password..."
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-300 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
            
            {/* Select and Textarea */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-gray-300 mb-3">
                  Select Dropdown
                </label>
                <select
                  value={formData.select}
                  onChange={(e) => setFormData({...formData, select: e.target.value})}
                  className="w-full px-4 py-3 border-2 border-slate-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-slate-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:border-blue-400 transition-all duration-200"
                >
                  <option value="option1">Option 1</option>
                  <option value="option2">Option 2</option>
                  <option value="option3">Option 3</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-gray-300 mb-3">
                  Textarea
                </label>
                <textarea
                  value={formData.textarea}
                  onChange={(e) => setFormData({...formData, textarea: e.target.value})}
                  rows={4}
                  className="w-full px-4 py-3 border-2 border-slate-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-slate-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:border-blue-400 transition-all duration-200 resize-none placeholder:text-slate-400"
                  placeholder="Enter your message here..."
                />
              </div>
              
              {/* Checkboxes and Radios */}
              <div className="space-y-3">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.checkbox}
                    onChange={(e) => setFormData({...formData, checkbox: e.target.checked})}
                    className="h-5 w-5 text-blue-600 focus:ring-blue-500 focus:ring-2 border-2 border-slate-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 transition-all"
                  />
                  <label className="ml-3 text-sm font-medium text-slate-700 dark:text-gray-300">
                    Checkbox option
                  </label>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center">
                    <input
                      type="radio"
                      name="radio-group"
                      value="option1"
                      checked={formData.radio === 'option1'}
                      onChange={(e) => setFormData({...formData, radio: e.target.value})}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                    />
                    <label className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                      Radio option 1
                    </label>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="radio"
                      name="radio-group"
                      value="option2"
                      checked={formData.radio === 'option2'}
                      onChange={(e) => setFormData({...formData, radio: e.target.value})}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                    />
                    <label className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                      Radio option 2
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">
            Button Styles
          </h2>
          
          <div className="flex flex-wrap gap-4">
            <button className="btn btn-primary px-6 py-3">
              Primary Button
            </button>
            <button className="btn btn-secondary px-6 py-3">
              Secondary Button
            </button>
            <button className="btn btn-outline px-6 py-3">
              Outline Button
            </button>
            <button className="btn btn-danger px-6 py-3">
              Danger Button
            </button>
            <button className="btn btn-success px-6 py-3">
              Success Button
            </button>
            <button className="btn btn-warning px-6 py-3">
              Warning Button
            </button>
          </div>
          
          <div className="mt-6 flex flex-wrap gap-4">
            <button className="btn btn-primary px-5 py-2.5">
              <Search className="w-4 h-4" />
              Search
            </button>
            <button className="btn btn-secondary px-5 py-2.5">
              <Filter className="w-4 h-4" />
              Filter
            </button>
            <button className="btn btn-outline px-5 py-2.5">
              <Download className="w-4 h-4" />
              Download
            </button>
          </div>
        </div>

        {/* Alerts */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">
            Alert Components
          </h2>
          
          <div className="space-y-4">
            <div className="flex items-center p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 mr-3" />
              <div>
                <p className="text-blue-800 dark:text-blue-200 font-medium">Information Alert</p>
                <p className="text-blue-600 dark:text-blue-300 text-sm">This is an informational message with proper dark mode styling.</p>
              </div>
            </div>
            
            <div className="flex items-center p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 mr-3" />
              <div>
                <p className="text-green-800 dark:text-green-200 font-medium">Success Alert</p>
                <p className="text-green-600 dark:text-green-300 text-sm">Operation completed successfully!</p>
              </div>
            </div>
            
            <div className="flex items-center p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mr-3" />
              <div>
                <p className="text-red-800 dark:text-red-200 font-medium">Error Alert</p>
                <p className="text-red-600 dark:text-red-300 text-sm">Something went wrong. Please try again.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">
            Table Example
          </h2>
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                <tr className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                    John Doe
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    john@example.com
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    Admin
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex px-2 py-1 text-xs font-semibold bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 rounded-full">
                      Active
                    </span>
                  </td>
                </tr>
                <tr className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                    Jane Smith
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    jane@example.com
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    User
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex px-2 py-1 text-xs font-semibold bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 rounded-full">
                      Pending
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center py-6 text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700">
          <p>Dark Mode Implementation Complete - All UI elements properly styled</p>
          <p className="text-sm mt-2">Current theme: <strong className="text-gray-700 dark:text-gray-300">{theme}</strong></p>
        </div>
      </div>
    </div>
  );
};

export default DarkModeShowcase;
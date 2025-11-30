import React, { useState, useEffect } from 'react';
import { Sun, Moon, Monitor, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export const ThemeDebugPanel: React.FC = () => {
  const { theme, toggleTheme, setTheme, isDark } = useAuth();
  const [debugInfo, setDebugInfo] = useState<any>({});

  const updateDebugInfo = () => {
    const info = {
      currentTheme: theme,
      isDark: isDark,
      htmlClasses: document.documentElement.className || 'none',
      localStorage: localStorage.getItem('fuel_order_theme'),
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      bodyColor: getComputedStyle(document.body).color,
      hasDarkClass: document.documentElement.classList.contains('dark'),
      timestamp: new Date().toLocaleTimeString()
    };
    setDebugInfo(info);
  };

  useEffect(() => {
    updateDebugInfo();
    // Update debug info whenever theme changes
  }, [theme, isDark]);

  const clearCache = () => {
    localStorage.removeItem('fuel_order_theme');
    document.documentElement.classList.remove('dark');
    window.location.reload();
  };

  const testThemeToggle = () => {
    console.log('Testing theme toggle...');
    console.log('Before toggle:', { theme, isDark, classes: document.documentElement.className });
    toggleTheme();
    setTimeout(() => {
      console.log('After toggle:', { 
        theme, 
        isDark, 
        classes: document.documentElement.className 
      });
      updateDebugInfo();
    }, 100);
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl p-4 max-w-sm transition-colors">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Theme Debug
          </h3>
          <button
            onClick={updateDebugInfo}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Theme Controls */}
        <div className="mb-4">
          <div className="flex gap-2 mb-2">
            <button
              onClick={() => setTheme('light')}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${
                theme === 'light' 
                  ? 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200' 
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <Sun className="w-3 h-3" />
              Light
            </button>
            <button
              onClick={() => setTheme('dark')}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${
                theme === 'dark' 
                  ? 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200' 
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <Moon className="w-3 h-3" />
              Dark
            </button>
          </div>
          <button
            onClick={testThemeToggle}
            className="w-full bg-blue-500 text-white px-3 py-1 rounded text-xs hover:bg-blue-600"
          >
            Test Toggle
          </button>
        </div>

        {/* Debug Info */}
        <div className="space-y-1 text-xs">
          <div className="grid grid-cols-2 gap-1">
            <span className="text-gray-600 dark:text-gray-400">Theme:</span>
            <span className="font-mono text-gray-900 dark:text-gray-100">{debugInfo.currentTheme}</span>
            
            <span className="text-gray-600 dark:text-gray-400">isDark:</span>
            <span className="font-mono text-gray-900 dark:text-gray-100">{String(debugInfo.isDark)}</span>
            
            <span className="text-gray-600 dark:text-gray-400">HTML class:</span>
            <span className="font-mono text-gray-900 dark:text-gray-100 break-all">{debugInfo.htmlClasses}</span>
            
            <span className="text-gray-600 dark:text-gray-400">localStorage:</span>
            <span className="font-mono text-gray-900 dark:text-gray-100">{debugInfo.localStorage || 'null'}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={clearCache}
            className="w-full bg-red-500 text-white px-3 py-1 rounded text-xs hover:bg-red-600 mb-2"
          >
            Clear Cache & Reload
          </button>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Updated: {debugInfo.timestamp}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ThemeDebugPanel;
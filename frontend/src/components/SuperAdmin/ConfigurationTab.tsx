import { useState, useEffect } from 'react';
import { Settings, Calculator, Info, X } from 'lucide-react';
import { configAPI } from '../../services/api';
import { FormulaVariable, FormulaExample } from '../../types';

interface ConfigurationTabProps {
  onMessage: (type: 'success' | 'error', message: string) => void;
}

export default function ConfigurationTab({ onMessage }: ConfigurationTabProps) {
  const [variables, setVariables] = useState<FormulaVariable[]>([]);
  const [examples, setExamples] = useState<FormulaExample[]>([]);
  const [showFormulaHelp, setShowFormulaHelp] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const formulaData = await configAPI.getFormulaVariables();
      setVariables(formulaData.data);
      setExamples(formulaData.examples);
    } catch (error: any) {
      onMessage('error', error.response?.data?.message || 'Failed to load configuration');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings className="w-6 h-6 text-purple-600 dark:text-purple-400" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            System Configuration
          </h2>
        </div>
        <button
          onClick={() => setShowFormulaHelp(!showFormulaHelp)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Calculator className="w-4 h-4" />
          Formula Help
        </button>
      </div>

      {showFormulaHelp && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-2">
              <Info className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <h3 className="font-semibold text-blue-900 dark:text-blue-100">Formula Guide</h3>
            </div>
            <button onClick={() => setShowFormulaHelp(false)} className="text-blue-600 dark:text-blue-400">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">Available Variables:</h4>
              <div className="space-y-1 text-sm">
                {variables.map((variable) => (
                  <div key={variable.name} className="flex items-center gap-2">
                    <code className="bg-blue-100 dark:bg-blue-800 px-2 py-1 rounded text-blue-900 dark:text-blue-100">
                      {variable.name}
                    </code>
                    <span className="text-blue-700 dark:text-blue-300">{variable.description}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">Example Formulas:</h4>
              <div className="space-y-2 text-sm">
                {examples.map((example, index) => (
                  <div key={index} className="bg-white dark:bg-gray-800 p-3 rounded border border-blue-200 dark:border-blue-700">
                    <code className="block text-blue-900 dark:text-blue-100 mb-1">{example.formula}</code>
                    <p className="text-blue-600 dark:text-blue-400 text-xs">{example.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
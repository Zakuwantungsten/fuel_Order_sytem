import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { DeliveryOrder } from '../types';

interface AmendedDO {
  id: string;
  doNumber: string;
  truckNo: string;
  importOrExport: 'IMPORT' | 'EXPORT';
  date: string;
  amendedAt: Date;
  fieldsChanged: string[];
  order: DeliveryOrder; // Store full order for PDF generation
}

interface AmendedDOsContextType {
  amendedDOs: AmendedDO[];
  addAmendedDO: (order: DeliveryOrder, fieldsChanged: string[]) => void;
  removeAmendedDO: (id: string) => void;
  clearAmendedDOs: () => void;
  hasAmendedDOs: boolean;
  count: number;
}

const AmendedDOsContext = createContext<AmendedDOsContextType | undefined>(undefined);

interface AmendedDOsProviderProps {
  children: ReactNode;
}

export const AmendedDOsProvider: React.FC<AmendedDOsProviderProps> = ({ children }) => {
  const [amendedDOs, setAmendedDOs] = useState<AmendedDO[]>([]);

  const addAmendedDO = useCallback((order: DeliveryOrder, fieldsChanged: string[]) => {
    setAmendedDOs(prev => {
      // Check if this DO is already in the list
      const existingIndex = prev.findIndex(d => d.id === order.id);
      
      const amendedDO: AmendedDO = {
        id: order.id as string,
        doNumber: order.doNumber,
        truckNo: order.truckNo,
        importOrExport: order.importOrExport,
        date: order.date,
        amendedAt: new Date(),
        fieldsChanged,
        order,
      };

      if (existingIndex >= 0) {
        // Update existing entry with new changes
        const updated = [...prev];
        const existingFields = updated[existingIndex].fieldsChanged;
        const mergedFields = [...new Set([...existingFields, ...fieldsChanged])];
        updated[existingIndex] = {
          ...amendedDO,
          fieldsChanged: mergedFields,
        };
        return updated;
      } else {
        // Add new entry
        return [...prev, amendedDO];
      }
    });
  }, []);

  const removeAmendedDO = useCallback((id: string) => {
    setAmendedDOs(prev => prev.filter(d => d.id !== id));
  }, []);

  const clearAmendedDOs = useCallback(() => {
    setAmendedDOs([]);
  }, []);

  const value: AmendedDOsContextType = {
    amendedDOs,
    addAmendedDO,
    removeAmendedDO,
    clearAmendedDOs,
    hasAmendedDOs: amendedDOs.length > 0,
    count: amendedDOs.length,
  };

  return (
    <AmendedDOsContext.Provider value={value}>
      {children}
    </AmendedDOsContext.Provider>
  );
};

export const useAmendedDOs = (): AmendedDOsContextType => {
  const context = useContext(AmendedDOsContext);
  if (context === undefined) {
    throw new Error('useAmendedDOs must be used within an AmendedDOsProvider');
  }
  return context;
};

import { useState } from 'react';
import { DeliveryOrder } from '../types';
import { cleanDriverName } from '../utils/dataCleanup';
import { formatDateOnly } from '../utils/timezone';
import { useAuth } from '../contexts/AuthContext';

interface DOSheetViewProps {
  order: DeliveryOrder;
  preparedBy?: string; // Optional: override username for prepared by field
}

/**
 * DOSheetView - Displays a single Delivery Order in the workbook sheet format
 * Matches the DeliveryNotePrint layout for consistency
 */
const DOSheetView = ({ order, preparedBy }: DOSheetViewProps) => {
  const { user } = useAuth();
  const preparedByName = preparedBy || user?.username || '';
  
  const formatDate = (dateString: string) => {
    if (!dateString) return formatDateOnly(new Date());
    return formatDateOnly(new Date(dateString));
  };

  const currentDate = formatDate(order.date);

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-4xl mx-auto">
      {/* Main Border Container */}
      <div className="border-2 border-gray-800 p-4 bg-white">
        
        {/* Header with Company Info and Logo */}
        <div className="flex items-start justify-between mb-4">
          {/* Company Details */}
          <div className="flex-1 pr-4">
            <div className="mb-2">
              <div className="text-orange-600 font-bold text-4xl tracking-wider">
                TAHMEED
              </div>
              <div className="text-xs mt-1 text-gray-600">www.tahmeedcoach.co.ke</div>
              <div className="text-xs text-gray-600">Email: info@tahmeedcoach.co.ke</div>
              <div className="text-xs text-gray-600">Tel: +254 700 000 000</div>
            </div>
          </div>
          
          {/* Logo */}
          <div className="w-40 h-24 flex items-center justify-center flex-shrink-0 bg-white">
            <LogoComponent />
          </div>
        </div>

        {/* Title */}
        <div className="text-center border-t-2 border-b-2 border-gray-800 py-2 mb-4 bg-gray-50">
          <h1 className="text-xl font-bold text-gray-800">DELIVERY NOTE GOODS RECEIVED NOTE</h1>
        </div>

        {/* DO Number and Date */}
        <div className="border border-gray-800 mb-4 bg-white">
          <div className="grid grid-cols-3 gap-0">
            <div className="col-span-2 flex items-center border-r border-gray-800 p-2">
              <span className="font-bold text-lg mr-2 text-gray-800">{order.doType || 'DO'} #:</span>
              <span className="font-bold text-lg text-red-600">{order.doNumber}</span>
            </div>
            <div className="flex items-center justify-between p-2">
              <span className="font-bold text-gray-800">Date:</span>
              <span className="font-bold text-gray-800">{currentDate}</span>
            </div>
          </div>
        </div>

        {/* Recipient Information */}
        <div className="border border-gray-800 mb-4 text-sm bg-white">
          <div className="grid grid-cols-2 gap-0">
            <div className="border-r border-gray-800 p-3">
              <div className="flex mb-3">
                <span className="font-bold w-20 text-gray-800">Client:</span>
                <span className="font-bold text-gray-800">{order.clientName}</span>
              </div>
              <div className="text-xs mb-3 text-gray-600">
                Please receive the under mentioned containers/Packages ex.m.v
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center">
                  <span className="font-bold mr-2 text-gray-800">MPRO NO:</span>
                  <span className="text-gray-700">{order.invoiceNos || ''}</span>
                </div>
                <div className="flex items-center">
                  <span className="font-bold mr-2 text-gray-800">POL:</span>
                  <span className="text-gray-700">{order.loadingPoint}</span>
                </div>
              </div>
            </div>
            <div className="p-3">
              <div className="flex items-center">
                <span className="font-bold mr-2 text-gray-800">Arrive:</span>
                <span className="text-gray-700">{order.importOrExport === 'IMPORT' ? 'TANGA/DAR' : order.loadingPoint}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Transport Details */}
        <div className="border border-gray-800 mb-4 text-sm bg-white">
          <div className="grid grid-cols-2 gap-0">
            <div className="border-r border-gray-800 p-3 space-y-3">
              <div className="flex items-center">
                <span className="font-bold w-32 text-gray-800">For Destination:</span>
                <span className="font-bold text-gray-800">{order.destination}</span>
              </div>
              <div className="flex items-center">
                <span className="font-bold w-32 text-gray-800">Haulier:</span>
                <span className="font-bold text-gray-800">{order.haulier}</span>
              </div>
            </div>
            <div className="p-3 space-y-3">
              <div className="flex items-center">
                <span className="font-bold w-24 text-gray-800">Lorry No:</span>
                <span className="font-bold text-gray-800">{order.truckNo}</span>
              </div>
              <div className="flex items-center">
                <span className="font-bold w-24 text-gray-800">Trailer No:</span>
                <span className="font-bold text-gray-800">{order.trailerNo}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Items Table */}
        <table className="w-full border-collapse border border-gray-800 mb-4 text-sm bg-white">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-800 p-2 text-gray-800">CONTAINER NO.</th>
              <th className="border border-gray-800 p-2 text-gray-800">B/L NO</th>
              <th className="border border-gray-800 p-2 text-gray-800">PACKAGES</th>
              <th className="border border-gray-800 p-2 text-gray-800">CONTENTS</th>
              <th className="border border-gray-800 p-2 text-gray-800">WEIGHT</th>
              <th className="border border-gray-800 p-2 text-gray-800">MEASUREMENT</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-gray-800 p-2 font-bold text-gray-800">{order.containerNo || 'LOOSE CARGO'}</td>
              <td className="border border-gray-800 p-2"></td>
              <td className="border border-gray-800 p-2"></td>
              <td className="border border-gray-800 p-2"></td>
              <td className="border border-gray-800 p-2 text-center">
                <span className="font-bold text-gray-800">{order.tonnages}</span>
                <div className="font-bold mt-1 text-gray-800">TONS</div>
              </td>
              <td className="border border-gray-800 p-2"></td>
            </tr>
            {/* Empty rows for additional items */}
            <tr>
              <td className="border border-gray-800 p-2 h-10"></td>
              <td className="border border-gray-800 p-2"></td>
              <td className="border border-gray-800 p-2"></td>
              <td className="border border-gray-800 p-2"></td>
              <td className="border border-gray-800 p-2"></td>
              <td className="border border-gray-800 p-2"></td>
            </tr>
            <tr>
              <td className="border border-gray-800 p-2 h-10"></td>
              <td className="border border-gray-800 p-2"></td>
              <td className="border border-gray-800 p-2"></td>
              <td className="border border-gray-800 p-2"></td>
              <td className="border border-gray-800 p-2"></td>
              <td className="border border-gray-800 p-2"></td>
            </tr>
          </tbody>
        </table>

        {/* Prepared By Section */}
        <div className="border border-gray-800 mb-4 text-sm p-2 bg-white">
          <div className="flex items-center">
            <span className="font-bold mr-2 text-gray-800">Prepared By:</span>
            <span className="flex-1 border-b border-gray-400 px-2 py-1 text-gray-800">{preparedByName}</span>
          </div>
        </div>

        {/* Releasing Clerk Section */}
        <div className="border border-gray-800 mb-4 p-2 bg-white">
          <div className="font-bold text-sm text-gray-800">Releasing Clerks Name</div>
          <div className="h-12 border-b border-gray-400 mb-2"></div>
          <div className="text-right text-xs italic text-gray-600">Signature(Official Rubber Stamp)</div>
        </div>

        {/* Remarks and Rate */}
        <div className="border border-gray-800 mb-4 bg-white">
          <div className="border-b border-gray-800 p-2">
            <div className="flex items-center">
              <span className="font-bold text-sm mr-2 text-gray-800">REMARKS:</span>
              <span className="text-gray-700">{order.cargoType || ''}</span>
            </div>
          </div>
          <div className="text-center font-bold text-lg p-3 text-gray-800">
            ${order.ratePerTon} PER TON
          </div>
        </div>

        {/* WE Section */}
        <div className="border border-gray-800 mb-4 p-2 bg-white">
          <div className="font-bold text-sm text-gray-800">WE</div>
          <div className="h-12 border-b border-gray-400 mb-2"></div>
          <div className="text-right text-xs italic text-gray-600">Signature(Official Rubber Stamp)</div>
        </div>

        {/* Acknowledgment */}
        <div className="border border-gray-800 pt-2 p-3 text-sm bg-white">
          <div className="mb-3 font-bold text-gray-800">Acknowledge receipts of the goods as detailed above</div>
          <div className="grid grid-cols-2 gap-4 mb-3">
            <div className="flex items-center">
              <span className="font-bold w-32 text-gray-800">Delivers Name:</span>
              <span className="font-bold flex-1 border-b border-gray-400 px-2 py-1 text-gray-800">
                {cleanDriverName(order.driverName) || ''}
              </span>
            </div>
            <div className="flex items-center">
              <span className="font-bold w-24 text-gray-800">Date:</span>
              <span className="font-bold flex-1 border-b border-gray-400 px-2 py-1 text-gray-800">{currentDate}</span>
            </div>
          </div>
          <div className="text-sm text-gray-800">National ID/Passport No.</div>
          <div className="h-8 border-b border-gray-400 mt-1"></div>
        </div>

        {/* Additional DO Details - for workbook reference */}
        <div className="mt-4 pt-4 border-t-2 border-dashed border-gray-400">
          <div className="text-xs text-gray-500 mb-2 font-semibold">Additional Information (Workbook Reference)</div>
          <div className="grid grid-cols-3 gap-4 text-xs">
            <div>
              <span className="text-gray-500">DO Type:</span>
              <span className="ml-2 font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-800">
                {order.doType}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Import/Export:</span>
              <span className="ml-2 text-gray-700 font-medium">{order.importOrExport}</span>
            </div>
            <div>
              <span className="text-gray-500">Border Entry:</span>
              <span className="ml-2 text-gray-700 font-medium">{order.borderEntryDRC || 'N/A'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Logo component with fallback
const LogoComponent = () => {
  const [logoError, setLogoError] = useState(false);
  
  // Try multiple logo paths for the PNG file
  const logoSources = [
    '/assets/logo.png',
    './assets/logo.png',
    '../assets/logo.png',
    '/frontend/assets/logo.png'
  ];
  
  const [currentLogoIndex, setCurrentLogoIndex] = useState(0);
  
  if (logoError && currentLogoIndex >= logoSources.length) {
    return (
      <div className="w-full h-full flex items-center justify-center text-center text-sm font-bold text-orange-600 leading-tight">
        TAHMEED<br/>LOGO
      </div>
    );
  }

  return (
    <img 
      src={logoSources[currentLogoIndex]} 
      alt="Tahmeed Logo" 
      className="w-full h-full object-contain" 
      onError={() => {
        if (currentLogoIndex < logoSources.length - 1) {
          setCurrentLogoIndex(prev => prev + 1);
        } else {
          setLogoError(true);
        }
      }}
    />
  );
};

export default DOSheetView;

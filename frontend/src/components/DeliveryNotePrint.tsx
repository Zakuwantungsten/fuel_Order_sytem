import { useState } from 'react';
import { DeliveryOrder } from '../types';
import { cleanDriverName } from '../utils/dataCleanup';
import { useAuth } from '../contexts/AuthContext';

interface DeliveryNotePrintProps {
  order: DeliveryOrder;
  showOnScreen?: boolean;
  preparedBy?: string; // Optional: override username for prepared by field
}

const DeliveryNotePrint = ({ order, showOnScreen = false, preparedBy }: DeliveryNotePrintProps) => {
  const { user } = useAuth();
  const preparedByName = preparedBy || user?.username || '';
  
  const formatDate = (dateString: string) => {
    if (!dateString) return new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const currentDate = formatDate(order.date);
  
  // Debug logging
  console.log('DeliveryNotePrint - Order data:', {
    tonnages: order.tonnages,
    driverName: order.driverName,
    clientName: order.clientName,
    truckNo: order.truckNo,
    doNumber: order.doNumber,
    doType: order.doType,
    fullOrder: order
  });
  
  // Check for data corruption
  if (typeof order.driverName === 'undefined' || order.driverName === null) {
    console.warn('Driver name is undefined/null');
  }
  if (typeof order.driverName === 'string' && /\d+.*TONS/i.test(order.driverName)) {
    console.error('Driver name contains tonnage data - possible data corruption:', order.driverName);
  }
  
  return (
    <>
      <style>{`
        @media print {
          @page { 
            size: A4;
            margin: 10mm;
          }
          
          body * {
            visibility: hidden;
          }
          
          .delivery-note-print-wrapper,
          .delivery-note-print-wrapper * {
            visibility: visible !important;
          }
          
          .delivery-note-print-wrapper {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          
          .no-print {
            display: none !important;
          }
        }
        
        .delivery-note-print-content {
          background: white;
          color: black;
        }
        
        ${!showOnScreen ? `
          .delivery-note-print-wrapper {
            position: fixed;
            left: -9999px;
            top: -9999px;
          }
        ` : ''}
      `}</style>

      <div className={`delivery-note-print-wrapper ${showOnScreen ? 'block' : ''}`}>
        <div className="delivery-note-print-content max-w-4xl mx-auto bg-white p-4">
        {/* Main Border Container */}
        <div className="border-2 border-black p-4" style={{ backgroundColor: 'white' }}>
          
          {/* Header with Company Info and Logo */}
          <div className="flex items-start justify-between mb-4">
            {/* Company Details */}
            <div className="flex-1 pr-4">
              <div className="mb-2">
                <div className="text-orange-600 font-bold text-4xl tracking-wider" style={{ color: '#E67E22' }}>
                  TAHMEED
                </div>
                <div className="text-xs mt-1" style={{ color: 'black' }}>www.tahmeedcoach.co.ke</div>
                <div className="text-xs" style={{ color: 'black' }}>Email: info@tahmeedcoach.co.ke</div>
                <div className="text-xs" style={{ color: 'black' }}>Tel: +254 700 000 000</div>
              </div>
            </div>
            
            {/* Logo - positioned opposite to details */}
            <div className="w-40 h-24 flex items-center justify-center flex-shrink-0 bg-white">
              <LogoComponent />
            </div>
          </div>

          {/* Title */}
          <div className="text-center border-t-2 border-b-2 border-black py-2 mb-4" style={{ backgroundColor: 'white' }}>
            <h1 className="text-xl font-bold" style={{ color: 'black' }}>DELIVERY NOTE GOODS RECEIVED NOTE</h1>
          </div>

          {/* DO Number and Date */}
          <div className="border border-black mb-4" style={{ backgroundColor: 'white' }}>
            <div className="grid grid-cols-3 gap-0">
              <div className="col-span-2 flex items-center border-r border-black p-2">
                <span className="font-bold text-lg mr-2" style={{ color: 'black' }}>{order.doType || 'DO'} #:</span>
                <span className="font-bold text-lg text-red-600" style={{ color: '#dc3545' }}>{order.doNumber}</span>
              </div>
              <div className="flex items-center justify-between p-2">
                <span className="font-bold" style={{ color: 'black' }}>Date:</span>
                <span className="font-bold" style={{ color: 'black' }}>{currentDate}</span>
              </div>
            </div>
          </div>

          {/* Recipient Information */}
          <div className="border border-black mb-4 text-sm" style={{ backgroundColor: 'white' }}>
            <div className="grid grid-cols-2 gap-0">
              <div className="border-r border-black p-3">
                <div className="flex mb-3">
                  <span className="font-bold w-20" style={{ color: 'black' }}>TO:</span>
                  <span className="font-bold" style={{ color: 'black' }}>{order.clientName}</span>
                </div>
                <div className="text-xs mb-3" style={{ color: 'black' }}>
                  Please receive the under mentioned containers/Packages ex.m.v
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center">
                    <span className="font-bold mr-2" style={{ color: 'black' }}>MPRO NO:</span>
                    <span style={{ color: 'black' }}>{order.invoiceNos || ''}</span>
                  </div>
                  <div className="flex items-center">
                    <span className="font-bold mr-2" style={{ color: 'black' }}>POL:</span>
                    <span style={{ color: 'black' }}>{order.loadingPoint}</span>
                  </div>
                </div>
              </div>
              <div className="p-3">
                <div className="flex items-center">
                  <span className="font-bold mr-2" style={{ color: 'black' }}>Arrive:</span>
                  <span style={{ color: 'black' }}>{order.importOrExport === 'IMPORT' ? 'TANGA/DAR' : order.loadingPoint}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Transport Details */}
          <div className="border border-black mb-4 text-sm" style={{ backgroundColor: 'white' }}>
            <div className="grid grid-cols-2 gap-0">
              <div className="border-r border-black p-3 space-y-3">
                <div className="flex items-center">
                  <span className="font-bold w-32" style={{ color: 'black' }}>For Destination:</span>
                  <span className="font-bold" style={{ color: 'black' }}>{order.destination}</span>
                </div>
                <div className="flex items-center">
                  <span className="font-bold w-32" style={{ color: 'black' }}>Haulier:</span>
                  <span className="font-bold" style={{ color: 'black' }}>{order.haulier}</span>
                </div>
              </div>
              <div className="p-3 space-y-3">
                <div className="flex items-center">
                  <span className="font-bold w-24" style={{ color: 'black' }}>Lorry No:</span>
                  <span className="font-bold" style={{ color: 'black' }}>{order.truckNo}</span>
                </div>
                <div className="flex items-center">
                  <span className="font-bold w-24" style={{ color: 'black' }}>Trailer No:</span>
                  <span className="font-bold" style={{ color: 'black' }}>{order.trailerNo}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Items Table */}
          <table className="w-full border-collapse border border-black mb-4 text-sm" style={{ backgroundColor: 'white' }}>
            <thead>
              <tr className="bg-gray-200">
                <th className="border border-black p-2" style={{ color: 'black', backgroundColor: '#e5e7eb' }}>CONTAINER NO.</th>
                <th className="border border-black p-2" style={{ color: 'black', backgroundColor: '#e5e7eb' }}>B/L NO</th>
                <th className="border border-black p-2" style={{ color: 'black', backgroundColor: '#e5e7eb' }}>PACKAGES</th>
                <th className="border border-black p-2" style={{ color: 'black', backgroundColor: '#e5e7eb' }}>CONTENTS</th>
                <th className="border border-black p-2" style={{ color: 'black', backgroundColor: '#e5e7eb' }}>WEIGHT</th>
                <th className="border border-black p-2" style={{ color: 'black', backgroundColor: '#e5e7eb' }}>MEASUREMENT</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-black p-2 font-bold" style={{ color: 'black', backgroundColor: 'white' }}>{order.containerNo || 'LOOSE CARGO'}</td>
                <td className="border border-black p-2" style={{ backgroundColor: 'white' }}></td>
                <td className="border border-black p-2" style={{ backgroundColor: 'white' }}></td>
                <td className="border border-black p-2" style={{ backgroundColor: 'white' }}></td>
                <td className="border border-black p-2 text-center" style={{ backgroundColor: 'white' }}>
                  <span className="font-bold" style={{ color: 'black' }}>{order.tonnages}</span>
                  <div className="font-bold mt-1" style={{ color: 'black' }}>TONS</div>
                </td>
                <td className="border border-black p-2" style={{ backgroundColor: 'white' }}></td>
              </tr>
              {/* Empty rows for additional items */}
              <tr>
                <td className="border border-black p-2" style={{ height: '40px', backgroundColor: 'white' }}></td>
                <td className="border border-black p-2" style={{ backgroundColor: 'white' }}></td>
                <td className="border border-black p-2" style={{ backgroundColor: 'white' }}></td>
                <td className="border border-black p-2" style={{ backgroundColor: 'white' }}></td>
                <td className="border border-black p-2" style={{ backgroundColor: 'white' }}></td>
                <td className="border border-black p-2" style={{ backgroundColor: 'white' }}></td>
              </tr>
              <tr>
                <td className="border border-black p-2" style={{ height: '40px', backgroundColor: 'white' }}></td>
                <td className="border border-black p-2" style={{ backgroundColor: 'white' }}></td>
                <td className="border border-black p-2" style={{ backgroundColor: 'white' }}></td>
                <td className="border border-black p-2" style={{ backgroundColor: 'white' }}></td>
                <td className="border border-black p-2" style={{ backgroundColor: 'white' }}></td>
                <td className="border border-black p-2" style={{ backgroundColor: 'white' }}></td>
              </tr>
            </tbody>
          </table>

          {/* Prepared By Section */}
          <div className="border border-black mb-4 text-sm p-2" style={{ backgroundColor: 'white' }}>
            <div className="flex items-center">
              <span className="font-bold mr-2" style={{ color: 'black' }}>Prepared By:</span>
              <span className="flex-1 border-b border-gray-400 px-2 py-1" style={{ color: 'black' }}>{preparedByName}</span>
            </div>
          </div>

          {/* Releasing Clerk Section */}
          <div className="border border-black mb-4 p-2" style={{ backgroundColor: 'white' }}>
            <div className="font-bold text-sm" style={{ color: 'black' }}>Releasing Clerks Name</div>
            <div className="h-12 border-b border-gray-400 mb-2"></div>
            <div className="text-right text-xs italic" style={{ color: 'black' }}>Signature(Official Rubber Stamp)</div>
          </div>

          {/* Remarks and Rate */}
          <div className="border border-black mb-4" style={{ backgroundColor: 'white' }}>
            <div className="border-b border-black p-2">
              <div className="flex items-center">
                <span className="font-bold text-sm mr-2" style={{ color: 'black' }}>REMARKS:</span>
                <span className="flex-1" style={{ color: 'black' }}>{order.cargoType || ''}</span>
              </div>
            </div>
            <div className="text-center font-bold text-lg p-3" style={{ color: 'black' }}>
              ${order.ratePerTon} PER TON
            </div>
          </div>

          {/* WE Section */}
          <div className="border border-black mb-4 p-2" style={{ backgroundColor: 'white' }}>
            <div className="font-bold text-sm" style={{ color: 'black' }}>WE</div>
            <div className="h-12 border-b border-gray-400 mb-2"></div>
            <div className="text-right text-xs italic" style={{ color: 'black' }}>Signature(Official Rubber Stamp)</div>
          </div>

          {/* Acknowledgment */}
          <div className="border border-black pt-2 p-3 text-sm" style={{ backgroundColor: 'white' }}>
            <div className="mb-3 font-bold" style={{ color: 'black' }}>Acknowledge receipts of the goods as detailed above</div>
            <div className="grid grid-cols-2 gap-4 mb-3">
              <div className="flex items-center">
                <span className="font-bold w-32" style={{ color: 'black' }}>Delivers Name:</span>
                <span className="font-bold flex-1 border-b border-gray-400 px-2 py-1" style={{ color: 'black' }}>
                  {cleanDriverName(order.driverName) || ''}
                </span>
              </div>
              <div className="flex items-center">
                <span className="font-bold w-24" style={{ color: 'black' }}>Date:</span>
                <span className="font-bold flex-1 border-b border-gray-400 px-2 py-1" style={{ color: 'black' }}>{currentDate}</span>
              </div>
            </div>
            <div className="text-sm" style={{ color: 'black' }}>National ID/Passport No.</div>
            <div className="h-8 border-b border-gray-400 mt-1"></div>
          </div>
        </div>
      </div>
    </div>
    </>
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
      <div 
        className="w-full h-full flex items-center justify-center"
        style={{ 
          textAlign: 'center', 
          fontSize: '14px', 
          fontWeight: 'bold', 
          color: '#E67E22', 
          lineHeight: '1.2',
          background: 'white'
        }}
      >
        TAHMEED<br/>LOGO
      </div>
    );
  }

  return (
    <img 
      src={logoSources[currentLogoIndex]} 
      alt="Tahmeed Logo" 
      className="w-full h-full object-contain" 
      style={{ 
        background: 'white',
        maxWidth: '100%',
        maxHeight: '100%',
        display: 'block'
      }}
      onError={(e) => {
        console.error(`Logo failed to load from: ${e.currentTarget.src}`);
        if (currentLogoIndex < logoSources.length - 1) {
          setCurrentLogoIndex(prev => prev + 1);
        } else {
          setLogoError(true);
        }
      }} 
      onLoad={() => console.log('Logo loaded successfully from:', logoSources[currentLogoIndex])}
    />
  );
};

export default DeliveryNotePrint;

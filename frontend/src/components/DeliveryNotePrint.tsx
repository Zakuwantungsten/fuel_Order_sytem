import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { DeliveryOrder } from '../types';
import { cleanDriverName } from '../utils/dataCleanup';
import { formatDateOnly } from '../utils/timezone';

interface DeliveryNotePrintProps {
  order: DeliveryOrder;
  showOnScreen?: boolean;
  preparedBy?: string; // Optional: override username for prepared by field
}

const DeliveryNotePrint = ({ order, showOnScreen = false, preparedBy }: DeliveryNotePrintProps) => {
  const { user } = useAuth();
  const preparedByName = preparedBy || user?.username || '';
  
  const formatDate = (dateString: string) => {
    if (!dateString) return formatDateOnly(new Date());
    return formatDateOnly(new Date(dateString));
  };

  const currentDate = formatDate(order.date);
  
  return (
    <>
      <style>{`
        .delivery-note-print-content {
          background: white;
          color: #333333;
          font-family: 'Helvetica', 'Arial', sans-serif;
        }
        
        .do-watermark {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          opacity: 0.3;
          z-index: 0;
          pointer-events: none;
        }
        
        .do-content {
          position: relative;
          z-index: 1;
        }
        
        .do-line {
          height: 1px;
          background-color: #CCCCCC;
          margin: 0;
        }
        
        .do-header-bg {
          background-color: #F8F9FA;
          }
          
          ${!showOnScreen ? `
            .delivery-note-print-wrapper {
              position: fixed;
              left: -9999px;
              top: -9999px;
            }
          ` : ''}
        }
      `}</style>

      <div className={`delivery-note-print-wrapper ${showOnScreen ? 'block' : ''}`}>
        <div className="delivery-note-print-content max-w-4xl mx-auto bg-white relative" style={{ padding: '40px', minHeight: '842px' }}>
          
          {/* Watermark Logo */}
          <div className="do-watermark">
            <LogoComponent size={280} isWatermark={true} />
          </div>

          {/* Content */}
          <div className="do-content">
            
            {/* Header Section */}
            <div className="flex items-start justify-between mb-4">
              {/* Company Details - Left Side */}
              <div>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#E67E22', marginBottom: '8px' }}>
                  TAHMEED
                </div>
                <div style={{ fontSize: '8px', color: '#666666' }}>www.tahmeedcoach.co.ke</div>
                <div style={{ fontSize: '8px', color: '#666666' }}>Email: info@tahmeedcoach.co.ke</div>
                <div style={{ fontSize: '8px', color: '#666666' }}>Tel: +254 700 000 000</div>
              </div>
              
              {/* Logo - Right Side */}
              <div style={{ width: '80px', height: '60px' }}>
                <LogoComponent size={80} />
              </div>
            </div>

            {/* Title Section */}
            <div style={{ marginTop: '25px', marginBottom: '15px' }}>
              <div className="do-line"></div>
              <div className="do-header-bg" style={{ padding: '7px 0', textAlign: 'center' }}>
                <div style={{ fontSize: '14px', fontWeight: 'normal', color: '#333333' }}>
                  DELIVERY NOTE / GOODS RECEIVED NOTE
                </div>
              </div>
              <div className="do-line"></div>
            </div>

            {/* DO Number and Date */}
            <div style={{ marginTop: '15px', marginBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '12px', color: '#333333' }}>
                <span>{order.doType || 'DO'} #: </span>
                <span style={{ color: '#dc3545' }}>{order.doNumber}</span>
              </div>
              <div style={{ fontSize: '12px', color: '#333333' }}>
                Date: {currentDate}
              </div>
            </div>

            <div className="do-line" style={{ marginBottom: '15px' }}></div>

            {/* Client Information */}
            <div style={{ fontSize: '10px', marginBottom: '20px' }}>
              <div style={{ marginBottom: '5px' }}>
                <span style={{ color: '#333333' }}>Client: </span>
                <span style={{ fontWeight: 'bold', color: '#333333' }}>{order.clientName}</span>
              </div>
              <div style={{ fontSize: '9px', color: '#333333', marginBottom: '10px' }}>
                Please receive the under mentioned containers/Packages
              </div>
              <div style={{ display: 'flex', gap: '40px', color: '#333333' }}>
                <span>MPRO NO: {order.invoiceNos || 'N/A'}</span>
                <span>POL: {order.loadingPoint}</span>
                <span>Arrive: {order.importOrExport === 'IMPORT' ? 'TANGA/DAR' : order.loadingPoint}</span>
              </div>
            </div>

            <div className="do-line" style={{ marginBottom: '15px' }}></div>

            {/* Transport Details */}
            <div style={{ fontSize: '10px', marginBottom: '15px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div>
                  <span style={{ color: '#333333' }}>For Destination: </span>
                  <span style={{ fontWeight: 'bold', color: '#333333' }}>{order.destination}</span>
                </div>
                <div>
                  <span style={{ color: '#333333' }}>Lorry No: </span>
                  <span style={{ fontWeight: 'bold', color: '#333333' }}>{order.truckNo}</span>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <span style={{ color: '#333333' }}>Haulier: </span>
                  <span style={{ fontWeight: 'bold', color: '#333333' }}>{order.haulier || 'N/A'}</span>
                </div>
                <div>
                  <span style={{ color: '#333333' }}>Trailer No: </span>
                  <span style={{ fontWeight: 'bold', color: '#333333' }}>{order.trailerNo}</span>
                </div>
              </div>
            </div>

            <div className="do-line" style={{ marginBottom: '15px' }}></div>

            {/* Items Table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '15px', fontSize: '8px' }}>
              <thead>
                <tr className="do-header-bg">
                  <th style={{ border: '1px solid #CCCCCC', padding: '6px 5px', textAlign: 'center', width: '19%' }}>CONTAINER NO.</th>
                  <th style={{ border: '1px solid #CCCCCC', padding: '6px 5px', textAlign: 'center', width: '15.5%' }}>B/L NO</th>
                  <th style={{ border: '1px solid #CCCCCC', padding: '6px 5px', textAlign: 'center', width: '13.5%' }}>PACKAGES</th>
                  <th style={{ border: '1px solid #CCCCCC', padding: '6px 5px', textAlign: 'center', width: '18.5%' }}>CONTENTS</th>
                  <th style={{ border: '1px solid #CCCCCC', padding: '6px 5px', textAlign: 'center', width: '15.5%' }}>WEIGHT</th>
                  <th style={{ border: '1px solid #CCCCCC', padding: '6px 5px', textAlign: 'center', width: '17.5%' }}>MEASUREMENT</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ fontSize: '9px' }}>
                  <td style={{ border: '1px solid #CCCCCC', padding: '8px 5px', textAlign: 'center' }}>{order.containerNo || 'LOOSE CARGO'}</td>
                  <td style={{ border: '1px solid #CCCCCC', padding: '8px 5px', textAlign: 'center' }}>{order.borderEntryDRC || ''}</td>
                  <td style={{ border: '1px solid #CCCCCC', padding: '8px 5px', textAlign: 'center' }}>1</td>
                  <td style={{ border: '1px solid #CCCCCC', padding: '8px 5px', textAlign: 'center' }}>{order.cargoType || 'GOODS'}</td>
                  <td style={{ border: '1px solid #CCCCCC', padding: '8px 5px', textAlign: 'center' }}>
                    {order.rateType === 'per_ton' ? `${order.tonnages ?? 0} TONS` : '-'}
                  </td>
                  <td style={{ border: '1px solid #CCCCCC', padding: '8px 5px', textAlign: 'center' }}></td>
                </tr>
              </tbody>
            </table>

            <div className="do-line" style={{ marginBottom: '15px' }}></div>

            {/* Prepared By Section */}
            <div style={{ fontSize: '10px', marginBottom: '20px' }}>
              <span style={{ color: '#333333' }}>Prepared By: </span>
              {preparedByName && (
                <span style={{ fontWeight: 'bold', color: '#333333', marginLeft: '10px' }}>{preparedByName}</span>
              )}
              {!preparedByName && (
                <span style={{ display: 'inline-block', width: '200px', borderBottom: '1px solid #CCCCCC', marginLeft: '10px' }}></span>
              )}
            </div>

            <div className="do-line" style={{ marginBottom: '15px' }}></div>

            {/* Releasing Clerk Section */}
            <div style={{ fontSize: '10px', marginBottom: '15px' }}>
              <div style={{ color: '#333333', marginBottom: '10px' }}>Releasing Clerks Name</div>
              <div style={{ height: '30px', borderBottom: '1px solid #CCCCCC', marginBottom: '5px' }}></div>
              <div style={{ fontSize: '8px', color: '#666666', textAlign: 'right' }}>
                Signature (Official Rubber Stamp)
              </div>
            </div>

            <div className="do-line" style={{ marginBottom: '15px' }}></div>

            {/* Remarks and Rate */}
            <div style={{ marginBottom: '15px' }}>
              <div style={{ fontSize: '10px', color: '#333333', marginBottom: '10px' }}>REMARKS:</div>
              <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#333333', textAlign: 'center', padding: '10px 0' }}>
                {order.rateType === 'per_ton' || !order.rateType
                  ? `$${order.ratePerTon ?? 0} PER TON`
                  : `TOTAL: $${(order.totalAmount ?? order.ratePerTon ?? 0).toLocaleString()}`}
              </div>
            </div>

            <div className="do-line" style={{ marginBottom: '15px' }}></div>

            {/* WE Section */}
            <div style={{ fontSize: '10px', marginBottom: '15px' }}>
              <div style={{ color: '#333333', marginBottom: '10px' }}>WE</div>
              <div style={{ height: '30px', borderBottom: '1px solid #CCCCCC', marginBottom: '5px' }}></div>
              <div style={{ fontSize: '8px', color: '#666666', textAlign: 'right' }}>
                Signature (Official Rubber Stamp)
              </div>
            </div>

            <div className="do-line" style={{ marginBottom: '15px' }}></div>

            {/* Acknowledgment Section */}
            <div style={{ fontSize: '10px', marginBottom: '10px' }}>
              <div style={{ color: '#333333', marginBottom: '10px' }}>
                Acknowledge receipts of the goods as detailed above
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', marginBottom: '8px' }}>
                <div>
                  <span style={{ color: '#333333' }}>Delivers Name: </span>
                  <span style={{ fontWeight: 'bold', color: '#333333' }}>
                    {cleanDriverName(order.driverName) || ''}
                  </span>
                </div>
                <div>
                  <span style={{ color: '#333333' }}>Date: </span>
                  <span style={{ fontWeight: 'bold', color: '#333333' }}>{currentDate}</span>
                </div>
              </div>
              <div style={{ marginBottom: '5px', fontSize: '9px', color: '#333333' }}>
                National ID/Passport No.
              </div>
              <div style={{ height: '20px', borderBottom: '1px solid #CCCCCC' }}></div>
            </div>
              {/* Empty rows for additional items */}

            {/* Footer - Generation Info */}
            <div style={{ marginTop: '30px', fontSize: '8px', color: '#666666', display: 'flex', justifyContent: 'space-between' }}>
              <span>Generated: {formatDateOnly(new Date())}</span>
              <span>Page 1</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

// Logo component with fallback and watermark support
const LogoComponent = ({ size = 80, isWatermark = false }: { size?: number; isWatermark?: boolean }) => {
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
        style={{ 
          width: isWatermark ? `${size}px` : '100%',
          height: isWatermark ? `${size}px` : '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center', 
          fontSize: isWatermark ? '24px' : '14px', 
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
      style={{ 
        width: isWatermark ? `${size}px` : '100%',
        height: isWatermark ? `${size}px` : '100%',
        objectFit: 'contain',
        background: 'white',
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

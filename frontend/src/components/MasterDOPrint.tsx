import { DeliveryOrder } from '../types';

interface MasterDOPrintProps {
  order: DeliveryOrder;
  showOnScreen?: boolean;
}

const MasterDOPrint = ({ order, showOnScreen = false }: MasterDOPrintProps) => {
  const now = new Date();
  const currentDate = order.date || `${now.getDate()}-${now.toLocaleDateString('en-GB', { month: 'short' })}-${now.getFullYear()}`;
  
  // Default driver name from image
  const driverName = order.driverName || 'SALIM OMAR SHARIFF';

  return (
    <div className={showOnScreen ? "bg-white" : "hidden print:block bg-white"}>
      <style>{`
        @media print {
          @page { 
            size: A4;
            margin: 10mm;
          }
          body { 
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
          .print\\:block { display: block !important; }
          .hidden { display: none !important; }
          .no-print { display: none !important; }
          
          body * {
            visibility: hidden;
          }
          
          .master-do-print, .master-do-print * {
            visibility: visible;
            color: black !important;
          }
          
          .master-do-print {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          
          .fixed, .bg-gray-500, .bg-opacity-75 {
            display: none !important;
          }
        }

        .do-container {
          width: 100%;
          max-width: 700px;
          margin: 0 auto;
          font-family: Arial, sans-serif;
          border: 2px solid #000;
          background: white;
        }

        .do-header-title {
          text-align: center;
          border-bottom: 2px solid #000;
          padding: 8px;
          font-size: 14px;
          font-weight: bold;
          background: white;
        }

        .do-company-name {
          text-align: center;
          padding: 10px;
          font-size: 20px;
          font-weight: bold;
          border-bottom: 2px solid #000;
          background: white;
        }

        .do-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          border-bottom: 1px solid #000;
        }

        .do-cell {
          padding: 8px 10px;
          font-size: 11px;
          border-right: 1px solid #000;
        }

        .do-cell:last-child {
          border-right: none;
        }

        .do-cell-label {
          font-weight: bold;
          display: inline;
        }

        .do-cell-value {
          display: inline;
          margin-left: 5px;
        }

        .do-full-row {
          padding: 8px 10px;
          font-size: 11px;
          border-bottom: 1px solid #000;
        }

        .do-table {
          width: 100%;
          border-collapse: collapse;
        }

        .do-table th,
        .do-table td {
          border: 1px solid #000;
          padding: 8px;
          text-align: left;
          font-size: 11px;
        }

        .do-table th {
          font-weight: bold;
          text-align: center;
        }

        .do-cargo-section {
          min-height: 150px;
          background: #f0f0f0;
        }

        .do-signature-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          min-height: 80px;
        }

        .do-signature-cell {
          padding: 10px;
          border-right: 1px solid #000;
        }

        .do-signature-cell:last-child {
          border-right: none;
        }

        .do-signature-label {
          font-size: 11px;
          font-weight: bold;
          margin-bottom: 5px;
        }

        .do-signature-name {
          font-size: 12px;
          font-weight: bold;
          margin-top: 30px;
        }

        .do-rate-section {
          border-top: 2px solid #000;
          padding: 10px;
          text-align: center;
          font-size: 14px;
          font-weight: bold;
        }

        .red-text {
          color: #dc3545;
        }

        @media print {
          .do-container {
            border: 2px solid #000;
            box-shadow: none;
          }
        }
      `}</style>

      <div className="master-do-print do-container">
        {/* Header */}
        <div className="do-header-title">
          DELIVERY NOTE GOODS RECEIVED NOTE
        </div>

        {/* Company Name */}
        <div className="do-company-name">
          TAHMEED COACH TZ LTD
        </div>

        {/* DO Number and Date Row */}
        <div className="do-row">
          <div className="do-cell">
            <span className="do-cell-label red-text">{order.doNumber || '7069'}</span>
          </div>
          <div className="do-cell">
            <span className="do-cell-label">Date</span>
            <span className="do-cell-value">{currentDate}</span>
          </div>
        </div>

        {/* TO Row */}
        <div className="do-full-row">
          <span className="do-cell-label">TO</span>
          <span className="do-cell-value">{order.importOrExport || 'RELOAD'}</span>
        </div>

        {/* Receive Note */}
        <div className="do-full-row">
          Please receive the under mentioned containers/Packages ex.m.v
        </div>

        {/* MPRO and POL Row */}
        <div className="do-row">
          <div className="do-cell">
            <span className="do-cell-label">MPRO NO</span>
          </div>
          <div className="do-cell">
            <span className="do-cell-label">POL: TCC</span>
          </div>
        </div>

        {/* Second Row with blank cell and Arrive */}
        <div className="do-row">
          <div className="do-cell">
            {/* Empty cell */}
          </div>
          <div className="do-cell">
            <span className="do-cell-label">Arrive TANGA/DAR</span>
          </div>
        </div>

        {/* Destination and Haulier Row */}
        <div className="do-row">
          <div className="do-cell">
            <span className="do-cell-label">For Destination</span>
            <span className="do-cell-value">{order.destination || 'DAR'}</span>
          </div>
          <div className="do-cell">
            <span className="do-cell-label">Lorry No</span>
            <span className="do-cell-value">{order.truckNo || 'T424 EAF'}</span>
          </div>
        </div>

        {/* Haulier and Trailer Row */}
        <div className="do-row">
          <div className="do-cell">
            <span className="do-cell-label">Haulier</span>
            <span className="do-cell-value">{order.haulier || order.clientName || 'KOLWEZI'}</span>
          </div>
          <div className="do-cell">
            <span className="do-cell-label">Trailer No</span>
            <span className="do-cell-value">{order.trailerNo || 'T947 DZS'}</span>
          </div>
        </div>

        {/* Cargo Table */}
        <table className="do-table">
          <thead>
            <tr>
              <th>CONTAINER NO.</th>
              <th>B/L NO</th>
              <th>PACKAGES</th>
              <th>CONTENTS</th>
              <th>WEIGHT</th>
              <th>MEASUREMENT</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{order.containerNo || 'LOOSE CARGO'}</td>
              <td></td>
              <td></td>
              <td></td>
              <td style={{ fontWeight: 'bold' }}>{order.tonnages}<br/>TONS</td>
              <td></td>
            </tr>
            <tr className="do-cargo-section">
              <td colSpan={6} style={{ height: '120px', verticalAlign: 'top' }}></td>
            </tr>
          </tbody>
        </table>

        {/* Releasing Clerk Row */}
        <div className="do-full-row">
          <span className="do-cell-label">Releasing Clerks Name</span>
        </div>

        {/* Signature Line */}
        <div className="do-full-row" style={{ textAlign: 'right', fontSize: '10px' }}>
          Signature(Official Rubber Stamp)
        </div>

        {/* Remarks */}
        <div className="do-full-row">
          <span className="do-cell-label">REMARKS</span>
        </div>

        {/* Rate Section */}
        <div className="do-rate-section">
          RATE ${order.ratePerTon || '210'} PER TON
        </div>

        {/* WE Row */}
        <div className="do-full-row">
          <span className="do-cell-label">WE</span>
        </div>

        {/* Signature Line 2 */}
        <div className="do-full-row" style={{ textAlign: 'right', fontSize: '10px' }}>
          Signature(Official Rubber Stamp)
        </div>

        {/* Acknowledge Receipt */}
        <div className="do-full-row">
          Acknowledge receipts of the goods as detailed above
        </div>

        {/* Deliverers and Date Row */}
        <div className="do-row">
          <div className="do-cell">
            <span className="do-cell-label">Delivers Name</span>
            <span className="do-cell-value">{driverName}</span>
          </div>
          <div className="do-cell">
            <span className="do-cell-label">Date</span>
            <span className="do-cell-value">{currentDate}</span>
          </div>
        </div>

        {/* National ID Row */}
        <div className="do-full-row">
          <span className="do-cell-label">National ID/Passport No.</span>
        </div>
      </div>
    </div>
  );
};

export default MasterDOPrint;

import { forwardRef } from 'react';
import { LPOSummary } from '../types';

interface LPOPrintProps {
  data: LPOSummary;
  preparedBy?: string; // Username for prepared by field
  approvedBy?: string; // Name of approver (for Driver's Account LPOs)
}

const LPOPrint = forwardRef<HTMLDivElement, LPOPrintProps>(({ data, preparedBy, approvedBy }, ref) => {
  // Fixed sizing for consistent, readable PDFs across all LPOs
  const rowPadding = '4px';
  const fontSize = '13px';
  const headerFontSize = '14px';

  return (
    <div ref={ref} className="bg-white" style={{ 
      width: '210mm', 
      padding: '20mm',
      fontFamily: 'Arial, sans-serif',
      position: 'relative',
      boxSizing: 'border-box'
    }}>
      {/* Header Section */}
      <div style={{ 
        borderBottom: '3px solid #000',
        paddingBottom: '16px',
        marginBottom: '24px'
      }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '12px'
        }}>
          <div>
            <h1 style={{ 
              fontSize: '24px',
              fontWeight: 'bold',
              color: '#000',
              margin: '0 0 4px 0',
              letterSpacing: '0.5px'
            }}>
              LOCAL PURCHASE ORDER
            </h1>
            <p style={{ 
              fontSize: '13px',
              color: '#444',
              margin: 0,
              fontWeight: '500'
            }}>
              FUEL SUPPLY
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ 
              fontSize: '18px',
              fontWeight: 'bold',
              color: '#000',
              marginBottom: '4px'
            }}>
              LPO No. {data.lpoNo}
            </div>
            <div style={{ 
              fontSize: '12px',
              color: '#555',
              fontWeight: '500'
            }}>
              Date: {new Date(data.date).toLocaleDateString('en-GB', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
              })}
            </div>
          </div>
        </div>
        
        <div style={{ 
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '16px',
          marginTop: '16px',
          fontSize: '13px'
        }}>
          <div>
            <span style={{ fontWeight: 'bold', color: '#000' }}>Station:</span>{' '}
            <span style={{ color: '#333' }}>{data.station}</span>
          </div>
          <div>
            <span style={{ fontWeight: 'bold', color: '#000' }}>Order of:</span>{' '}
            <span style={{ color: '#333' }}>{data.orderOf}</span>
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div style={{ 
        marginBottom: '20px',
        padding: '8px 0',
        borderTop: '1px solid #ddd',
        borderBottom: '1px solid #ddd'
      }}>
        <p style={{ 
          fontSize: '13px',
          fontWeight: 'bold',
          textTransform: 'uppercase',
          margin: 0,
          color: '#000',
          letterSpacing: '0.3px'
        }}>
          KINDLY SUPPLY THE FOLLOWING LITERS
        </p>
      </div>

      {/* Table */}
      <table style={{ 
        width: '100%',
        borderCollapse: 'collapse',
        border: '2px solid #000',
        marginBottom: '24px',
        fontSize,
        tableLayout: 'fixed'
      }}>
        <thead>
          <tr style={{ backgroundColor: '#f5f5f5' }}>
            <th style={{ 
              border: '1px solid #000',
              padding: '8px 6px',
              textAlign: 'center',
              fontWeight: 'bold',
              fontSize: headerFontSize,
              color: '#000',
              verticalAlign: 'middle',
              lineHeight: '1.2'
            }}>
              DO No.
            </th>
            <th style={{ 
              border: '1px solid #000',
              padding: '8px 6px',
              textAlign: 'center',
              fontWeight: 'bold',
              fontSize: headerFontSize,
              color: '#000',
              verticalAlign: 'middle',
              lineHeight: '1.2'
            }}>
              Truck No.
            </th>
            <th style={{ 
              border: '1px solid #000',
              padding: '8px 6px',
              textAlign: 'center',
              fontWeight: 'bold',
              fontSize: headerFontSize,
              color: '#000',
              verticalAlign: 'middle',
              lineHeight: '1.2'
            }}>
              Liters
            </th>
            <th style={{ 
              border: '1px solid #000',
              padding: '8px 6px',
              textAlign: 'center',
              fontWeight: 'bold',
              fontSize: headerFontSize,
              color: '#000',
              verticalAlign: 'middle',
              lineHeight: '1.2'
            }}>
              Rate
            </th>
            <th style={{ 
              border: '1px solid #000',
              padding: '8px 6px',
              textAlign: 'center',
              fontWeight: 'bold',
              fontSize: headerFontSize,
              color: '#000',
              verticalAlign: 'middle',
              lineHeight: '1.2'
            }}>
              Amount
            </th>
            <th style={{ 
              border: '1px solid #000',
              padding: '8px 6px',
              textAlign: 'center',
              fontWeight: 'bold',
              fontSize: headerFontSize,
              color: '#000',
              verticalAlign: 'middle',
              lineHeight: '1.2'
            }}>
              Dest.
            </th>
          </tr>
        </thead>
        <tbody>
          {data.entries.map((entry, index) => {
            const isCancelled = entry.isCancelled;
            const isDriverAccount = entry.isDriverAccount;
            const displayDoNo = isCancelled ? 'CANCELLED' : isDriverAccount ? 'NIL' : entry.doNo;
            const displayDest = isDriverAccount ? 'NIL' : entry.dest;
            
            // Styling for cancelled and driver account entries
            const rowBgColor = isCancelled 
              ? '#ffe6e6' // Light red for cancelled
              : isDriverAccount 
                ? '#fff3e6' // Light orange for driver account
                : (index % 2 === 0 ? '#fff' : '#fafafa');
            
            const textColor = isCancelled ? '#cc0000' : '#000';
            const textDecoration = isCancelled ? 'line-through' : 'none';
            
            return (
            <tr key={index} style={{ backgroundColor: rowBgColor }}>
              <td style={{ 
                border: '1px solid #000',
                padding: '8px 6px',
                fontSize,
                textAlign: 'center',
                verticalAlign: 'middle',
                color: isCancelled ? '#cc0000' : isDriverAccount ? '#cc6600' : '#000',
                fontWeight: '500',
                textDecoration: isCancelled ? 'line-through' : 'none',
                lineHeight: '1.4'
              }}>
                {displayDoNo}
              </td>
              <td style={{ 
                border: '1px solid #000',
                padding: '8px 6px',
                fontSize,
                textAlign: 'center',
                verticalAlign: 'middle',
                color: textColor,
                fontWeight: '500',
                lineHeight: '1.4'
              }}>
                {entry.truckNo}
              </td>
              <td style={{ 
                border: '1px solid #000',
                padding: '8px 6px',
                fontSize,
                textAlign: 'center',
                verticalAlign: 'middle',
                color: textColor,
                fontWeight: '500',
                textDecoration,
                lineHeight: '1.4'
              }}>
                {entry.liters.toLocaleString()}
              </td>
              <td style={{ 
                border: '1px solid #000',
                padding: '8px 6px',
                fontSize,
                textAlign: 'center',
                verticalAlign: 'middle',
                color: isCancelled ? '#cc0000' : '#333',
                textDecoration,
                lineHeight: '1.4'
              }}>
                {entry.rate.toLocaleString('en-US', {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1
                })}
              </td>
              <td style={{ 
                border: '1px solid #000',
                padding: '8px 6px',
                fontSize,
                textAlign: 'center',
                verticalAlign: 'middle',
                color: textColor,
                fontWeight: '500',
                textDecoration,
                lineHeight: '1.4'
              }}>
                {entry.amount.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
                })}
              </td>
              <td style={{ 
                border: '1px solid #000',
                padding: '8px 6px',
                fontSize,
                textAlign: 'center',
                verticalAlign: 'middle',
                color: isCancelled ? '#cc0000' : isDriverAccount ? '#cc6600' : '#333',
                textDecoration: isCancelled ? 'line-through' : 'none',
                lineHeight: '1.4'
              }}>
                {displayDest}
              </td>
            </tr>
            );
          })}
          
          {/* Total Row */}
          <tr style={{ backgroundColor: '#e8e8e8' }}>
            <td style={{ 
              border: '1px solid #000',
              padding: '8px 6px',
              fontWeight: 'bold',
              fontSize: headerFontSize,
              textAlign: 'center',
              verticalAlign: 'middle',
              color: '#000',
              lineHeight: '1.4'
            }} colSpan={2}>
              TOTAL
            </td>
            <td style={{ 
              border: '1px solid #000',
              padding: '8px 6px',
              textAlign: 'center',
              verticalAlign: 'middle',
              fontWeight: 'bold',
              fontSize: headerFontSize,
              color: '#000',
              lineHeight: '1.4'
            }}>
              {data.entries
                .filter(entry => !entry.isCancelled)
                .reduce((sum, entry) => sum + entry.liters, 0)
                .toLocaleString()}
            </td>
            <td style={{ 
              border: '1px solid #000',
              padding: '8px 6px',
              verticalAlign: 'middle',
              lineHeight: '1.4'
            }}></td>
            <td style={{ 
              border: '1px solid #000',
              padding: '8px 6px',
              textAlign: 'center',
              verticalAlign: 'middle',
              fontWeight: 'bold',
              fontSize: headerFontSize,
              color: '#000',
              lineHeight: '1.4'
            }}>
              {data.entries
                .filter(entry => !entry.isCancelled)
                .reduce((sum, entry) => sum + entry.amount, 0)
                .toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
                })}
            </td>
            <td style={{ 
              border: '1px solid #000',
              padding: '8px 6px',
              verticalAlign: 'middle',
              lineHeight: '1.4'
            }}></td>
          </tr>
        </tbody>
      </table>

      {/* Signatures Section */}
      <div className="signatures-section" style={{ 
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '32px',
        marginTop: '48px',
        marginBottom: '32px'
      }}>
        <div>
          <div style={{ 
            borderTop: '2px solid #000',
            paddingTop: '8px',
            minHeight: '60px'
          }}>
            <p style={{ 
              fontSize: '12px',
              fontWeight: 'bold',
              margin: '0 0 4px 0',
              color: '#000'
            }}>
              Prepared By
            </p>
            <p style={{ 
              fontSize: '11px',
              color: '#000',
              margin: '4px 0',
              fontWeight: '500'
            }}>
              {preparedBy || ''}
            </p>
            <p style={{ 
              fontSize: '10px',
              color: '#666',
              margin: 0
            }}>
              Signature
            </p>
          </div>
        </div>
        <div>
          <div style={{ 
            borderTop: '2px solid #000',
            paddingTop: '8px',
            minHeight: '60px'
          }}>
            <p style={{ 
              fontSize: '12px',
              fontWeight: 'bold',
              margin: '0 0 4px 0',
              color: '#000'
            }}>
              Approved By
            </p>
            {approvedBy && (
              <p style={{ 
                fontSize: '11px',
                color: '#000',
                margin: '4px 0',
                fontWeight: '500'
              }}>
                {approvedBy}
              </p>
            )}
            <p style={{ 
              fontSize: '10px',
              color: '#666',
              margin: 0
            }}>
              {approvedBy ? 'Signature' : 'Name & Signature'}
            </p>
          </div>
        </div>
        <div>
          <div style={{ 
            borderTop: '2px solid #000',
            paddingTop: '8px',
            minHeight: '60px'
          }}>
            <p style={{ 
              fontSize: '12px',
              fontWeight: 'bold',
              margin: '0 0 4px 0',
              color: '#000'
            }}>
              Received By
            </p>
            <p style={{ 
              fontSize: '10px',
              color: '#666',
              margin: 0
            }}>
              Station Attendant
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ 
        marginTop: '32px',
        paddingTop: '16px',
        borderTop: '1px solid #ccc',
        fontSize: '10px',
        color: '#666'
      }}>
        <p style={{ margin: '0 0 4px 0' }}>
          This is a computer-generated document. No signature is required.
        </p>
        <p style={{ margin: 0 }}>
          For any queries, please contact the logistics department.
        </p>
      </div>

      {/* Print Styles */}
      <style>{`
        @media print {
          body {
            print-color-adjust: exact !important;
            -webkit-print-color-adjust: exact !important;
          }
          
          @page {
            size: A4;
            margin: 0;
          }
          
          .no-print {
            display: none !important;
          }
        }
        
        /* Prevent table rows from breaking across pages */
        table {
          page-break-inside: auto !important;
        }
        
        tr {
          page-break-inside: avoid !important;
          page-break-after: auto !important;
        }
        
        thead {
          display: table-header-group !important;
        }
        
        tbody tr td {
          vertical-align: middle !important;
          line-height: 1.4 !important;
        }
        
        /* Prevent page breaks right after table header */
        thead tr {
          page-break-after: avoid !important;
        }
        
        tfoot {
          display: table-footer-group !important;
        }
        
        /* Prevent signatures section from splitting */
        .signatures-section {
          page-break-inside: avoid !important;
        }
      `}</style>
    </div>
  );
});

LPOPrint.displayName = 'LPOPrint';

export default LPOPrint;

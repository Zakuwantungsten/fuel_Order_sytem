import { forwardRef, useMemo } from 'react';
import type { TangaLPO, TangaLPOEntry } from '../types';

interface TangaLPOPrintProps {
  data: TangaLPO;
  preparedBy?: string;
}

const TangaLPOPrint = forwardRef<HTMLDivElement, TangaLPOPrintProps>(({ data, preparedBy }, ref) => {
  const fontSize = '13px';
  const headerFontSize = '14px';
  const ROWS_PER_PAGE = 20;

  const pages = useMemo(() => {
    const allPages: TangaLPOEntry[][] = [];
    const entries = data.entries;
    if (entries.length <= ROWS_PER_PAGE) {
      allPages.push(entries);
    } else {
      for (let i = 0; i < entries.length; i += ROWS_PER_PAGE) {
        allPages.push(entries.slice(i, i + ROWS_PER_PAGE));
      }
    }
    return allPages;
  }, [data.entries]);

  const totalPages = pages.length;

  const totalLiters = data.entries.filter(e => !e.isCancelled).reduce((s, e) => s + e.liters, 0);
  const totalAmount = data.entries.filter(e => !e.isCancelled).reduce((s, e) => s + e.amount, 0);

  const formatAmount = (amount: number) =>
    data.currency === 'USD'
      ? `$ ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : `TZS ${amount.toLocaleString()}`;

  const renderTableHeader = () => (
    <thead>
      <tr style={{ backgroundColor: '#f5f5f5' }}>
        {[
          'DO No.',
          'Truck No.',
          'Liters',
          `Rate (${data.currency})`,
          `Amount (${data.currency})`,
          'Dest.',
        ].map(h => (
          <th
            key={h}
            style={{
              border: '1px solid #000',
              padding: '8px 6px',
              textAlign: 'center',
              fontWeight: 'bold',
              fontSize: headerFontSize,
              color: '#000',
              verticalAlign: 'middle',
              lineHeight: '1.2',
            }}
          >
            {h}
          </th>
        ))}
      </tr>
    </thead>
  );

  const renderTableRow = (entry: TangaLPOEntry, index: number) => {
    const isCancelled = entry.isCancelled;
    const isAmended = !isCancelled && entry.originalLiters != null && entry.originalLiters !== entry.liters;
    const rowBg = isCancelled ? '#ffe6e6' : isAmended ? '#fff7ed' : index % 2 === 0 ? '#fff' : '#fafafa';
    const textColor = isCancelled ? '#cc0000' : '#000';
    const textDecoration = isCancelled ? 'line-through' : 'none';

    return (
      <tr key={index} style={{ backgroundColor: rowBg }}>
        <td style={{ border: '1px solid #000', padding: '8px 6px', fontSize, textAlign: 'center', verticalAlign: 'middle', color: isCancelled ? '#cc0000' : '#000', fontWeight: '500', textDecoration, lineHeight: '1.4' }}>
          {isCancelled ? 'CANCELLED' : entry.doNo}
        </td>
        <td style={{ border: '1px solid #000', padding: '8px 6px', fontSize, textAlign: 'center', verticalAlign: 'middle', color: textColor, fontWeight: '500', lineHeight: '1.4' }}>
          {entry.truckNo}
        </td>
        <td style={{ border: '1px solid #000', padding: '8px 6px', fontSize, textAlign: 'center', verticalAlign: 'middle', color: textColor, fontWeight: '500', textDecoration, lineHeight: '1.4' }}>
          {isAmended && entry.originalLiters != null && (
            <span style={{ textDecoration: 'line-through', color: '#999', marginRight: '4px', fontSize: '11px' }}>
              {entry.originalLiters}
            </span>
          )}
          {entry.liters.toLocaleString()}
        </td>
        <td style={{ border: '1px solid #000', padding: '8px 6px', fontSize, textAlign: 'center', verticalAlign: 'middle', color: isCancelled ? '#cc0000' : '#333', textDecoration, lineHeight: '1.4' }}>
          {entry.rate.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
        </td>
        <td style={{ border: '1px solid #000', padding: '8px 6px', fontSize, textAlign: 'center', verticalAlign: 'middle', color: textColor, fontWeight: '500', textDecoration, lineHeight: '1.4' }}>
          {entry.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </td>
        <td style={{ border: '1px solid #000', padding: '8px 6px', fontSize, textAlign: 'center', verticalAlign: 'middle', color: isCancelled ? '#cc0000' : '#333', textDecoration: isCancelled ? 'line-through' : 'none', lineHeight: '1.4' }}>
          {entry.dest}
        </td>
      </tr>
    );
  };

  return (
    <div
      ref={ref}
      style={{
        width: '794px',
        minWidth: '794px',
        fontFamily: 'Arial, sans-serif',
        backgroundColor: '#fff',
        boxSizing: 'border-box',
      }}
    >
      {pages.map((pageEntries, pageIndex) => {
        const isFirstPage = pageIndex === 0;
        const isLastPage = pageIndex === totalPages - 1;
        return (
          <div
            key={pageIndex}
            className="lpo-page"
            style={{
              width: '100%',
              minHeight: '297mm',
              padding: '15mm 20mm 25mm 20mm',
              boxSizing: 'border-box',
              position: 'relative',
              pageBreakAfter: isLastPage ? 'auto' : 'always',
              backgroundColor: '#fff',
            }}
          >
            {isFirstPage && (
              <>
                <div style={{ borderBottom: '3px solid #000', paddingBottom: '16px', marginBottom: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div>
                      <h1 style={{ fontSize: '21px', fontWeight: 'bold', color: '#000', margin: '0 0 4px 0', letterSpacing: '0.5px' }}>
                        TANGA YARD — LOCAL PURCHASE ORDER
                      </h1>
                      <p style={{ fontSize: '13px', color: '#444', margin: 0, fontWeight: '500' }}>FUEL SUPPLY</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#000', marginBottom: '4px' }}>
                        LPO No. {data.lpoNo}
                      </div>
                      <div style={{ fontSize: '12px', color: '#555', fontWeight: '500' }}>
                        Date:{' '}
                        {new Date(data.date).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        })}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '16px', fontSize: '13px' }}>
                    <div>
                      <span style={{ fontWeight: 'bold', color: '#000' }}>Currency:</span>{' '}
                      <span style={{ color: '#333' }}>{data.currency}</span>
                    </div>
                    {(preparedBy || data.createdBy) && (
                      <div>
                        <span style={{ fontWeight: 'bold', color: '#000' }}>Prepared By:</span>{' '}
                        <span style={{ color: '#333' }}>{preparedBy || data.createdBy}</span>
                      </div>
                    )}
                    {data.approvedBy && (
                      <div>
                        <span style={{ fontWeight: 'bold', color: '#000' }}>Approved By:</span>{' '}
                        <span style={{ color: '#333' }}>{data.approvedBy}</span>
                      </div>
                    )}
                    {data.notes && (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <span style={{ fontWeight: 'bold', color: '#000' }}>Notes:</span>{' '}
                        <span style={{ color: '#333' }}>{data.notes}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ marginBottom: '20px', padding: '8px 0', borderTop: '1px solid #ddd', borderBottom: '1px solid #ddd' }}>
                  <p style={{ fontSize: '13px', fontWeight: 'bold', textTransform: 'uppercase', margin: 0, color: '#000', letterSpacing: '0.3px' }}>
                    KINDLY SUPPLY THE FOLLOWING LITERS
                  </p>
                </div>
              </>
            )}

            {!isFirstPage && (
              <div style={{ borderBottom: '2px solid #000', paddingBottom: '12px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#000', margin: '0', letterSpacing: '0.3px' }}>
                    LPO No. {data.lpoNo} (Continued) — Tanga Yard
                  </h2>
                  <div style={{ fontSize: '12px', color: '#555', fontWeight: '500' }}>
                    Date:{' '}
                    {new Date(data.date).toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                    })}
                  </div>
                </div>
              </div>
            )}

            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                border: '2px solid #000',
                marginBottom: '20px',
                fontSize,
                tableLayout: 'fixed',
              }}
            >
              {renderTableHeader()}
              <tbody>
                {pageEntries.map((entry, index) => renderTableRow(entry, index))}
                {isLastPage && (
                  <tr style={{ backgroundColor: '#e8e8e8' }}>
                    <td
                      colSpan={2}
                      style={{ border: '1px solid #000', padding: '8px 6px', fontWeight: 'bold', fontSize: headerFontSize, textAlign: 'center', verticalAlign: 'middle', color: '#000', lineHeight: '1.4' }}
                    >
                      TOTAL
                    </td>
                    <td style={{ border: '1px solid #000', padding: '8px 6px', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold', fontSize: headerFontSize, color: '#000', lineHeight: '1.4' }}>
                      {totalLiters.toLocaleString()}
                    </td>
                    <td style={{ border: '1px solid #000', padding: '8px 6px', verticalAlign: 'middle', lineHeight: '1.4' }} />
                    <td style={{ border: '1px solid #000', padding: '8px 6px', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold', fontSize: headerFontSize, color: '#000', lineHeight: '1.4' }}>
                      {formatAmount(totalAmount)}
                    </td>
                    <td style={{ border: '1px solid #000', padding: '8px 6px', verticalAlign: 'middle', lineHeight: '1.4' }} />
                  </tr>
                )}
              </tbody>
            </table>

            {isLastPage && (
              <>
                <div
                  className="signatures-section"
                  style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '32px', marginTop: '40px', marginBottom: '24px' }}
                >
                  {(['Prepared By', 'Approved By', 'Received By'] as const).map((label, i) => (
                    <div key={label}>
                      <div style={{ borderTop: '2px solid #000', paddingTop: '8px', minHeight: '60px' }}>
                        <p style={{ fontSize: '12px', fontWeight: 'bold', margin: '0 0 4px 0', color: '#000' }}>{label}</p>
                        {i === 0 && (preparedBy || data.createdBy) && (
                          <p style={{ fontSize: '11px', color: '#000', margin: '4px 0', fontWeight: '500' }}>
                            {preparedBy || data.createdBy}
                          </p>
                        )}
                        {i === 1 && data.approvedBy && (
                          <p style={{ fontSize: '11px', color: '#000', margin: '4px 0', fontWeight: '500' }}>
                            {data.approvedBy}
                          </p>
                        )}
                        <p style={{ fontSize: '10px', color: '#666', margin: 0 }}>
                          {i === 2
                            ? 'Station Attendant'
                            : (i === 0 && (preparedBy || data.createdBy)) || (i === 1 && data.approvedBy)
                            ? 'Signature'
                            : 'Name & Signature'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: '24px', paddingTop: '12px', borderTop: '1px solid #ccc', fontSize: '10px', color: '#666', marginBottom: '30px' }}>
                  <p style={{ margin: '0 0 4px 0' }}>This is a computer-generated document. No signature is required.</p>
                  <p style={{ margin: 0 }}>For any queries, please contact the logistics department.</p>
                </div>
              </>
            )}

            <div
              style={{
                position: 'absolute',
                bottom: '10mm',
                left: '20mm',
                right: '20mm',
                textAlign: 'center',
                fontSize: '11px',
                color: '#666',
                borderTop: '1px solid #ddd',
                paddingTop: '8px',
                fontWeight: '500',
              }}
            >
              Page {pageIndex + 1} of {totalPages}
            </div>
          </div>
        );
      })}

      <style>{`
        @media print {
          body { print-color-adjust: exact !important; -webkit-print-color-adjust: exact !important; }
          @page { size: A4; margin: 0; }
          .no-print { display: none !important; }
          .lpo-page { page-break-after: always; }
          .lpo-page:last-child { page-break-after: auto; }
        }
        table { page-break-inside: auto !important; }
        tr { page-break-inside: avoid !important; page-break-after: auto !important; }
        thead { display: table-header-group !important; }
        tbody tr td { vertical-align: middle !important; line-height: 1.4 !important; }
        thead tr { page-break-after: avoid !important; }
        tfoot { display: table-footer-group !important; }
        .signatures-section { page-break-inside: avoid !important; }
      `}</style>
    </div>
  );
});

TangaLPOPrint.displayName = 'TangaLPOPrint';

export default TangaLPOPrint;

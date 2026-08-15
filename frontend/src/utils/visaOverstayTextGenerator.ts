export interface DaySheetRow {
  caseId: string;
  truckNo: string;
  driverName: string;
  position?: string;
  paymentDate: string;
  passportDueDate?: string | null;
  caseStatus?: string | null;
  isCrossed?: boolean;
  crossedAt?: string | null;
  extraAmount?: number;
  extraDays?: number;
  daysSinceLastOverstay?: number;
  /** Confirmed money disbursed for this truck on this day */
  harrisonAmount?: number;
  overstaySequence: number | null;
  overstayLabel: string;
  overstayPaymentId: string | null;
  overstayAmount: number | null;
  overstayStatus: string | null;
  visaPaymentId: string | null;
  visaAmount: number | null;
  visaStatus: string | null;
  passportPaymentId?: string | null;
  passportAmount?: number | null;
  rowTotal: number;
}

export interface DaySheetSummary {
  date: string;
  truckCount: number;
  paymentCount?: number;
  overstayTotal: number;
  visaTotal: number;
  total: number;
  pendingCount: number;
  confirmedCount: number;
}

export function formatSheetDate(date: string) {
  const d = new Date(date + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function generateDaySheetWhatsAppText(date: string, rows: DaySheetRow[], totals: { overstay: number; visa: number; all: number }) {
  const active = rows.filter((r) => r.overstayStatus !== 'cancelled' || r.visaStatus !== 'cancelled');
  const header = [
    `*VISAS & OVERSTAYS*`,
    `Date: ${formatSheetDate(date)}`,
    ``,
  ].join('\n');

  const body = active
    .map((r, i) => {
      const visa = r.visaAmount != null ? `$${r.visaAmount}` : '-';
      const label = r.overstayLabel || 'First';
      return `${i + 1}. ${r.truckNo} | ${r.driverName} | ${label} $${r.overstayAmount ?? 0} | Visa ${visa} | ${r.position || '-'} | $${r.rowTotal}`;
    })
    .join('\n');

  const footer = [
    ``,
    `Trucks: ${active.length}`,
    `Overstay: $${totals.overstay}`,
    `Visa: $${totals.visa}`,
    `*Total: $${totals.all}*`,
  ].join('\n');

  return header + body + footer;
}

export function generateDaySheetCsv(date: string, rows: DaySheetRow[]) {
  const lines = [
    ['S/N', 'Date', 'Truck No.', 'Name', 'Particular', 'Overstay', 'Visa', 'Position', 'Row Total', 'Status'].join(','),
  ];
  rows.forEach((r, i) => {
    const status = r.overstayStatus || r.visaStatus || '';
    lines.push(
      [
        String(i + 1),
        date,
        r.truckNo,
        `"${(r.driverName || '').replace(/"/g, '""')}"`,
        r.overstayLabel || 'First',
        r.overstayAmount != null ? String(r.overstayAmount) : '',
        r.visaAmount != null ? String(r.visaAmount) : '-',
        `"${(r.position || '').replace(/"/g, '""')}"`,
        String(r.rowTotal),
        status,
      ].join(',')
    );
  });
  return lines.join('\n');
}

export async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

export function downloadTextFile(filename: string, content: string, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

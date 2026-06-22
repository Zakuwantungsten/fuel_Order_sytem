import type { DarLPO } from '../types';

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export const generateDarLPOText = (lpo: DarLPO): string => {
  const lines: string[] = [];
  lines.push(`LPO No. ${lpo.lpoNo},,, Date: ${new Date(lpo.date).toLocaleDateString('en-GB')}`);
  lines.push(`Yard: DAR,,, Currency: ${lpo.currency}`);
  if (lpo.notes) lines.push(`Notes: ${lpo.notes}`);
  lines.push('KINDLY SUPPLY THE FOLLOWING LITERS,,,,,,,');
  lines.push('DO No.,Truck No.,Liters,Rate,Amount,Dest.,Status,,,');

  lpo.entries.forEach(entry => {
    const doNo = entry.isCancelled ? 'CANCELLED' : entry.doNo;
    const status = entry.isCancelled ? 'CANCELLED' : entry.originalLiters != null ? 'AMENDED' : '';
    lines.push(`${doNo},${entry.truckNo},${entry.liters},${entry.rate.toFixed(1)},${entry.amount},${entry.dest},${status},,,`);
  });

  const activeLiters = lpo.entries.filter(e => !e.isCancelled).reduce((s, e) => s + e.liters, 0);
  const activeTotal = lpo.entries.filter(e => !e.isCancelled).reduce((s, e) => s + e.amount, 0);
  lines.push(`,,${activeLiters},,${activeTotal},TOTAL,,,`);

  return lines.join('\n');
};

export const copyDarLPOText = (lpo: DarLPO): Promise<boolean> =>
  copyToClipboard(generateDarLPOText(lpo));

export const generateDarLPOForWhatsApp = (lpo: DarLPO): string => {
  const lines: string[] = [];
  lines.push(`*DAR YARD LPO*`);
  lines.push(`LPO No: *${lpo.lpoNo}*`);
  lines.push(`Date: ${new Date(lpo.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`);
  lines.push(`Currency: ${lpo.currency}`);
  if (lpo.notes) lines.push(`Notes: ${lpo.notes}`);
  lines.push('');
  lines.push('*KINDLY SUPPLY THE FOLLOWING LITERS*');
  lines.push('');

  const cancelledEntries = lpo.entries.filter(e => e.isCancelled);
  const amendedEntries = lpo.entries.filter(e => !e.isCancelled && e.originalLiters != null);

  if (cancelledEntries.length > 0 || amendedEntries.length > 0) {
    lines.push('⚠️ *Note:* Some entries have special status');
    lines.push('');
  }

  lines.push('```');
  lines.push('DO No.  | Truck No. | Liters | Rate  | Amount   | Dest.');
  lines.push('--------|-----------|--------|-------|----------|------');

  lpo.entries.forEach(entry => {
    const prefix = entry.isCancelled ? '❌ ' : entry.originalLiters != null ? '✏️ ' : '';
    const doNo = (entry.isCancelled ? 'CANCLD' : (entry.doNo ?? '')).padEnd(7);
    const truckNo = entry.truckNo.padEnd(9);
    const liters = entry.liters.toString().padStart(6);
    const rate = entry.rate.toFixed(1).padStart(5);
    const amount = entry.amount.toLocaleString().padStart(8);
    const dest = (entry.dest || '').padEnd(6);
    lines.push(`${prefix}${doNo} | ${truckNo} | ${liters} | ${rate} | ${amount} | ${dest}`);
  });

  const activeLiters = lpo.entries.filter(e => !e.isCancelled).reduce((s, e) => s + e.liters, 0);
  const activeTotal = lpo.entries.filter(e => !e.isCancelled).reduce((s, e) => s + e.amount, 0);
  lines.push('--------|-----------|--------|-------|----------|------');
  lines.push(`${'TOTAL'.padEnd(7)} | ${''.padEnd(9)} | ${activeLiters.toString().padStart(6)} |       | ${activeTotal.toLocaleString().padStart(8)} |`);
  lines.push('```');

  if (cancelledEntries.length > 0) {
    lines.push('');
    lines.push(`❌ = Cancelled (${cancelledEntries.length} ${cancelledEntries.length === 1 ? 'entry' : 'entries'})`);
  }
  if (amendedEntries.length > 0) {
    lines.push(`✏️ = Amended (${amendedEntries.length} ${amendedEntries.length === 1 ? 'entry' : 'entries'})`);
  }

  return lines.join('\n');
};

export const copyDarLPOForWhatsApp = (lpo: DarLPO): Promise<boolean> =>
  copyToClipboard(generateDarLPOForWhatsApp(lpo));

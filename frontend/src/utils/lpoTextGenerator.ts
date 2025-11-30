import { LPOSummary } from '../types';

// Generate plain text format for LPO (similar to CSV format)
export const generateLPOText = (data: LPOSummary): string => {
  const lines = [];
  
  // Header
  lines.push(`Lpo No. ${data.lpoNo},,, Date : ${new Date(data.date).toLocaleDateString('en-GB')},,,,,,,,,,,,`);
  lines.push(`Station : ${data.station},,, Order of : ${data.orderOf},,,,,,,,,,,,`);
  lines.push('KINDLY SUPPLY THE FOLLOWING LITERS ,,,,,,,,,,,,,,,');
  lines.push('Do No.,Truck No.,Liters ,Rate ,Amount,Dest.,,,,,,,,,,');
  
  // Entries
  data.entries.forEach(entry => {
    lines.push(`${entry.doNo},${entry.truckNo},${entry.liters},${entry.rate.toFixed(1)},${entry.amount},${entry.dest},,,,,,,,,,`);
  });
  
  // Total
  lines.push(`,,TOTAL,,${data.total},,,,,,,,,,,`);
  
  return lines.join('\n');
};

// Copy LPO as plain text to clipboard
export const copyLPOTextToClipboard = async (data: LPOSummary): Promise<boolean> => {
  try {
    const text = generateLPOText(data);
    
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    } else {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      try {
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        return successful;
      } catch (err) {
        document.body.removeChild(textArea);
        return false;
      }
    }
  } catch (error) {
    console.error('Failed to copy text to clipboard:', error);
    return false;
  }
};

// Generate formatted table text for WhatsApp/SMS
export const generateLPOForWhatsApp = (data: LPOSummary): string => {
  const lines = [];
  
  lines.push(`*LPO No. ${data.lpoNo}*`);
  lines.push(`Date: ${new Date(data.date).toLocaleDateString('en-GB')}`);
  lines.push(`Station: ${data.station}`);
  lines.push(`Order of: ${data.orderOf}`);
  lines.push('');
  lines.push('*KINDLY SUPPLY THE FOLLOWING LITERS*');
  lines.push('');
  
  // Table header
  lines.push('```');
  lines.push('Do No.  | Truck No. | Liters | Rate | Amount   | Dest.');
  lines.push('--------|-----------|--------|------|----------|------');
  
  // Entries
  data.entries.forEach(entry => {
    const doNo = (entry.doNo || 'NIL').padEnd(7);
    const truckNo = entry.truckNo.padEnd(9);
    const liters = entry.liters.toString().padStart(6);
    const rate = entry.rate.toFixed(1).padStart(4);
    const amount = entry.amount.toLocaleString().padStart(8);
    const dest = (entry.dest || 'NIL').padEnd(6);
    
    lines.push(`${doNo} | ${truckNo} | ${liters} | ${rate} | ${amount} | ${dest}`);
  });
  
  // Total
  lines.push('--------|-----------|--------|------|----------|------');
  lines.push(`TOTAL${' '.repeat(28)} | ${data.total.toLocaleString().padStart(8)} |`);
  lines.push('```');
  
  return lines.join('\n');
};

// Copy LPO formatted for WhatsApp to clipboard  
export const copyLPOForWhatsApp = async (data: LPOSummary): Promise<boolean> => {
  try {
    const text = generateLPOForWhatsApp(data);
    
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    } else {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      try {
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        return successful;
      } catch (err) {
        document.body.removeChild(textArea);
        return false;
      }
    }
  } catch (error) {
    console.error('Failed to copy WhatsApp text to clipboard:', error);
    return false;
  }
};
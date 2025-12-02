import { LPOSummary } from '../types';

// Generate plain text format for LPO (similar to CSV format)
export const generateLPOText = (data: LPOSummary): string => {
  const lines = [];
  
  // Header
  lines.push(`Lpo No. ${data.lpoNo},,, Date : ${new Date(data.date).toLocaleDateString('en-GB')},,,,,,,,,,,,`);
  lines.push(`Station : ${data.station},,, Order of : ${data.orderOf},,,,,,,,,,,,`);
  lines.push('KINDLY SUPPLY THE FOLLOWING LITERS ,,,,,,,,,,,,,,,');
  lines.push('Do No.,Truck No.,Liters ,Rate ,Amount,Dest.,Status,,,,,,,,,');
  
  // Entries
  data.entries.forEach(entry => {
    // Handle cancelled and driver account entries
    let doNo = entry.doNo;
    let dest = entry.dest;
    let status = '';
    
    if (entry.isCancelled) {
      doNo = 'CANCELLED';
      status = 'CANCELLED';
    } else if (entry.isDriverAccount) {
      doNo = 'NIL';
      dest = 'NIL';
      status = 'DRIVER_ACCOUNT';
    }
    
    lines.push(`${doNo},${entry.truckNo},${entry.liters},${entry.rate.toFixed(1)},${entry.amount},${dest},${status},,,,,,,,,`);
  });
  
  // Calculate total excluding cancelled entries
  const activeTotal = data.entries
    .filter(e => !e.isCancelled)
    .reduce((sum, e) => sum + e.amount, 0);
  
  // Total
  lines.push(`,,TOTAL,,${activeTotal},,,,,,,,,,,`);
  
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
  
  // Check for cancelled entries
  const cancelledEntries = data.entries.filter(e => e.isCancelled);
  const driverAccountEntries = data.entries.filter(e => e.isDriverAccount);
  
  if (cancelledEntries.length > 0 || driverAccountEntries.length > 0) {
    lines.push('⚠️ *Note:* Some entries have special status');
    lines.push('');
  }
  
  // Table header
  lines.push('```');
  lines.push('Do No.  | Truck No. | Liters | Rate | Amount   | Dest.');
  lines.push('--------|-----------|--------|------|----------|------');
  
  // Entries
  data.entries.forEach(entry => {
    // Handle cancelled and driver account entries
    let doNo: string;
    let dest: string;
    let prefix = '';
    
    if (entry.isCancelled) {
      doNo = 'CANCLD';
      dest = entry.dest || '';
      prefix = '❌ ';
    } else if (entry.isDriverAccount) {
      doNo = 'NIL';
      dest = 'NIL';
      prefix = '👤 ';
    } else {
      doNo = entry.doNo || 'NIL';
      dest = entry.dest || 'NIL';
    }
    
    const formattedDoNo = doNo.padEnd(7);
    const truckNo = entry.truckNo.padEnd(9);
    const liters = entry.liters.toString().padStart(6);
    const rate = entry.rate.toFixed(1).padStart(4);
    const amount = entry.amount.toLocaleString().padStart(8);
    const formattedDest = dest.padEnd(6);
    
    lines.push(`${prefix}${formattedDoNo} | ${truckNo} | ${liters} | ${rate} | ${amount} | ${formattedDest}`);
  });
  
  // Calculate total excluding cancelled entries
  const activeTotal = data.entries
    .filter(e => !e.isCancelled)
    .reduce((sum, e) => sum + e.amount, 0);
  
  // Total
  lines.push('--------|-----------|--------|------|----------|------');
  lines.push(`TOTAL${' '.repeat(28)} | ${activeTotal.toLocaleString().padStart(8)} |`);
  lines.push('```');
  
  // Add legend if there are special entries
  if (cancelledEntries.length > 0) {
    lines.push('');
    lines.push(`❌ = Cancelled (${cancelledEntries.length} entries)`);
  }
  if (driverAccountEntries.length > 0) {
    lines.push('');
    lines.push(`👤 = Driver Account (${driverAccountEntries.length} entries)`);
  }
  
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
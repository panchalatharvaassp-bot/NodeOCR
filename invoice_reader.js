// invoice_reader.js
import fs from 'node:fs/promises';
import pdf from 'pdf-parse';

export async function extractInvoiceData(filePath) {
  const dataBuffer = await fs.readFile(filePath);
  const data = await pdf(dataBuffer);
  const text = data.text.replace(/\r/g, '').replace(/\s+/g, ' ').trim();

  const getMatch = (regex) => {
    const match = text.match(regex);
    return match ? match[1].trim() : null;
  };

  // ---- Header fields ----
  const customerName = getMatch(/CUSTOMER\s*NAME\s*[:\-]?\s*(.+?)(?=\s*DUE\s*DATE|TIN|ADDRESS|$)/i);
  const dueDate = getMatch(/DUE\s*DATE\s*[:\-]?\s*([0-9/.\-]+)/i);
  const accountNo = getMatch(/AC\s*NO\.?\s*[:\-]?\s*([0-9\-]+)/i);

  // ---- Line items ----
  const sectionMatch = text.match(/NO\.? *DESCRIPTION *UOM *QTY *UNIT *PRICE *AMOUNT\s+([\s\S]*?)(?:VATABLE SALES|TOTAL SALES|AMOUNT DUE|AMOUNT TO PAY)/i);
  const lineSection = sectionMatch ? sectionMatch[1].trim() : '';
  const lineItems = [];

  if (lineSection) {
    const itemRegex = /(\d+)\s*([A-Z0-9\s,.'\-]+?)\s*([\d,]+\.\d{2})\s*P?\s*([\d,]+\.\d{2})/gi;
    let m;
    const KNOWN_UOMS = ['ACT UNIT', 'UNIT', 'BAG', 'PCS', 'PC', 'EA'];

    while ((m = itemRegex.exec(lineSection)) !== null) {
      const lineNo = parseInt(m[1], 10);
      let description = m[2].trim();
      description = description.replace(/([a-z])([A-Z])/g, '$1 $2').trim();

      let unitPrice = m[3].trim();
      const amount = m[4].trim();

      // fix malformed data
      if (unitPrice.length === amount.length + 1 && unitPrice.endsWith(amount)) {
        unitPrice = amount;
      }

      // --- extract UOM ---
      let uom = null;
      const upperDesc = description.toUpperCase().replace(/\s+/g, ' ');
      for (const candidate of KNOWN_UOMS) {
        const idx = upperDesc.lastIndexOf(candidate);
        if (idx !== -1 && idx >= upperDesc.length - candidate.length - 1) {
          uom = candidate;
          description = description.slice(0, idx).trim();
          break;
        }
      }

      lineItems.push({
        lineNo,
        itemName: description,
        uom,
        quantity: 1,
        unitPrice,
        amount
      });
    }
  }

  return {
    customerName: customerName?.replace(/\s*[:\-]+$/, '').trim() || null,
    dueDate,
    accountNo,
    lineItems
  };
}

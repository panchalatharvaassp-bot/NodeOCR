// invoice_reader.js
import fs from 'node:fs/promises';
import pdf from 'pdf-parse';

export async function extractInvoiceData(filePath) {
  const dataBuffer = await fs.readFile(filePath);
  const data = await pdf(dataBuffer);

  // Keep line breaks for table parsing
  const rawText = data.text.replace(/\r/g, '');
  // Flattened version for simpler header regexes
  const flatText = rawText.replace(/\s+/g, ' ').trim();

  const vendorBillData = extractVendorBillData(rawText, flatText);
  return vendorBillData;
}

/*
 * Returned JSON shape:
 * {
 *   transactionType: 'vendorbill',
 *   header: {...},
 *   lines: {
 *     items: [...],
 *     expenses: [...]
 *   },
 *   totals: {...}
 * }
 */

function extractVendorBillData(rawText, flatText) {
  const getFlat = (regex) => {
    const m = flatText.match(regex);
    return m ? m[1].trim() : null;
  };

  const getRaw = (regex) => {
    const m = rawText.match(regex);
    return m ? m[1].trim() : null;
  };

  // ---------- HEADER FIELDS ----------

  const docNumber =
    getFlat(/#\s*(VENDBILL\d+)/i) ||
    getFlat(/Vendor Bill\s*#\s*(\S+)/i);

  const billDateRaw =
    getFlat(/Bill\s*Date\s*[:\-]?\s*([0-9/.\-]+)/i) ||
    getFlat(/VENDBILL\d+\s*([0-9/.\-]+)/i);

  const vendorName = getRaw(/Vendor:\s*(.+?)(?=\s+Subsidiary:|\s+Due\s*Date:|$)/i);
  const subsidiaryName = getRaw(/Subsidiary:\s*(.+?)(?=\s+Due\s*Date:|\s+Terms:|$)/i);
  const dueDateRaw = getFlat(/Due\s*Date\s*[:\-]?\s*([0-9/.\-]+)/i);
  const termsName = getFlat(/Terms\s*[:\-]?\s*(.+?)(?=\s+[0-9/.\-]|$)/i);

  const billDate = normalizeDate(billDateRaw);
  const dueDate = normalizeDate(dueDateRaw);

  // First get totals
  const totals = parseVendorBillTotals(rawText);

  // Then parse lines with knowledge of totals for fallback
  const { items, expenses } = parseVendorBillLines(rawText, totals);

  return {
    transactionType: 'vendorbill',
    header: {
      docNumber: docNumber || null,
      billDate,
      dueDate,
      vendorName: vendorName || null,
      subsidiaryName: subsidiaryName || null,
      termsName: termsName || null
    },
    lines: {
      items,
      expenses
    },
    totals
  };
}

function parseVendorBillLines(rawText, totals) {
  const items = [];
  const expenses = [];

  // ---------- ITEMS TABLE ----------
  // Try to capture everything between the Item header and the Tax/Amount summary
  const itemsBlockMatch = rawText.match(
    /Item\s+Quantity\s+Tax\s+Rate\s+Tax\s+Amt\s+Rate\s+Amount([\s\S]*?)Tax\s*PHP/i
  );

  if (itemsBlockMatch) {
    const block = itemsBlockMatch[1];

    const rows = block
      .split('\n')
      .map((r) => r.trim())
      .filter((r) => r);

    for (const row of rows) {
      // Expected pattern (adjust if you see different layout):
      // UN125NE-ORG 2 12% PHP19,392.90 PHP80,803.55 PHP161,607.10
      const m = row.match(
        /^(.+?)\s+(\d+(?:\.\d+)?)\s+(\d+)%\s+PHP([\d,]+\.\d+|0\.00)\s+PHP([\d,]+\.\d+|0\.00)\s+PHP([\d,]+\.\d+|0\.00)$/
      );
      if (!m) continue;

      const [, itemName, qty, taxRate, taxAmt, rate, amount] = m;

      items.push({
        itemName: itemName.trim(),
        quantity: Number(qty),
        taxRatePercent: Number(taxRate),
        taxAmount: parsePhp(taxAmt),
        rate: parsePhp(rate),
        amount: parsePhp(amount)
      });
    }
  }

  // ---------- EXPENSES TABLE ----------
  // Similar header-based capture for Expenses
  const expBlockMatch = rawText.match(
    /Account\s+Tax\s+Rate\s+Tax\s+Amt\s+Amount([\s\S]*?)Tax\s*PHP/i
  ) || rawText.match(/Account\s+Tax\s+Rate\s+Tax\s+Amt\s+Amount([\s\S]*)$/i);

  if (expBlockMatch) {
    const block = expBlockMatch[1];

    const rows = block
      .split('\n')
      .map((r) => r.trim())
      .filter((r) => r);

    for (const row of rows) {
      // Expected pattern:
      // 14306 Repairs and Maintenance Cost : RME Cost - Miscellaneous 0% PHP0.00 PHP5,000.00
      const m = row.match(
        /^(.+?)\s+(\d+)%\s+PHP([\d,]+\.\d+|0\.00)\s+PHP([\d,]+\.\d+|0\.00)$/
      );
      if (!m) continue;

      const [, accountName, taxRate, taxAmt, amount] = m;

      expenses.push({
        accountName: accountName.trim(),
        taxRatePercent: Number(taxRate),
        taxAmount: parsePhp(taxAmt),
        amount: parsePhp(amount)
      });
    }
  }

  // ---------- FALLBACKS ----------

  // If we have no items and exactly one expense, but amounts are missing, use totals
  if (items.length === 0 && expenses.length === 1) {
    const line = expenses[0];
    if (line.amount == null && totals.amountTotal != null) {
      line.amount = totals.amountTotal;
    }
    if (line.taxAmount == null && totals.taxTotal != null) {
      line.taxAmount = totals.taxTotal;
    }
  }

  // If we still have absolutely nothing, create one synthetic expense line from totals
  if (items.length === 0 && expenses.length === 0 && totals.amountTotal != null) {
    expenses.push({
      accountName: 'AUTO-GENERATED FROM TOTALS',
      taxRatePercent: null,
      taxAmount: totals.taxTotal ?? null,
      amount: totals.amountTotal
    });
  }

  return { items, expenses };
}

function parseVendorBillTotals(rawText) {
  const taxMatch = rawText.match(/Tax\s*PHP\s*([\d,]+\.\d+|0\.00)/i);
  const amtMatch = rawText.match(/Amount\s*PHP\s*([\d,]+\.\d+|0\.00)/i);

  return {
    taxTotal: taxMatch ? parsePhp(taxMatch[1]) : null,
    amountTotal: amtMatch ? parsePhp(amtMatch[1]) : null,
    currency: 'PHP'
  };
}

/* ---------- UTILS ---------- */

function parsePhp(numStr) {
  if (!numStr) return null;
  const n = Number(numStr.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function normalizeDate(d) {
  if (!d) return null;
  const m = d.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (!m) return d;
  const [, mm, dd, yyyy] = m;
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

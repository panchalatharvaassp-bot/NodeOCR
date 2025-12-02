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

  // We now assume every file is a Vendor Bill
  const vendorBillData = extractVendorBillData(rawText, flatText);
  return vendorBillData;
}

/*
 * Returned JSON shape:
 * {
 *   transactionType: 'vendorbill',
 *   header: {
 *     docNumber,
 *     billDate,
 *     dueDate,
 *     vendorName,
 *     subsidiaryName,
 *     termsName
 *   },
 *   lines: {
 *     items: [
 *       { itemName, quantity, taxRatePercent, taxAmount, rate, amount }
 *     ],
 *     expenses: [
 *       { accountName, taxRatePercent, taxAmount, amount }
 *     ]
 *   },
 *   totals: {
 *     taxTotal,
 *     amountTotal,
 *     currency: 'PHP'
 *   }
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

  // Example: "#VENDBILL194"
  const docNumber =
    getFlat(/#\s*(VENDBILL\d+)/i) ||
    getFlat(/Vendor Bill\s*#\s*(\S+)/i);

  // Bill date – typical formats like 03/27/2025
  const billDateRaw =
    getFlat(/Bill\s*Date\s*[:\-]?\s*([0-9/.\-]+)/i) ||
    getFlat(/VENDBILL\d+\s*([0-9/.\-]+)/i);

  const vendorName = getRaw(/Vendor:\s*(.+?)(?=\s+Subsidiary:|\s+Due\s*Date:|$)/i);
  const subsidiaryName = getRaw(/Subsidiary:\s*(.+?)(?=\s+Due\s*Date:|\s+Terms:|$)/i);
  const dueDateRaw = getFlat(/Due\s*Date\s*[:\-]?\s*([0-9/.\-]+)/i);
  const termsName = getFlat(/Terms\s*[:\-]?\s*(.+?)(?=\s+[0-9/.\-]|$)/i);

  const billDate = normalizeDate(billDateRaw);
  const dueDate = normalizeDate(dueDateRaw);

  // ---------- LINES (ITEMS + EXPENSES) ----------
  const { items, expenses } = parseVendorBillLines(rawText);

  // ---------- TOTALS ----------
  const totals = parseVendorBillTotals(rawText);

  // Fallback: expense-only bills with one line → push totals to that line
  if (items.length === 0 && expenses.length === 1) {
    const line = expenses[0];
    if (line.amount == null && totals.amountTotal != null) {
      line.amount = totals.amountTotal;
    }
    if (line.taxAmount == null && totals.taxTotal != null) {
      line.taxAmount = totals.taxTotal;
    }
  }

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

function parseVendorBillLines(rawText) {
  const items = [];
  const expenses = [];

  const hasItems = /Items\s*\n/i.test(rawText);
  const hasExpenses = /Expenses\s*\n/i.test(rawText);

  // ---------- ITEMS TABLE ----------
  if (hasItems) {
    // Grab block after "Items" until "Tax PHP"
    const itemsBlockMatch = rawText.match(/Items\s*\n([\s\S]*?)Tax\s*PHP/i);
    const block = itemsBlockMatch ? itemsBlockMatch[1] : '';

    const rows = block
      .split('\n')
      .map((r) => r.trim())
      .filter((r) => r);

    // Skip header row like "Item Quantity Tax Rate Tax Amt Rate Amount"
    const dataRows = rows.filter((r) => !/Item\s+Quantity\s+Tax\s+Rate/i.test(r));

    for (const row of dataRows) {
      // Expected pattern:
      // UN125NE-ORG 2 12% PHP19,392.90 PHP80,803.55 PHP161,607.10
      const m = row.match(
        /^(.+?)\s+(\d+)\s+(\d+)%\s+PHP([\d,]+\.\d+|0\.00)\s+PHP([\d,]+\.\d+|0\.00)\s+PHP([\d,]+\.\d+|0\.00)$/
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
  if (hasExpenses) {
    // Grab block after "Expenses" until "Tax PHP" (or end if not found)
    const expBlockMatch =
      rawText.match(/Expenses\s*\n([\s\S]*?)Tax\s*PHP/i) ||
      rawText.match(/Expenses\s*\n([\s\S]*)$/i);

    const block = expBlockMatch ? expBlockMatch[1] : '';

    const rows = block
      .split('\n')
      .map((r) => r.trim())
      .filter((r) => r);

    // Remove header-like rows
    const dataRows = rows.filter(
      (r) => !/Account\s+Tax\s+Rate\s+Tax\s+Amt\s+Amount/i.test(r)
    );

    if (dataRows.length > 0) {
      // For your current use case, we assume ONE expense line.
      // Join everything into one string to reconstruct the full account.
      const joined = dataRows.join(' ');

      // Try to separate account name from the numeric tail.
      // We stop at the first " 0%"/" 12%" or " PHP" pattern if present.
      let accountName = joined;

      const splitByPercent = joined.split(/\s+\d+%\s+/);
      if (splitByPercent.length > 1) {
        accountName = splitByPercent[0];
      } else {
        const idxPhp = joined.indexOf(' PHP');
        if (idxPhp > 0) {
          accountName = joined.substring(0, idxPhp);
        }
      }

      accountName = accountName.replace(/\s+/g, ' ').trim();

      expenses.push({
        accountName,
        taxRatePercent: null, // we can ignore this for now
        taxAmount: null,      // will be filled from totals if single-line
        amount: null          // will be filled from totals if single-line
      });
    }
  }

  return { items, expenses };
}

function parseVendorBillTotals(rawText) {
  const taxMatch = rawText.match(/Tax\s*PHP\s*([\d,]+\.\d+|0\.00)/i);
  const amtMatch = rawText.match(/Amount\s*PHP\s*([\d,]+\.\d+|0\.00)/i);

  return {
    taxTotal

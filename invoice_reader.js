// invoice_reader.js
import fs from "node:fs/promises";
import pdf from "pdf-parse";

export async function extractInvoiceData(filePath) {
  const dataBuffer = await fs.readFile(filePath);
  const data = await pdf(dataBuffer);

  const rawText = data.text.replace(/\r/g, "");
  const flatText = rawText.replace(/\s+/g, " ").trim();

  return extractVendorBillData(rawText, flatText);
}

function extractVendorBillData(rawText, flatText) {
  const getFlat = (regex) => {
    const m = flatText.match(regex);
    return m ? m[1].trim() : null;
  };

  const getRaw = (regex) => {
    const m = rawText.match(regex);
    return m ? m[1].trim() : null;
  };

  const docNumber =
    getFlat(/#\s*(VENDBILL\d+)/i) ||
    getFlat(/Vendor Bill\s*#\s*(\S+)/i);
  const billDateRaw =
    getFlat(/Bill\s*Date\s*[:\-]?\s*([0-9/.\-]+)/i) ||
    getFlat(/VENDBILL\d+\s*([0-9/.\-]+)/i);

  const vendorName = getRaw(
    /Vendor:\s*(.+?)(?=\s+Subsidiary:|\s+Due\s*Date:|$)/i
  );
  const subsidiaryName = getRaw(
    /Subsidiary:\s*(.+?)(?=\s+Due\s*Date:|\s+Terms:|$)/i
  );
  const dueDateRaw = getFlat(/Due\s*Date\s*[:\-]?\s*([0-9/.\-]+)/i);
  const termsName = getFlat(
    /Terms\s*[:\-]?\s*(.+?)(?=\s+[0-9/.\-]|$)/i
  );

  const billDate = normalizeDate(billDateRaw);
  const dueDate = normalizeDate(dueDateRaw);

  const totals = parseVendorBillTotals(rawText);
  const { items, expenses } = parseVendorBillLines(rawText, totals);

  return {
    transactionType: "vendorbill",
    header: {
      docNumber: docNumber || null,
      billDate,
      dueDate,
      vendorName: vendorName || null,
      subsidiaryName: subsidiaryName || null,
      termsName: termsName || null,
    },
    lines: {
      items,
      expenses,
    },
    totals,
  };
}

function parseVendorBillLines(rawText, totals) {
  const items = [];
  const expenses = [];

  console.log("=== RAW TEXT START ===");
console.log(rawText);
console.log("=== RAW TEXT END ===");

  // Extract between Items table header and "Tax PHP"
  const itemsBlockMatch = rawText.match(
    /Item\s+Quantity\s+Tax\s+Rate\s+Tax\s+Amt\s+Rate\s+Amount([\s\S]*?)Tax\s*PHP/i
  );

  if (itemsBlockMatch) {
    let block = itemsBlockMatch[1]
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l);

    // Combine broken lines: if a line doesn't end with a digit, % or PHP-value → append to previous
    const merged = [];
    for (const line of block) {
      if (
        merged.length &&
        !/(\d|%|PHP\d|\.00)$/.test(line)
      ) {
        merged[merged.length - 1] += " " + line;
      } else {
        merged.push(line);
      }
    }

    // Now parse each merged line
    for (const row of merged) {
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
        amount: parsePhp(amount),
      });
    }
  }

  // fallback: add synthetic expense line if no items
  if (items.length === 0 && totals.amountTotal != null) {
    expenses.push({
      accountName: "AUTO-GENERATED FROM TOTALS",
      taxRatePercent: null,
      taxAmount: totals.taxTotal ?? null,
      amount: totals.amountTotal,
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
    currency: "PHP",
  };
}

function parsePhp(numStr) {
  if (!numStr) return null;
  return Number(numStr.replace(/,/g, ""));
}

function normalizeDate(d) {
  if (!d) return null;
  const m = d.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (!m) return d;
  const [, mm, dd, yyyy] = m;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

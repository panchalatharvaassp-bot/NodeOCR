import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import dotenv from 'dotenv'

dotenv.config()

const ai = new GoogleGenAI({
  apiKey: process.env.GOOGLE_API_KEY,
});

export async function main(base64) {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `
You are an AI system designed to extract accounting transaction data from documents and structure it for NetSuite ERP.

Your task:
1. Identify the transaction type in the document.
2. Extract ONLY the fields required to create the transaction in NetSuite.
3. Return the result strictly as valid JSON.

Supported transaction types:
- Vendor Bill
- Invoice
- Purchase Order
- Sales Order
- Credit Memo
- Vendor Credit
- Expense Report

Output format (must match exactly):

// {
//   "transaction_type": "<Transaction Type Name>",
//   "netsuite_transaction_data": {
//       // Header level data

//     // "body": {
//     //   // Header-level fields only
//     //   // Examples: subsidiary, entity, tranDate, dueDate, terms, memo, currency, externalid
//     // },
//     // "items": [
//     //   {
//     //     // Line-level fields only
//     //     // Examples: item, description, quantity, rate, amount, taxcode, department, class, location
//     //   }
//     // ]

//   }
// }

{
    "transaction_type": "<Transaction Type Name such that record.load can be directly used in suitescript>"
    // Body level data goes here 
    "items": [
        {
            // Line level data goes here
        }
    ],
    "expenses": [
        {
            // Expense line level data goes here (if applicable)
        }
    ]
}

Extraction Rules:

1. Always include:
   - transaction_type
   - netsuite_transaction_data
   - body
   - items

2. Use NetSuite field names where possible:
   Header fields:
   - subsidiary
   - entity
   - tranDate
   - dueDate
   - memo
   - terms
   - currency
   - externalid

3. Item line fields:
   - item
   - description
   - quantity
   - rate
   - amount
   - taxcode

4. Only extract fields that are clearly present in the document.
   Do NOT guess values.

5. If line items exist, extract them exactly as listed.

6. If the document does not contain line items, return an empty array.

7. Do NOT include totals inside items unless they appear as a line.

8. Ignore:
   - company addresses
   - bank details
   - logos
   - footer notes
   - payment instructions

9. The final output must be **valid JSON only**.
   Do not include explanations, markdown, or comments.

Example output:

{
  "transaction_type": "Vendor Bill",
  "netsuite_transaction_data": {
    "body": {
      "entity": "Motorola",
      "subsidiary": "Honeycomb Holdings Inc.",
      "tranDate": "2025-09-11",
      "dueDate": "2025-10-11",
      "terms": "Net 30"
    },
    "items": [
      {
        "item": "ACC00008",
        "quantity": 1,
        "rate": 45,
        "amount": 45
      },
      {
        "item": "FAM00001",
        "quantity": 1,
        "rate": 12500,
        "amount": 12500
      }
    ]
  }
}
`
          },
          {
            inlineData: {
              mimeType: "application/pdf",
              data: base64,
            },
          },
        ],
      },
    ],
  });

  // console.log(response)
  // Display output text
  // console.log(response.text);

  return response.text
}

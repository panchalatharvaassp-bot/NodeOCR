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
2. Extract ONLY the fields required to create the transaction in NetSuite (always extract subsidiary, department, class and location).
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

{
    "transaction_type": "<Transaction Type name must be all underlowercase and no gaps such between text (Example: 'vendorbill', 'salesorder', 'expensereport', 'invoice')>",
    // ONLY the fields fields required to create the transaction in NetSuite.
    "items": [
        {
            "item": "",
            "description": "",
            "quantity": "",
            "rate": "",
            "amount": "",
            "taxcode": ""
        }
    ],
    "expenses": [
        {
            "account": "",
            "category": "",
            "amount": "",
            "memo": "",
            "taxcode": ""
        }
    ]
}

Extraction Rules:

1. Always include:
   - transaction_type
   - items
   - expenses

2. Body level fields must appear at the top level of the JSON.

3. Use NetSuite field names where possible.

4. Header fields that may appear:
   - subsidiary
   - entity
   - tranDate
   - dueDate
   - memo
   - terms
   - currency
   - externalid

5. Item line fields:
   - item
   - description
   - quantity
   - rate
   - amount
   - taxcode

6. Expense line fields:
   - account
   - category
   - amount
   - memo
   - taxcode

7. Only extract fields clearly present in the document.
   Do NOT guess values.

8. If line items exist, extract them exactly as listed.

9. If the document does not contain line items, return:
   "items": []

10. If the document does not contain expenses, return:
   "expenses": []

11. Do NOT include totals inside items unless they appear as a line item.

12. Ignore:
   - company addresses
   - bank details
   - logos
   - footer notes
   - payment instructions

13. The final output must be valid JSON only.
Do not include explanations, markdown, or comments.

Example output:

{
  "transaction_type": "Vendor Bill",
  "entity": "Motorola",
  "subsidiary": "Honeycomb Holdings Inc.",
  "tranDate": "2025-09-11",
  "dueDate": "2025-10-11",
  "terms": "Net 30",
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
  ],
  "expenses": []
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

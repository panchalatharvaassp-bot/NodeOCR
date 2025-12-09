import { GoogleGenAI } from "@google/genai";
import fs from "fs";

const ai = new GoogleGenAI({
  apiKey: "AIzaSyCN5nkLNpc3cBIfrNg5KSObaAe6XxOh-hc",
});

export async function main(base64) {
  // Read PDF file and convert to Base64
  // const pdfBytes = fs.readFileSync("./Transaction.pdf");
  // const base64Pdf = pdfBytes.toString("base64");

  // console.log(base64Pdf.length)

//   Send request to Gemini
// console.log(base64, 'base64')
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `You are a data extraction model that identifies the transaction type and extracts only the information required to create that transaction in NetSuite.

            Return your answer **strictly** in JSON format following this exact structure — regardless of the transaction type.

            {
              "transaction_type": "<Transaction Type Name>",
              "netsuite_transaction_data": {
                "body": {
                  // All header-level fields (subsidiary, entity, dates, memo, terms, etc.)
                },
                "items": [
                  {
                    // Line-level fields (item name/description, quantity, rate, amount, tax code, etc.)
                  }
                ]
              }
            }

            Rules:
            1. Always include both "body" and "items" keys inside "netsuite_transaction_data".
            2. Do not include any explanatory text, commentary, or formatting outside of JSON.
            3. Keep the key names clean and consistent with NetSuite terminology (e.g., "subsidiary", "entity", "tranDate", "memo", "amount").
            4. If a field does not exist, omit it rather than returning null or empty strings.
            5. The final output must be **valid JSON**.`,
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

// main().catch(console.error);

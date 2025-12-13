import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const ai = new GoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY,
});

export async function main(base64) {
  const response = await ai.models.generateContent({
    model: "gemini-1.5-flash",
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
    "body": {},
    "items": []
  }
}

Rules:
1. Always include both "body" and "items" keys inside "netsuite_transaction_data".
2. Do not include any explanatory text, commentary, or formatting outside of JSON.
3. Keep key names consistent with NetSuite terminology (subsidiary, entity, tranDate, memo, amount, etc.)
4. If a field does not exist, omit it.
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

  return response.response.text();
}

// 👇 Run the script and log the output
main(process.env.BASE_64)
  .then(result => {
    console.log("✅ Gemini Output:");
    console.log(result);
  })
  .catch(err => {
    console.error("❌ Error:", err);
  });

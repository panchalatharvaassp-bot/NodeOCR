import { GoogleGenAI } from "@google/genai";
import fs from "fs";

const ai = new GoogleGenAI({
  apiKey: "AIzaSyBcb6yNhJPRoc2YC_CVpaiB-FTzUj_4VD0",
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
            text: "Identify the transaction type and ONLY extract the information that is needed to create that transaction in Netsuite. Return the data in JSON format",
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

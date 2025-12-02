import express from 'express';
import cors from 'cors';
import fs from 'fs';
import { extractInvoiceData } from './invoice_reader.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ✅ Log every incoming request (method, path, IP, and timestamp)
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} from ${req.ip}`);
  next();
});

app.get('/', (req, res) => res.send('🚀 Node OCR API is running!'));

app.post('/parse', async (req, res) => {
  try {
    const { fileData, fileName } = req.body;
    if (!fileData || !fileName)
      return res.status(400).json({ success: false, error: 'Missing fileData or fileName' });

    // ✅ Log file details
    console.log(`📦 Received file: ${fileName}, size: ${fileData.length} bytes`);

    const tempPath = `./temp_${Date.now()}_${fileName}`;
    fs.writeFileSync(tempPath, Buffer.from(fileData, 'base64'));

    const invoiceData = await extractInvoiceData(tempPath);
    fs.unlinkSync(tempPath);

    console.log(`✅ Successfully processed invoice: ${fileName}`);
    res.json({ success: true, invoiceData });
  } catch (err) {
    console.error('❌ Parse Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));

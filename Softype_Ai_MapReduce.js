/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 */
define(['N/search', 'N/file', 'N/https', 'N/log', 'N/record', 'N/runtime'], (search, file, https, log, record, runtime) => {

  const TARGET_PATH = "SuiteScripts/Pdf's/Unprocessed";
  const NODE_API_URL = 'https://nodeocr-1e73.onrender.com/parse';

  function getFolderIdByPath(path) {
    const folders = path.split('/');
    let parentId = null;

    for (let i = 0; i < folders.length; i++) {
      const name = folders[i];
      const folderSearch = search.create({
        type: 'folder',
        filters: [
          ['name', 'is', name],
          parentId ? 'AND' : null,
          parentId ? ['parent', 'anyof', parentId] : null
        ].filter(Boolean),
        columns: ['internalid']
      });

      const res = folderSearch.run().getRange({ start: 0, end: 1 });
      if (res && res.length > 0) {
        parentId = res[0].getValue('internalid');
      } else {
        throw new Error(`Folder not found: ${name}`);
      }
    }

    return parentId;
  }

  function getInputData() {
    const folderId = getFolderIdByPath(TARGET_PATH);
    log.audit('Resolved Folder ID', folderId);

    const fileSearch = search.create({
      type: 'file',
      filters: [['folder', 'is', folderId], 'AND', ['filetype', 'is', 'PDF']],
      columns: ['internalid', 'name']
    });

    const results = [];
    fileSearch.run().each((r) => {
      results.push({ id: r.getValue('internalid'), name: r.getValue('name') });
      return true;
    });

    log.debug("Results", results);
    return results.slice(0, 5); // process 5 files per run
  }

  function map(context) {
    const fileInfo = JSON.parse(context.value);
    const pdfFile = file.load({ id: fileInfo.id });
    const base64Data = pdfFile.getContents();

    const payload = { fileName: pdfFile.name, fileData: base64Data };

    log.debug("Payload", payload);

    try {
      const response = https.post({
        url: NODE_API_URL,
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.code === 200 && response.body) {
        const parsedResponse = JSON.parse(response.body);
        context.write({ key: fileInfo.id, value: parsedResponse });
      } else {
        log.error('Node API Error', `File ${fileInfo.name} - HTTP ${response.code}`);
      }
    } catch (err) {
      log.error('Map Error', err);
    }
  }

  function reduce(context) {
    try {
      const parsedResponse = JSON.parse(context.values[0]);
      let raw = parsedResponse.transactionData;
      raw = raw.replace(/```json|```/g, '').trim();
      const transactionData = JSON.parse(raw);

      log.audit('Processed Transaction', transactionData.transaction_type);
      log.debug("transactionData", transactionData);

      const keyExists = (obj, key) => {
        if (obj === null || typeof obj !== 'object') return false;
        if (key in obj) return true;
        return Object.values(obj).some(value => keyExists(value, key));
      };

      const transactionCustomRecord = record.create({
        type: "customrecord_inv_custom_record",
        isDynamic: true
      })

      transactionCustomRecord.setValue({
        fieldId: 'name',
        value: `Transaction - ${transactionData.transaction_type} - ${new Date().toISOString()}`
      })

      transactionCustomRecord.setValue({
        fieldId:'custrecord_payload',
        value: JSON.stringify(transactionData)
      })

      const transactionCustomRecordId = transactionCustomRecord.save({
        enableSourcing: true,
        ignoreMandatoryFields: false
      })

      log.audit('Custom Record Created', `ID: ${transactionCustomRecordId}`);

      log.debug('runtime.getCurrentScript().getRemainingUsage()', runtime.getCurrentScript().getRemainingUsage())

      // if (transactionData.transaction_type.toLowerCase().includes("invoice")) {
      //   const invoiceCustomRecord = record.create({
      //     type: 'customrecord_inv_custom_record',
      //     isDynamic: true
      //   });

      //   const bodyData = transactionData?.netsuite_transaction_data?.body || {};
      //   const lineItems = transactionData?.netsuite_transaction_data?.items || [];

      //   // 1. Invoice Form
      //   // if (keyExists(transactionData, 'transaction_type')) {
      //   //   invoiceCustomRecord.setText({
      //   //     fieldId: 'custrecord_invoice_custom_form',
      //   //     text: transactionData.transaction_type
      //   //   });
      //   // }
      //   function generate10DigitNumber() {
      //     return Math.floor(1000000000 + Math.random() * 9000000000);
      //   }

      //   if (keyExists(bodyData, 'tranId')){
      //     invoiceCustomRecord.setValue({
      //       fieldId:'name',
      //       value: bodyData.tranId
      //     })
      //   }else{
      //     invoiceCustomRecord.setValue({
      //       fieldId:'name',
      //       value: generate10DigitNumber()
      //     })
      //   }

      //   // 2. Customer
      //   if (keyExists(bodyData, 'entity')) {
      //     invoiceCustomRecord.setText({
      //       fieldId: 'custrecord_customer',
      //       text: bodyData.entity
      //     });
      //   }

      //   // 3. Date
      //   if (keyExists(bodyData, 'tranDate')) {
      //     invoiceCustomRecord.setValue({
      //       fieldId: 'custrecord_inv_date',
      //       value: new Date(bodyData.tranDate)
      //     });
      //   }

      //   // 4. Subsidiary
      //   if (keyExists(bodyData, 'subsidiary')) {
      //     invoiceCustomRecord.setText({
      //       fieldId: 'custrecord_inv_subsidiary',
      //       text: bodyData.subsidiary
      //     });
      //   }

      //   // 5. Location
      //   if (keyExists(bodyData, 'location')) {
      //     invoiceCustomRecord.setText({
      //       fieldId: 'custrecord_inv_location',
      //       text: bodyData.location
      //     });
      //   }

      //   // Save parent record
      //   const parentRecId = invoiceCustomRecord.save({
      //     enableSourcing: true,
      //     ignoreMandatoryFields: false
      //   });

      //   log.audit('Parent Record Created', `Internal ID: ${parentRecId}`);

      //   // Create child item records
      //   lineItems.forEach((itemLine, index) => {
      //     try {
      //       const childRec = record.create({
      //         type: 'customrecord_item_inv_child',
      //         isDynamic: true
      //       });

      //       childRec.setValue({
      //         fieldId: 'name',
      //         value: generate10DigitNumber()
      //       })

      //       if (keyExists(itemLine, 'item')) {
      //         childRec.setText({
      //           fieldId: 'custrecord_item_inv_id',
      //           text: itemLine.item
      //         });
      //       }

      //       if (keyExists(itemLine, 'quantity')) {
      //         childRec.setValue({
      //           fieldId: 'custrecord_item_qty',
      //           value: itemLine.quantity
      //         });
      //       }

      //       if (keyExists(itemLine, 'rate')) {
      //         childRec.setValue({
      //           fieldId: 'custrecord_item_rate',
      //           value: itemLine.rate
      //         });
      //       }

      //       // Link child to parent
      //       childRec.setValue({
      //         fieldId: 'custrecord1395', // field linking to parent
      //         value: parentRecId
      //       });

      //       const childId = childRec.save({
      //         enableSourcing: true,
      //         ignoreMandatoryFields: false
      //       });

      //       log.debug(`Child Record Created`, `Line ${index + 1}, ID: ${childId}`);
      //     } catch (childErr) {
      //       log.error(`Child Record Error (Line ${index + 1})`, childErr);
      //     }
      //   });
      // }

    } catch (e) {
      log.error("Reduce Error", e.message);
    }
  }



  return { getInputData, map, reduce };
});

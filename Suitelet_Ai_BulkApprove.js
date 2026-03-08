/**
 * @NApiVersion 2.1
 * @NScriptType workflowactionscript
 *
 * Workflow Action Script — reads the JSON payload from an Invoice Custom Record
 * and creates the corresponding NetSuite transaction (PO, Invoice, Bill, etc.)
 *
 * Attach this to a workflow on: customrecord_inv_custom_record
 * Trigger it on: an "Approve" button / state transition in the workflow
 */
define(['N/record', 'N/log'], (record, log) => {

  // ── Transaction type → NetSuite record type mapping ───────────────────────
  const TRANSACTION_TYPE_MAP = {
    'purchase order' : record.Type.PURCHASE_ORDER,
    'vendor bill'    : record.Type.VENDOR_BILL,
    'bill'           : record.Type.VENDOR_BILL,
    'invoice'        : record.Type.INVOICE,
    'sales order'    : record.Type.SALES_ORDER,
    'credit memo'    : record.Type.CREDIT_MEMO,
    'estimate'       : record.Type.ESTIMATE
  };

  // ── Sublist name per record type ──────────────────────────────────────────
  // Most transaction types use 'item'; vendor bills can also use 'expense'
  const ITEM_SUBLIST_MAP = {
    [record.Type.PURCHASE_ORDER] : 'item',
    [record.Type.VENDOR_BILL]    : 'item',
    [record.Type.INVOICE]        : 'item',
    [record.Type.SALES_ORDER]    : 'item',
    [record.Type.CREDIT_MEMO]    : 'item',
    [record.Type.ESTIMATE]       : 'item'
  };

  // ─────────────────────────────────────────────────────────────────────────
  function onAction(context) {
    const customRec = context.newRecord;
    const customRecId = customRec.id;

    log.audit('WorkflowAction: onAction triggered', `Custom Record ID: ${customRecId}`);

    // ── 1. Read & parse payload ───────────────────────────────────────────
    const rawPayload = customRec.getValue({ fieldId: 'custrecord_payload' });
    if (!rawPayload) {
      log.error('WorkflowAction', 'No payload found on custom record ' + customRecId);
      return;
    }

    let payload;
    try {
      payload = JSON.parse(rawPayload);
    } catch (e) {
      log.error('WorkflowAction: JSON parse error', e.message + ' | Raw: ' + rawPayload);
      return;
    }

    log.debug('WorkflowAction: parsed payload', JSON.stringify(payload));

    const transactionTypeRaw = (payload.transaction_type || '').toLowerCase().trim();
    const nsRecordType = TRANSACTION_TYPE_MAP[transactionTypeRaw];

    if (!nsRecordType) {
      log.error('WorkflowAction: unknown transaction_type', payload.transaction_type);
      return;
    }

    const itemSublist = ITEM_SUBLIST_MAP[nsRecordType] || 'item';

    // ── 2. Create the transaction ─────────────────────────────────────────
    const txn = record.create({ type: nsRecordType, isDynamic: true });

    // Entity (vendor / customer)
    if (payload.entity) {
      try {
        txn.setText({ fieldId: 'entity', text: payload.entity });
        log.debug('WorkflowAction: set entity', payload.entity);
      } catch (e) {
        log.warn('WorkflowAction: could not set entity', e.message);
      }
    }

    // Transaction date
    if (payload.tranDate) {
      try {
        txn.setValue({ fieldId: 'trandate', value: new Date(payload.tranDate) });
      } catch (e) {
        log.warn('WorkflowAction: could not set trandate', e.message);
      }
    }

    // External ID (the original document number, e.g. PUR00002763)
    if (payload.externalid) {
      try {
        txn.setValue({ fieldId: 'externalid', value: payload.externalid });
      } catch (e) {
        log.warn('WorkflowAction: could not set externalid', e.message);
      }
    }

    // Subsidiary (if present in payload)
    if (payload.subsidiary) {
      try {
        txn.setText({ fieldId: 'subsidiary', text: payload.subsidiary });
      } catch (e) {
        log.warn('WorkflowAction: could not set subsidiary', e.message);
      }
    }

    // Location (if present in payload)
    if (payload.location) {
      try {
        txn.setText({ fieldId: 'location', text: payload.location });
      } catch (e) {
        log.warn('WorkflowAction: could not set location', e.message);
      }
    }

    // ── 3. Add line items ─────────────────────────────────────────────────
    const items = payload.items || [];
    items.forEach((lineItem, idx) => {
      try {
        txn.selectNewLine({ sublistId: itemSublist });

        if (lineItem.item) {
          txn.setCurrentSublistText({ sublistId: itemSublist, fieldId: 'item', text: lineItem.item });
        }
        if (lineItem.quantity != null) {
          txn.setCurrentSublistValue({ sublistId: itemSublist, fieldId: 'quantity', value: Number(lineItem.quantity) });
        }
        if (lineItem.rate != null) {
          txn.setCurrentSublistValue({ sublistId: itemSublist, fieldId: 'rate', value: Number(lineItem.rate) });
        }
        if (lineItem.description) {
          txn.setCurrentSublistValue({ sublistId: itemSublist, fieldId: 'description', value: lineItem.description });
        }

        txn.commitLine({ sublistId: itemSublist });
        log.debug('WorkflowAction: added line ' + (idx + 1), JSON.stringify(lineItem));
      } catch (e) {
        log.error('WorkflowAction: error adding line ' + (idx + 1), e.message);
      }
    });

    // ── 4. Add expense lines (vendor bills) ───────────────────────────────
    const expenses = payload.expenses || [];
    if (expenses.length > 0 && nsRecordType === record.Type.VENDOR_BILL) {
      expenses.forEach((exp, idx) => {
        try {
          txn.selectNewLine({ sublistId: 'expense' });

          if (exp.category) {
            txn.setCurrentSublistText({ sublistId: 'expense', fieldId: 'category', text: exp.category });
          }
          if (exp.account) {
            txn.setCurrentSublistText({ sublistId: 'expense', fieldId: 'account', text: exp.account });
          }
          if (exp.amount != null) {
            txn.setCurrentSublistValue({ sublistId: 'expense', fieldId: 'amount', value: Number(exp.amount) });
          }
          if (exp.memo) {
            txn.setCurrentSublistValue({ sublistId: 'expense', fieldId: 'memo', value: exp.memo });
          }

          txn.commitLine({ sublistId: 'expense' });
          log.debug('WorkflowAction: added expense line ' + (idx + 1), JSON.stringify(exp));
        } catch (e) {
          log.error('WorkflowAction: error adding expense line ' + (idx + 1), e.message);
        }
      });
    }

    // ── 5. Save the transaction ───────────────────────────────────────────
    let newTxnId;
    try {
      newTxnId = txn.save({ enableSourcing: true, ignoreMandatoryFields: false });
      log.audit('WorkflowAction: transaction created', `Type: ${nsRecordType} | ID: ${newTxnId}`);
    } catch (saveErr) {
      log.error('WorkflowAction: save failed', saveErr.message);
      return;
    }

    // ── 6. Stamp the new transaction ID back on the custom record ─────────
    try {
      record.submitFields({
        type: 'customrecord_inv_custom_record',
        id: customRecId,
        values: {
          custrecord_netsuite_txn_id: String(newTxnId),
          custrecord_status: 'Approved'
        },
        options: { enableSourcing: false, ignoreMandatoryFields: true }
      });
      log.audit('WorkflowAction: custom record updated', `Linked to txn ID: ${newTxnId}`);
    } catch (e) {
      log.warn('WorkflowAction: could not stamp txn ID back', e.message);
    }
  }

  return { onAction };
});

/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */
define(['N/ui/serverWidget', 'N/file', 'N/task', 'N/log', 'N/search'], (ui, file, task, log, search) => {

  const TARGET_PATH = "SuiteScripts/Pdf's/Unprocessed";

  const BULK_APPROVE_SCRIPT_ID  = 'customscript_softype_ai_bulk_approve';
  const BULK_APPROVE_DEPLOY_ID  = 'customdeploy_softype_ai_bulk_approve';

  /**
 * Dynamically resolves a folder ID from its full path.
 * Example path: "SuiteScripts/Pdf's/Unprocessed"
 */
function getFolderIdByPath(path) {
  const folders = path.split('/');
  let parentId = null;

  try{
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

    log.debug("res", res)
    if (res && res.length > 0) {
      parentId = res[0].getValue('internalid');
    } else {
      throw new Error(`Folder not found: ${name}`);
    }
  }

  return parentId;
  }catch(e){log.emergency('error', e.error)}
  
}


  function onRequest(context) {
    if (context.request.method === 'GET') {
      const form = ui.createForm({ title: 'AI Invoice Parser' });

      const htmlField = form.addField({
        id: 'custpage_upload_html',
        type: ui.FieldType.INLINEHTML,
        label: 'Upload Files'
      });

      htmlField.defaultValue = `
        <style>
          body { font-family: Arial; }
          #dropzone {
            border: 2px dashed #0070d2;
            border-radius: 10px;
            padding: 40px;
            text-align: center;
            color: #333;
            background: #f9f9f9;
            transition: background 0.3s ease;
          }
          #dropzone.dragover { background: #e3f2fd; }
          #fileInput { display: none; }
          #submitBtn {
            margin-top: 20px;
            background: #0070d2;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 6px;
            cursor: pointer;
          }
          #bulkApproveBtn {
            margin-top: 20px;
            margin-left: 12px;
            background: #2e7d32;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 6px;
            cursor: pointer;
          }
          #bulkApproveBtn:disabled { background: #a5d6a7; cursor: not-allowed; }
        </style>

        <div id="dropzone">
          <h2>Drag & Drop PDFs Here</h2>
          <p>or click to browse</p>
          <input id="fileInput" type="file" name="files" accept="application/pdf" multiple>
        </div>
        <button id="submitBtn" type="button">Upload & Process</button>
        <button id="bulkApproveBtn" type="button">Bulk Approve</button>

        <script>
          const dz = document.getElementById('dropzone');
          const fileInput = document.getElementById('fileInput');
          const submitBtn = document.getElementById('submitBtn');
          let files = [];

          dz.addEventListener('click', () => fileInput.click());
          dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('dragover'); });
          dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
          dz.addEventListener('drop', e => {
            e.preventDefault(); dz.classList.remove('dragover');
            files = Array.from(e.dataTransfer.files);
            dz.innerHTML = '<h3>' + files.length + ' file(s) ready for upload</h3>';
          });
          fileInput.addEventListener('change', e => {
            files = Array.from(e.target.files);
            dz.innerHTML = '<h3>' + files.length + ' file(s) selected</h3>';
          });

          submitBtn.addEventListener('click', () => {
            if (files.length === 0) return alert('Please select at least one PDF.');
            const formData = new FormData();
            files.forEach((f, i) => formData.append('file_' + i, f));

            fetch(window.location.href, { method: 'POST', body: formData })
              .then(r => r.text())
              .then(t => alert(t))
              .catch(err => alert('Upload failed: ' + err));
          });

          const bulkApproveBtn = document.getElementById('bulkApproveBtn');
          bulkApproveBtn.addEventListener('click', () => {
            if (!confirm('Are you sure you want to bulk approve all pending transactions?')) return;
            bulkApproveBtn.disabled = true;
            bulkApproveBtn.textContent = 'Triggering...';

            fetch(window.location.href + '&action=bulkApprove', { method: 'POST', body: new FormData() })
              .then(r => r.text())
              .then(t => {
                alert(t);
                bulkApproveBtn.disabled = false;
                bulkApproveBtn.textContent = 'Bulk Approve';
              })
              .catch(err => {
                alert('Bulk Approve failed: ' + err);
                bulkApproveBtn.disabled = false;
                bulkApproveBtn.textContent = 'Bulk Approve';
              });
          });
        </script>
      `;

      context.response.writePage(form);
    }

    // Handle bulk approve trigger
    else if (context.request.method === 'POST' && context.request.parameters.action === 'bulkApprove') {
      try {
        const mrTask = task.create({
          taskType: task.TaskType.MAP_REDUCE,
          scriptId: BULK_APPROVE_SCRIPT_ID,
          deploymentId: BULK_APPROVE_DEPLOY_ID
        });
        const taskId = mrTask.submit();
        log.audit('Bulk Approve MapReduce Triggered', taskId);
        context.response.write(`✅ Bulk Approve job triggered successfully. Task ID: ${taskId}`);
      } catch (e) {
        log.error('Bulk Approve Error', e);
        context.response.write(`❌ Bulk Approve failed: ${e.message}`);
      }
    }

    // Handle file uploads
    else if (context.request.method === 'POST') {
      try {
        const folderId = getFolderIdByPath(TARGET_PATH);
        log.debug("Folder Id", folderId)
        const uploadedFiles = [];
        const files = context.request.files || {};

        log.debug("files", files)

        Object.keys(files).forEach((k) => {
          const f = files[k];
          f.folder = folderId;
          const fileId = f.save();
          uploadedFiles.push(fileId);
        });

        log.audit('Uploaded to Unprocessed Folder', uploadedFiles);

        // Trigger Map/Reduce
        const mrTask = task.create({
          taskType: task.TaskType.MAP_REDUCE,
          scriptId: 'customscript_softype_ai_mapreduce',
          deploymentId: 'customdeploy_softype_ai_mapreduce'
        });

        const taskId = mrTask.submit();
        log.audit('MapReduce Triggered', taskId);

        context.response.write(`✅ ${uploadedFiles.length} file(s) uploaded and queued for processing.`);
      } catch (e) {
        log.error('Upload Error', e);
        context.response.write(`❌ Upload failed: ${e.message}`);
      }
    }
  }

  return { onRequest };
});

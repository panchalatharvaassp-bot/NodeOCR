/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 *
 * Floating AI Invoice Parser widget — visible on every NetSuite page.
 * Deploy this Client Script to ALL record types.
 *
 * REQUIRED: Update SUITELET_SCRIPT_ID and SUITELET_DEPLOY_ID below
 *           to match your deployed Suitelet's IDs.
 */
define(['N/url'], (url) => {

  const SUITELET_SCRIPT_ID  = 'customscript_softype_ai_suitelet';
  const SUITELET_DEPLOY_ID  = 'customdeploy1';

  // ─── Entry point ──────────────────────────────────────────────────────────

  function pageInit() {
    // Avoid injecting twice (e.g. on dynamic page refreshes)
    console.log('Softype OCR Widget: pageInit triggered');
    if (document.getElementById('softype-ocr-widget')) return;
    console.log('Softype OCR Widget: injecting widget for the first time');
    let suiteletUrl;
    try {
      suiteletUrl = url.resolveScript({
        scriptId: SUITELET_SCRIPT_ID,
        deploymentId: SUITELET_DEPLOY_ID,
        returnExternalUrl: false
      });
    } catch (e) {
      console.error('Softype OCR Widget: could not resolve Suitelet URL', e);
      return;
    }

    injectWidget(suiteletUrl);
  }

  // ─── Widget injection ─────────────────────────────────────────────────────

  function injectWidget(suiteletUrl) {
    const widget = document.createElement('div');
    widget.id = 'softype-ocr-widget';
    widget.innerHTML = getWidgetHTML();
    document.body.appendChild(widget);
    wireEvents(suiteletUrl);
  }

  // ─── HTML template ────────────────────────────────────────────────────────

  function getWidgetHTML() {
    return `
      <style>
        /* ── Container ── */
        #softype-ocr-widget {
          position: fixed;
          bottom: 28px;
          right: 28px;
          z-index: 2147483647;   /* always on top */
          font-family: Arial, sans-serif;
        }

        /* ── FAB button ── */
        #softype-fab {
          width: 54px;
          height: 54px;
          background: #0070d2;
          border-radius: 50%;
          box-shadow: 0 4px 14px rgba(0, 112, 210, 0.45);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 22px;
          color: white;
          user-select: none;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        #softype-fab:hover {
          transform: scale(1.08);
          box-shadow: 0 6px 20px rgba(0, 112, 210, 0.6);
        }

        /* ── Slide-up panel ── */
        #softype-panel {
          display: none;
          flex-direction: column;
          position: absolute;
          bottom: 66px;
          right: 0;
          width: 320px;
          background: #fff;
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
          overflow: hidden;
          animation: softype-slideup 0.2s ease;
        }
        #softype-panel.open { display: flex; }

        @keyframes softype-slideup {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* ── Panel header ── */
        #softype-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #0070d2;
          color: white;
          padding: 12px 16px;
        }
        #softype-header span { font-size: 14px; font-weight: bold; }
        #softype-close {
          cursor: pointer;
          font-size: 18px;
          line-height: 1;
          opacity: 0.85;
        }
        #softype-close:hover { opacity: 1; }

        /* ── Panel body ── */
        #softype-body { padding: 16px; }

        /* ── Drop zone ── */
        #softype-dropzone {
          border: 2px dashed #0070d2;
          border-radius: 8px;
          padding: 28px 16px;
          text-align: center;
          color: #555;
          background: #f4f8fd;
          cursor: pointer;
          transition: background 0.2s, border-color 0.2s;
          font-size: 13px;
        }
        #softype-dropzone.dragover {
          background: #ddeeff;
          border-color: #005fb2;
        }
        #softype-dropzone p { margin: 4px 0; }
        #softype-dropzone .hint { font-size: 11px; color: #888; }
        #softype-file-input { display: none; }

        /* ── File list ── */
        #softype-file-list {
          margin-top: 10px;
          font-size: 12px;
          color: #444;
          max-height: 80px;
          overflow-y: auto;
        }
        #softype-file-list div {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          padding: 2px 0;
        }

        /* ── Submit button ── */
        #softype-submit {
          margin-top: 12px;
          width: 100%;
          background: #0070d2;
          color: white;
          border: none;
          padding: 10px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 13px;
          font-weight: bold;
          transition: background 0.2s;
        }
        #softype-submit:hover:not(:disabled) { background: #005fb2; }
        #softype-submit:disabled { background: #a0b8d0; cursor: not-allowed; }

        /* ── Status bar ── */
        #softype-status {
          margin-top: 10px;
          font-size: 12px;
          color: #333;
          min-height: 18px;
          word-break: break-word;
        }
      </style>

      <!-- FAB trigger -->
      <div id="softype-fab" title="AI Invoice Parser">📄</div>

      <!-- Slide-up panel -->
      <div id="softype-panel">
        <div id="softype-header">
          <span>📄 AI Invoice Parser</span>
          <span id="softype-close" title="Close">✕</span>
        </div>
        <div id="softype-body">
          <div id="softype-dropzone">
            <p><strong>Drag &amp; Drop PDFs here</strong></p>
            <p class="hint">or click to browse</p>
            <input id="softype-file-input" type="file" accept="application/pdf" multiple>
          </div>
          <div id="softype-file-list"></div>
          <button id="softype-submit">Upload &amp; Process</button>
          <div id="softype-status"></div>
        </div>
      </div>
    `;
  }

  // ─── Event wiring ─────────────────────────────────────────────────────────

  function wireEvents(suiteletUrl) {
    const fab       = document.getElementById('softype-fab');
    const panel     = document.getElementById('softype-panel');
    const closeBtn  = document.getElementById('softype-close');
    const dropzone  = document.getElementById('softype-dropzone');
    const fileInput = document.getElementById('softype-file-input');
    const submitBtn = document.getElementById('softype-submit');
    const fileList  = document.getElementById('softype-file-list');
    const status    = document.getElementById('softype-status');

    let selectedFiles = [];

    // Toggle panel open/close
    fab.addEventListener('click', () => panel.classList.toggle('open'));
    closeBtn.addEventListener('click', () => panel.classList.remove('open'));

    // Drag & drop
    dropzone.addEventListener('click', () => fileInput.click());

    dropzone.addEventListener('dragover', e => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', e => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      selectedFiles = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf');
      renderFileList(selectedFiles, dropzone, fileList);
    });

    // Browse
    fileInput.addEventListener('change', e => {
      selectedFiles = Array.from(e.target.files);
      renderFileList(selectedFiles, dropzone, fileList);
    });

    // Upload
    submitBtn.addEventListener('click', () => {
      if (selectedFiles.length === 0) {
        status.textContent = '⚠️ Please select at least one PDF.';
        return;
      }

      submitBtn.disabled = true;
      status.textContent = '⏳ Uploading…';

      const formData = new FormData();
      selectedFiles.forEach(f => formData.append('files', f));

      fetch(suiteletUrl, { method: 'POST', body: formData })
        .then(r => r.text())
        .then(msg => {
          status.textContent = msg;
          submitBtn.disabled = false;
          selectedFiles = [];
          fileList.innerHTML = '';
          dropzone.innerHTML = `
            <p><strong>Drag &amp; Drop PDFs here</strong></p>
            <p class="hint">or click to browse</p>
            <input id="softype-file-input" type="file" accept="application/pdf" multiple>
          `;
          // Re-bind file input after DOM replace
          document.getElementById('softype-file-input')
            .addEventListener('change', e2 => {
              selectedFiles = Array.from(e2.target.files);
              renderFileList(selectedFiles, dropzone, fileList);
            });
        })
        .catch(err => {
          status.textContent = '❌ Upload failed: ' + err;
          submitBtn.disabled = false;
        });
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function renderFileList(files, dropzone, fileList) {
    dropzone.querySelector('p').textContent = files.length + ' PDF(s) ready';
    fileList.innerHTML = files
      .map(f => `<div title="${f.name}">📎 ${f.name}</div>`)
      .join('');
  }

  // ─── Export ───────────────────────────────────────────────────────────────

  return { pageInit };
});

// ==UserScript==
// @name         Softype AI Invoice Parser – Floating Widget
// @namespace    softype-ocr-widget
// @version      1.0
// @description  Floating PDF upload widget on every NetSuite page
// @author       Softype
// @match        https://*.app.netsuite.com/*
// @match        https://*.netsuite.com/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────
  // CONFIGURE: Use the INTERNAL Suitelet URL (app.netsuite.com, NOT extforms).
  // This uses your existing NetSuite session → logs appear in Script Execution Log.
  // Format: https://ACCOUNTID.app.netsuite.com/app/site/hosting/scriptlet.nl?script=SCRIPTID&deploy=1
  // Example: https://tstdrv2149584.app.netsuite.com/app/site/hosting/scriptlet.nl?script=1396&deploy=1
  // ─────────────────────────────────────────────────────────────────────────
  const SUITELET_URL = 'PASTE_YOUR_INTERNAL_SUITELET_URL_HERE';
  // ─────────────────────────────────────────────────────────────────────────

  // Don't inject twice on SPA-style navigation
  console.log("Softype OCR Widget: Checking for existing widget...");
  if (document.getElementById('softype-ocr-widget')) return;
  console.log("Softype OCR Widget: No existing widget found, injecting new widget...");

  // ── Styles ───────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    #softype-ocr-widget {
      position: fixed;
      bottom: 28px;
      right: 28px;
      z-index: 2147483647;
      font-family: Arial, sans-serif;
    }
    #softype-fab {
      width: 54px;
      height: 54px;
      background: #0070d2;
      border-radius: 50%;
      box-shadow: 0 4px 14px rgba(0,112,210,0.45);
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
      box-shadow: 0 6px 20px rgba(0,112,210,0.6);
    }
    #softype-panel {
      display: none;
      flex-direction: column;
      position: absolute;
      bottom: 66px;
      right: 0;
      width: 320px;
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.18);
      overflow: hidden;
      animation: softype-slideup 0.2s ease;
    }
    #softype-panel.open { display: flex; }
    @keyframes softype-slideup {
      from { opacity: 0; transform: translateY(12px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    #softype-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #0070d2;
      color: white;
      padding: 12px 16px;
    }
    #softype-header-title { font-size: 14px; font-weight: bold; }
    #softype-close {
      cursor: pointer;
      font-size: 18px;
      line-height: 1;
      opacity: 0.85;
    }
    #softype-close:hover { opacity: 1; }
    #softype-body { padding: 16px; }
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
    #softype-status {
      margin-top: 10px;
      font-size: 12px;
      color: #333;
      min-height: 18px;
      word-break: break-word;
    }
    #softype-url-warning {
      margin-top: 8px;
      font-size: 11px;
      color: #c00;
      display: none;
    }
  `;
  document.head.appendChild(style);

  // ── HTML ─────────────────────────────────────────────────────────────────
  const widget = document.createElement('div');
  widget.id = 'softype-ocr-widget';
  widget.innerHTML = `
    <div id="softype-fab" title="AI Invoice Parser">📄</div>
    <div id="softype-panel">
      <div id="softype-header">
        <span id="softype-header-title">📄 AI Invoice Parser</span>
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
        <div id="softype-url-warning">⚠️ Suitelet URL not configured. Open the userscript and set SUITELET_URL.</div>
      </div>
    </div>
  `;
  document.body.appendChild(widget);

  // ── Elements ──────────────────────────────────────────────────────────────
  const fab        = document.getElementById('softype-fab');
  const panel      = document.getElementById('softype-panel');
  const closeBtn   = document.getElementById('softype-close');
  const dropzone   = document.getElementById('softype-dropzone');
  const fileList   = document.getElementById('softype-file-list');
  const submitBtn  = document.getElementById('softype-submit');
  const status     = document.getElementById('softype-status');
  const urlWarning = document.getElementById('softype-url-warning');

  let selectedFiles = [];

  // Warn immediately if URL is not configured
  if (SUITELET_URL === 'PASTE_YOUR_SUITELET_URL_HERE') {
    urlWarning.style.display = 'block';
    submitBtn.disabled = true;
  }

  // ── Events ────────────────────────────────────────────────────────────────
  fab.addEventListener('click', () => panel.classList.toggle('open'));
  closeBtn.addEventListener('click', () => panel.classList.remove('open'));

  dropzone.addEventListener('click', () => getFileInput().click());
  dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('dragover'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', e => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    selectedFiles = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf');
    renderFiles();
  });

  bindFileInput(document.getElementById('softype-file-input'));

  submitBtn.addEventListener('click', () => {
    if (SUITELET_URL === 'PASTE_YOUR_SUITELET_URL_HERE') return;
    if (selectedFiles.length === 0) {
      status.textContent = '⚠️ Please select at least one PDF.';
      return;
    }

    submitBtn.disabled = true;
    status.textContent = '⏳ Uploading…';

    const formData = new FormData();
    selectedFiles.forEach(f => formData.append('files', f));

    fetch(SUITELET_URL, { method: 'POST', body: formData })
      .then(r => r.text())
      .then(msg => {
        status.textContent = msg;
        submitBtn.disabled = false;
        resetDropzone();
      })
      .catch(err => {
        status.textContent = '❌ Upload failed: ' + err;
        submitBtn.disabled = false;
      });
  });

  // ── Helpers ───────────────────────────────────────────────────────────────
  function getFileInput() { return document.getElementById('softype-file-input'); }

  function bindFileInput(el) {
    el.addEventListener('change', e => {
      selectedFiles = Array.from(e.target.files);
      renderFiles();
    });
  }

  function renderFiles() {
    const firstP = dropzone.querySelector('p');
    if (firstP) firstP.textContent = selectedFiles.length + ' PDF(s) ready';
    fileList.innerHTML = selectedFiles
      .map(f => `<div title="${f.name}">📎 ${f.name}</div>`)
      .join('');
  }

  function resetDropzone() {
    selectedFiles = [];
    fileList.innerHTML = '';
    dropzone.innerHTML = `
      <p><strong>Drag &amp; Drop PDFs here</strong></p>
      <p class="hint">or click to browse</p>
      <input id="softype-file-input" type="file" accept="application/pdf" multiple>
    `;
    bindFileInput(document.getElementById('softype-file-input'));
  }

})();

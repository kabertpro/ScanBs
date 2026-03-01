/* =====================================================
   VeriBs — app.js
   Lógica principal: validación, cámara, OCR, historial
   ===================================================== */

'use strict';

// ── Base de datos de series NO VÁLIDAS ──────────────────
// Cada par [inicio, fin] son rangos de billetes SIN valor legal.
const DATA = {
  "10": [
    ["67250001","67700000"],
    ["69050001","69500000"],
    ["69500001","69950000"],
    ["69950001","70400000"],
    ["70400001","70850000"],
    ["70850001","71300000"],
    ["76310012","85139995"],
    ["86400001","86850000"],
    ["90900001","91350000"],
    ["91800001","92250000"]
  ],
  "20": [
    ["87280145","91646549"],
    ["96650001","97100000"],
    ["99800001","100250000"],
    ["100250001","100700000"],
    ["109250001","109700000"],
    ["110600001","111050000"],
    ["111050001","111500000"],
    ["111950001","112400000"],
    ["112400001","112850000"],
    ["112850001","113300000"],
    ["114200001","114650000"],
    ["114650001","115100000"],
    ["115100001","115550000"],
    ["118700001","119150000"],
    ["119150001","119600000"],
    ["120500001","120950000"]
  ],
  "50": [
    ["77100001","77550000"],
    ["78000001","78450000"],
    ["78900001","96350000"],
    ["96350001","96800000"],
    ["96800001","97250000"],
    ["98150001","98600000"],
    ["104900001","105350000"],
    ["105350001","105800000"],
    ["106700001","107150000"],
    ["107600001","108050000"],
    ["108050001","108500000"],
    ["109400001","109850000"]
  ]
};

// ── Estado global ───────────────────────────────────────
let selectedDenom = '10';     // Denominación activa (modo manual)
let selectedDenomOcr = '10';  // Denominación activa (modo OCR)
let cameraStream = null;      // Referencia al stream de cámara
let history = [];             // Historial de consultas

// ── DOM Refs ────────────────────────────────────────────
const tabs          = document.querySelectorAll('.tab');
const tabContents   = document.querySelectorAll('.tab-content');
const denomBtns     = document.querySelectorAll('.denom-btn');
const serieInput    = document.getElementById('serieInput');
const btnClear      = document.getElementById('btnClear');
const btnVerify     = document.getElementById('btnVerify');
const resultCard    = document.getElementById('resultCard');
const inputHint     = document.getElementById('inputHint');
const btnCamera     = document.getElementById('btnCamera');
const btnCapture    = document.getElementById('btnCapture');
const cameraVideo   = document.getElementById('cameraVideo');
const captureCanvas = document.getElementById('captureCanvas');
const ocrResult     = document.getElementById('ocrResult');
const ocrLoading    = document.getElementById('ocrLoading');
const ocrOutput     = document.getElementById('ocrOutput');
const ocrText       = document.getElementById('ocrText');
const btnVerifyOcr  = document.getElementById('btnVerifyOcr');
const resultCardOcr = document.getElementById('resultCardOcr');
const ocrDenomBtns  = document.querySelectorAll('.denom-mini-btn');
const cameraPlaceholder = document.getElementById('cameraPlaceholder');
const cameraOverlay = document.querySelector('.camera-overlay');
const btnHistory    = document.getElementById('btnHistory');
const historyPanel  = document.getElementById('historyPanel');
const overlay       = document.getElementById('overlay');
const btnCloseHistory = document.getElementById('btnCloseHistory');
const btnClearHistory = document.getElementById('btnClearHistory');
const historyList   = document.getElementById('historyList');
const historyEmpty  = document.getElementById('historyEmpty');

// ── Validación ──────────────────────────────────────────

/**
 * Verifica si un número de serie está en los rangos inválidos.
 * @param {string} denom - '10', '20' o '50'
 * @param {string} serie - Número de serie como string
 * @returns {{ valid: boolean, error: string|null }}
 */
function validateSerie(denom, serie) {
  // Limpiar: quitar espacios y caracteres no numéricos
  const cleaned = serie.replace(/\s/g, '').replace(/[^0-9]/g, '');

  if (!cleaned) return { valid: false, error: 'Ingresa un número de serie.' };
  if (!/^\d+$/.test(cleaned)) return { valid: false, error: 'Solo se permiten dígitos numéricos.' };
  if (cleaned.length < 8 || cleaned.length > 9) {
    return { valid: false, error: 'El número de serie debe tener 8 o 9 dígitos.' };
  }

  const ranges = DATA[denom];
  if (!ranges) return { valid: false, error: 'Denominación no válida.' };

  const num = parseInt(cleaned, 10);

  // Si el número cae dentro de CUALQUIER rango → inválido
  for (const [start, end] of ranges) {
    if (num >= parseInt(start, 10) && num <= parseInt(end, 10)) {
      return { valid: false, error: null, isInRange: true, cleaned };
    }
  }

  return { valid: true, error: null, cleaned };
}

// ── Render de resultado ─────────────────────────────────

function renderResult(container, denom, serie, result) {
  if (result.error) {
    // Error de validación de formato
    showInputError(result.error);
    return;
  }

  clearInputError();

  const isValid = result.valid;
  const html = `
    <div class="result-inner ${isValid ? 'result-valid' : 'result-invalid'}">
      <div class="result-icon">${isValid ? '🟢' : '🔴'}</div>
      <div class="result-status">${isValid ? 'Billete válido' : 'Billete SIN valor legal'}</div>
      <div class="result-meta">Bs${denom} · Serie ${result.cleaned || serie}</div>
    </div>
  `;
  container.innerHTML = html;
  container.className = 'result-card';

  // Vibrar si inválido (móvil)
  if (!isValid && navigator.vibrate) {
    navigator.vibrate([100, 60, 100]);
  }

  // Guardar en historial
  addToHistory(denom, result.cleaned || serie, isValid);
}

// ── Errores de input ────────────────────────────────────

function showInputError(msg) {
  serieInput.classList.add('error');
  serieInput.classList.add('shake');
  inputHint.textContent = msg;
  inputHint.classList.add('error-hint');
  setTimeout(() => serieInput.classList.remove('shake'), 600);
}

function clearInputError() {
  serieInput.classList.remove('error');
  inputHint.textContent = '8–9 dígitos numéricos';
  inputHint.classList.remove('error-hint');
}

// ── Historial ───────────────────────────────────────────

function loadHistory() {
  try {
    const stored = localStorage.getItem('veribs_history');
    history = stored ? JSON.parse(stored) : [];
  } catch {
    history = [];
  }
}

function saveHistory() {
  try {
    localStorage.setItem('veribs_history', JSON.stringify(history.slice(0, 100)));
  } catch { /* storage no disponible */ }
}

function addToHistory(denom, serie, isValid) {
  const entry = {
    denom,
    serie,
    isValid,
    timestamp: new Date().toISOString()
  };
  history.unshift(entry);
  saveHistory();
  renderHistory();
}

function renderHistory() {
  historyList.innerHTML = '';

  if (history.length === 0) {
    historyEmpty.classList.add('visible');
    return;
  }

  historyEmpty.classList.remove('visible');

  history.forEach(entry => {
    const li = document.createElement('li');
    li.className = 'history-item';

    const date = new Date(entry.timestamp);
    const timeStr = date.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
    const dateStr = date.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit' });

    li.innerHTML = `
      <span class="history-dot ${entry.isValid ? 'valid' : 'invalid'}"></span>
      <div class="history-info">
        <div class="history-serie">Bs${entry.denom} · ${entry.serie}</div>
        <div class="history-meta">${entry.isValid ? 'Válido' : 'Sin valor legal'} · ${dateStr} ${timeStr}</div>
      </div>
    `;
    historyList.appendChild(li);
  });
}

// ── Tabs ────────────────────────────────────────────────

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.tab;

    tabs.forEach(t => t.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));

    tab.classList.add('active');
    document.getElementById(`tab${target.charAt(0).toUpperCase() + target.slice(1)}`).classList.add('active');

    // Detener cámara al cambiar de pestaña
    if (target !== 'scanner') stopCamera();
  });
});

// ── Selección de denominación (manual) ─────────────────

denomBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    denomBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedDenom = btn.dataset.value;
    resultCard.innerHTML = '';
    clearInputError();
  });
});

// ── Input serie ─────────────────────────────────────────

serieInput.addEventListener('input', () => {
  clearInputError();
  resultCard.innerHTML = '';
  // Filtrar: solo números
  serieInput.value = serieInput.value.replace(/[^0-9]/g, '');
});

serieInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') btnVerify.click();
});

btnClear.addEventListener('click', () => {
  serieInput.value = '';
  resultCard.innerHTML = '';
  clearInputError();
  serieInput.focus();
});

// ── Verificar (manual) ──────────────────────────────────

btnVerify.addEventListener('click', () => {
  const serie = serieInput.value.trim();
  const result = validateSerie(selectedDenom, serie);
  renderResult(resultCard, selectedDenom, serie, result);
});

// ── Cámara ──────────────────────────────────────────────

async function startCamera() {
  try {
    const constraints = {
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    };

    cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
    cameraVideo.srcObject = cameraStream;
    cameraVideo.classList.add('active');
    cameraPlaceholder.style.display = 'none';
    cameraOverlay.classList.add('active');
    btnCapture.disabled = false;
    btnCamera.textContent = 'Detener Cámara';
    btnCamera.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
      </svg>
      Detener Cámara`;
  } catch (err) {
    handleCameraError(err);
  }
}

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
  cameraVideo.srcObject = null;
  cameraVideo.classList.remove('active');
  cameraPlaceholder.style.display = '';
  cameraOverlay.classList.remove('active');
  btnCapture.disabled = true;
  btnCamera.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>
    Activar Cámara`;
}

function handleCameraError(err) {
  let msg = 'No se pudo acceder a la cámara.';
  if (err.name === 'NotAllowedError') msg = 'Permiso de cámara denegado. Habilítalo en la configuración del navegador.';
  else if (err.name === 'NotFoundError') msg = 'No se encontró ninguna cámara en este dispositivo.';
  else if (err.name === 'NotSupportedError') msg = 'Tu navegador no admite acceso a la cámara.';

  ocrResult.style.display = 'block';
  ocrLoading.style.display = 'none';
  ocrOutput.style.display = 'block';
  ocrText.value = '';
  ocrOutput.querySelector('.input-label').textContent = '⚠️ Error';
  ocrText.placeholder = msg;
}

btnCamera.addEventListener('click', () => {
  if (cameraStream) {
    stopCamera();
  } else {
    startCamera();
  }
});

cameraPlaceholder.addEventListener('click', startCamera);

// ── Captura y OCR ───────────────────────────────────────

btnCapture.addEventListener('click', async () => {
  if (!cameraStream) return;

  // Dibujar frame en canvas
  const video = cameraVideo;
  captureCanvas.width  = video.videoWidth  || 1280;
  captureCanvas.height = video.videoHeight || 720;
  const ctx = captureCanvas.getContext('2d');
  ctx.drawImage(video, 0, 0);

  // Convertir a dataURL
  const imageData = captureCanvas.toDataURL('image/jpeg', 0.92);

  // Mostrar loading
  ocrResult.style.display = 'block';
  ocrLoading.style.display = 'flex';
  ocrOutput.style.display = 'none';
  resultCardOcr.innerHTML = '';

  try {
    // Verificar que Tesseract.js está disponible
    if (typeof Tesseract === 'undefined') {
      throw new Error('Tesseract.js no disponible. Verifica tu conexión a internet.');
    }

    // Realizar OCR — solo dígitos para mayor precisión
    const { data: { text } } = await Tesseract.recognize(imageData, 'eng', {
      tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz ',
      logger: () => {}
    });

    // Extraer posibles números de serie (8-9 dígitos consecutivos)
    const matches = text.match(/\d{8,9}/g);
    const bestGuess = matches ? matches[0] : text.replace(/[^0-9]/g, '').slice(0, 9);

    ocrLoading.style.display = 'none';
    ocrOutput.style.display = 'flex';
    ocrOutput.querySelector('.input-label').textContent = 'Texto detectado (editable)';
    ocrText.value = bestGuess;
    ocrText.focus();
  } catch (err) {
    ocrLoading.style.display = 'none';
    ocrOutput.style.display = 'flex';
    ocrOutput.querySelector('.input-label').textContent = '⚠️ Error OCR';
    ocrText.placeholder = err.message || 'Error al procesar la imagen. Intenta de nuevo.';
    ocrText.value = '';
  }
});

// ── Selección denominación OCR ──────────────────────────

ocrDenomBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    ocrDenomBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedDenomOcr = btn.dataset.val;
    resultCardOcr.innerHTML = '';
  });
});

// ── Verificar OCR ───────────────────────────────────────

btnVerifyOcr.addEventListener('click', () => {
  const serie = ocrText.value.trim();
  const result = validateSerie(selectedDenomOcr, serie);

  if (result.error) {
    ocrText.classList.add('error', 'shake');
    setTimeout(() => ocrText.classList.remove('shake'), 600);
    resultCardOcr.innerHTML = `<div class="result-inner result-invalid"><div class="result-icon">⚠️</div><div class="result-status">${result.error}</div></div>`;
    return;
  }

  ocrText.classList.remove('error');
  renderResult(resultCardOcr, selectedDenomOcr, serie, result);
});

// ── Historial Panel ─────────────────────────────────────

function openHistory() {
  historyPanel.classList.add('open');
  overlay.classList.add('active');
  renderHistory();
}

function closeHistory() {
  historyPanel.classList.remove('open');
  overlay.classList.remove('active');
}

btnHistory.addEventListener('click', openHistory);
btnCloseHistory.addEventListener('click', closeHistory);
overlay.addEventListener('click', closeHistory);

btnClearHistory.addEventListener('click', () => {
  history = [];
  saveHistory();
  renderHistory();
});

// ── PWA: Registro del Service Worker ───────────────────

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js')
      .then(reg => console.log('[SW] Registrado:', reg.scope))
      .catch(err => console.warn('[SW] Error:', err));
  });
}

// ── Init ────────────────────────────────────────────────

loadHistory();
renderHistory();
serieInput.focus();

import { getSelectionRangeState } from './selection-range-facade.js';

var CAPTURE_INTERVAL_MS = 300;
var RECORDING_PHASE = {
  idle: 'idle',
  recording: 'recording',
  paused: 'paused',
  rendering: 'rendering',
};
var RECORDING_OVERLAY_TEXT = 'Made with MetaCells';
var RECORDING_INPUT_SETTLE_MS = 220;
var FRAME_SIGNATURE_SIZE = 16;
var gifWorkerUrl = new URL(
  '../../../../node_modules/gif.js/dist/gif.worker.js',
  import.meta.url,
).toString();
var recorderLibsPromise = null;

function loadRecorderLibs() {
  if (!recorderLibsPromise) {
    recorderLibsPromise = Promise.all([
      import('html2canvas'),
      import('gif.js'),
    ]).then(function (modules) {
      return {
        html2canvas: modules[0] && modules[0].default ? modules[0].default : modules[0],
        GIF: modules[1] && modules[1].default ? modules[1].default : modules[1],
      };
    });
  }
  return recorderLibsPromise;
}

function getRecordingBounds(app) {
  var selectionRange = getSelectionRangeState(app);
  if (
    !app ||
    !selectionRange ||
    (selectionRange.startCol === selectionRange.endCol &&
      selectionRange.startRow === selectionRange.endRow)
  ) {
    return null;
  }
  var startId = app.formatCellId(selectionRange.startCol, selectionRange.startRow);
  var endId = app.formatCellId(selectionRange.endCol, selectionRange.endRow);
  var startInput = app.inputById && app.inputById[startId];
  var endInput = app.inputById && app.inputById[endId];
  if (!startInput || !endInput) return null;
  var startCell = startInput.parentElement;
  var endCell = endInput.parentElement;
  if (!startCell || !endCell || !app.tableWrap) return null;
  var wrapRect = app.tableWrap.getBoundingClientRect();
  var startRect = startCell.getBoundingClientRect();
  var endRect = endCell.getBoundingClientRect();
  var viewportLeft = startRect.left - wrapRect.left;
  var viewportTop = startRect.top - wrapRect.top;
  var width = endRect.right - startRect.left;
  var height = endRect.bottom - startRect.top;
  if (!(width > 0) || !(height > 0)) return null;
  return {
    captureLeft: viewportLeft,
    captureTop: viewportTop,
    overlayLeft: viewportLeft + app.tableWrap.scrollLeft,
    overlayTop: viewportTop + app.tableWrap.scrollTop,
    width: width,
    height: height,
  };
}

function hasVisibleRegionSelection(app) {
  if (!app || !app.table) return false;
  var selectionRange = getSelectionRangeState(app);
  if (!selectionRange) return false;
  if (
    selectionRange.startCol === selectionRange.endCol &&
    selectionRange.startRow === selectionRange.endRow
  ) {
    return false;
  }
  return app.table.querySelectorAll('td.selected-range').length > 1;
}

function ensureRecordingOverlay(app) {
  if (app.regionRecordingOverlay || !app.tableWrap) return;
  var overlay = document.createElement('div');
  overlay.className = 'region-recording-overlay';
  overlay.hidden = true;
  overlay.innerHTML =
    "<span class='region-recording-overlay-label'>" +
    RECORDING_OVERLAY_TEXT +
    '</span>' +
    "<span class='region-recording-corner region-recording-corner-tl'></span>" +
    "<span class='region-recording-corner region-recording-corner-tr'></span>" +
    "<span class='region-recording-corner region-recording-corner-bl'></span>" +
    "<span class='region-recording-corner region-recording-corner-br'></span>";
  app.tableWrap.appendChild(overlay);
  app.regionRecordingOverlay = overlay;
}

function syncRecordingOverlay(app) {
  ensureRecordingOverlay(app);
  if (!app.regionRecordingOverlay || !app.tableWrap || app.isReportActive()) return;
  var recording = app.regionRecordingState;
  var isActive = !!(
    recording &&
    (recording.phase === RECORDING_PHASE.recording ||
      recording.phase === RECORDING_PHASE.paused ||
      recording.phase === RECORDING_PHASE.rendering)
  );
  var bounds = isActive && recording && recording.bounds
    ? recording.bounds
    : getRecordingBounds(app);
  if (!bounds || !isActive) {
    app.tableWrap.classList.remove('recording-region-active');
    app.regionRecordingOverlay.hidden = true;
    return;
  }
  app.tableWrap.classList.add('recording-region-active');
  app.regionRecordingOverlay.hidden = false;
  app.regionRecordingOverlay.style.left =
    Math.max(0, Math.round(bounds.overlayLeft)) + 'px';
  app.regionRecordingOverlay.style.top =
    Math.max(0, Math.round(bounds.overlayTop)) + 'px';
  app.regionRecordingOverlay.style.width =
    Math.max(1, Math.round(bounds.width)) + 'px';
  app.regionRecordingOverlay.style.height =
    Math.max(1, Math.round(bounds.height)) + 'px';
}

function getRegionRecordingFilename() {
  return (
    'metacells-region-' +
    new Date().toISOString().replace(/[:.]/g, '-').toLowerCase() +
    '.gif'
  );
}

function getSelectionKey(app) {
  var selectionRange = getSelectionRangeState(app);
  if (
    !app ||
    !selectionRange ||
    (selectionRange.startCol === selectionRange.endCol &&
      selectionRange.startRow === selectionRange.endRow)
  ) {
    return '';
  }
  return [
    String(app.activeSheetId || ''),
    String(selectionRange.startCol || 0),
    String(selectionRange.startRow || 0),
    String(selectionRange.endCol || 0),
    String(selectionRange.endRow || 0),
  ].join(':');
}

function revokeRecordingUrl(app) {
  if (!app.regionRecordingGifUrl) return;
  URL.revokeObjectURL(app.regionRecordingGifUrl);
  app.regionRecordingGifUrl = '';
}

function clearReadyRecordingResult(app) {
  revokeRecordingUrl(app);
  app.regionRecordingResultSelectionKey = '';
  app.regionRecordingDownloadReady = false;
}

function markRecordingDirty(app, delayMs) {
  var recording = app.regionRecordingState;
  if (!recording) return;
  recording.dirty = true;
  if (delayMs && delayMs > 0) {
    recording.blockedUntil = Date.now() + delayMs;
  }
}

function downloadRecordingUrl(app) {
  if (!app.regionRecordingGifUrl) return;
  if (app.regionRecordingDownloadReady !== true) {
    return;
  }
  var link = document.createElement('a');
  link.href = app.regionRecordingGifUrl;
  link.download = app.regionRecordingFilename || getRegionRecordingFilename();
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function getElapsedRecordingMs(recording) {
  if (!recording) return 0;
  var elapsed = Number(recording.elapsedMs || 0);
  if (recording.phase === RECORDING_PHASE.recording && recording.startedAt) {
    elapsed += Date.now() - recording.startedAt;
  }
  return Math.max(0, elapsed);
}

function formatElapsedSeconds(recording) {
  return String(Math.floor(getElapsedRecordingMs(recording) / 1000)) + 's';
}

function startElapsedTimer(app) {
  stopElapsedTimer(app);
  app.regionRecordingTimerId = window.setInterval(function () {
    app.syncRegionRecordingControls();
  }, 1000);
}

function stopElapsedTimer(app) {
  if (!app.regionRecordingTimerId) return;
  window.clearInterval(app.regionRecordingTimerId);
  app.regionRecordingTimerId = null;
}

function markRecordingPaused(recording) {
  if (!recording || recording.phase !== RECORDING_PHASE.recording) return;
  recording.elapsedMs = getElapsedRecordingMs(recording);
  recording.startedAt = 0;
  recording.phase = RECORDING_PHASE.paused;
}

function markRecordingActive(recording) {
  if (!recording || recording.phase !== RECORDING_PHASE.paused) return;
  recording.startedAt = Date.now();
  recording.phase = RECORDING_PHASE.recording;
}

function buildFrameSignature(canvas) {
  if (!canvas) return '';
  var sampleCanvas = document.createElement('canvas');
  sampleCanvas.width = FRAME_SIGNATURE_SIZE;
  sampleCanvas.height = FRAME_SIGNATURE_SIZE;
  var sampleContext = sampleCanvas.getContext('2d', {
    willReadFrequently: true,
  });
  if (!sampleContext) return '';
  sampleContext.drawImage(
    canvas,
    0,
    0,
    canvas.width,
    canvas.height,
    0,
    0,
    FRAME_SIGNATURE_SIZE,
    FRAME_SIGNATURE_SIZE,
  );
  var data = sampleContext.getImageData(
    0,
    0,
    FRAME_SIGNATURE_SIZE,
    FRAME_SIGNATURE_SIZE,
  ).data;
  var signature = '';
  for (var index = 0; index < data.length; index += 16) {
    signature += String.fromCharCode(
      data[index],
      data[index + 1],
      data[index + 2],
    );
  }
  return signature;
}

async function renderSelectionFrameCanvas(app, bounds) {
  var libs = await loadRecorderLibs();
  return libs.html2canvas(app.tableWrap, {
    backgroundColor: '#ffffff',
    logging: false,
    scale: 1,
    useCORS: true,
    x: Math.max(0, Math.round(bounds.captureLeft)),
    y: Math.max(0, Math.round(bounds.captureTop)),
    width: Math.max(1, Math.round(bounds.width)),
    height: Math.max(1, Math.round(bounds.height)),
    scrollX: 0,
    scrollY: 0,
  });
}

function startGifRender(app, recording, shouldDownload) {
  if (!recording || recording.phase === RECORDING_PHASE.rendering || !recording.gif) return;
  stopElapsedTimer(app);
  clearCaptureTimer(recording);
  recording.phase = RECORDING_PHASE.rendering;
  recording.stopRequested = null;
  app.syncRegionRecordingControls();
  recording.gif.on('finished', function (blob) {
    revokeRecordingUrl(app);
    app.regionRecordingFilename =
      recording.filename || getRegionRecordingFilename();
    app.regionRecordingGifUrl = URL.createObjectURL(blob);
    app.regionRecordingResultSelectionKey = String(recording.selectionKey || '');
    app.regionRecordingDownloadReady = true;
    app.regionRecordingState = null;
    app.syncRegionRecordingControls();
  });
  recording.gif.render();
}

async function captureRecordingFrame(app) {
  var recording = app.regionRecordingState;
  if (
    !recording ||
    recording.phase !== RECORDING_PHASE.recording ||
    recording.capturePending ||
    !recording.bounds ||
    !recording.gif
  ) {
    return;
  }
  recording.capturePending = true;
  try {
    var frameCanvas = await renderSelectionFrameCanvas(app, recording.bounds);
    if (recording.skipPendingFrame || recording.phase === RECORDING_PHASE.rendering) {
      return;
    }
    var frameSignature = buildFrameSignature(frameCanvas);
    if (frameSignature && frameSignature === recording.lastFrameSignature) {
      recording.dirty = false;
      return;
    }
    recording.gif.addFrame(frameCanvas, {
      delay: CAPTURE_INTERVAL_MS,
      copy: true,
    });
    recording.frameCount += 1;
    recording.lastFrameSignature = frameSignature;
    recording.dirty = false;
    app.syncRegionRecordingControls();
  } finally {
    recording.capturePending = false;
    if (recording.stopRequested != null && recording.phase !== RECORDING_PHASE.rendering) {
      finalizeRecording(app, recording.stopRequested);
    }
  }
}

function finalizeRecording(app, shouldDownload) {
  var recording = app.regionRecordingState;
  if (!recording || recording.phase === RECORDING_PHASE.rendering) return;
  clearCaptureTimer(recording);
  if (recording.intervalId) {
    window.clearInterval(recording.intervalId);
    recording.intervalId = null;
  }
  if (recording.phase === RECORDING_PHASE.recording) {
    recording.elapsedMs = getElapsedRecordingMs(recording);
    recording.startedAt = 0;
  }
  if (recording.capturePending) {
    if (recording.frameCount > 0) {
      recording.phase = RECORDING_PHASE.paused;
      recording.skipPendingFrame = true;
      startGifRender(app, recording, shouldDownload);
      return;
    }
    recording.phase = RECORDING_PHASE.paused;
    recording.stopRequested = shouldDownload;
    app.syncRegionRecordingControls();
    return;
  }
  stopElapsedTimer(app);
  if (!recording.frameCount) {
    recording.gif.abort();
    app.regionRecordingState = null;
    app.syncRegionRecordingControls();
    return;
  }
  startGifRender(app, recording, shouldDownload);
}

function clearCaptureTimer(recording) {
  if (!recording || !recording.captureTimerId) return;
  window.clearTimeout(recording.captureTimerId);
  recording.captureTimerId = null;
}

function scheduleNextCapture(app) {
  var recording = app.regionRecordingState;
  if (!recording || recording.phase !== RECORDING_PHASE.recording) return;
  clearCaptureTimer(recording);
  recording.captureTimerId = window.setTimeout(function () {
    var nextRecording = app.regionRecordingState;
    if (!nextRecording || nextRecording.phase !== RECORDING_PHASE.recording) {
      return;
    }
    if (nextRecording.capturePending) {
      scheduleNextCapture(app);
      return;
    }
    if (nextRecording.blockedUntil && Date.now() < nextRecording.blockedUntil) {
      scheduleNextCapture(app);
      return;
    }
    if (nextRecording.dirty !== true) {
      scheduleNextCapture(app);
      return;
    }
    captureRecordingFrame(app)
      .catch(function () {
        stopElapsedTimer(app);
        app.regionRecordingState = null;
        app.syncRegionRecordingControls();
      })
      .finally(function () {
        scheduleNextCapture(app);
      });
  }, CAPTURE_INTERVAL_MS);
}

function handleRecordControlClick(app) {
  var recording = app.regionRecordingState;
  if (!recording) {
    startRegionRecording(app);
    return;
  }
  if (recording.phase === RECORDING_PHASE.recording) {
    pauseRegionRecording(app);
    return;
  }
  if (recording.phase === RECORDING_PHASE.paused) {
    stopRegionRecording(app);
  }
}

export function toggleRegionRecordingControl(app) {
  handleRecordControlClick(app);
}

export function setupRegionRecordingControls(app) {
  ensureRecordingOverlay(app);
  if (!app.regionRecordingRuntimeBound && app.tableWrap) {
    var markUiDirty = function () {
      markRecordingDirty(app);
    };
    var markInputDirty = function () {
      markRecordingDirty(app, RECORDING_INPUT_SETTLE_MS);
    };
    app.tableWrap.addEventListener('scroll', markUiDirty, { passive: true });
    app.tableWrap.addEventListener('pointerup', markUiDirty);
    app.tableWrap.addEventListener('input', markInputDirty, true);
    app.tableWrap.addEventListener('keydown', markInputDirty, true);
    app.tableWrap.addEventListener('keyup', markInputDirty, true);
    app.regionRecordingRuntimeBound = true;
  }
  if (app.useReactShellControls) {
    app.syncRegionRecordingControls();
    return;
  }
  if (app.recordRegionButton) {
    app.recordRegionButton.addEventListener('click', function () {
      handleRecordControlClick(app);
    });
  }
  if (app.downloadRegionRecordingButton) {
    app.downloadRegionRecordingButton.addEventListener('click', function () {
      downloadRegionRecording(app);
    });
  }
  app.syncRegionRecordingControls();
}

export function syncRegionRecordingControls(app) {
  if (!app.regionRecordingCluster) return;
  var hasRegionSelection = hasVisibleRegionSelection(app);
  var recording = app.regionRecordingState;
  var phase = recording ? recording.phase : RECORDING_PHASE.idle;
  var currentSelectionKey = getSelectionKey(app);
  var lastSelectionKey = String(app.regionRecordingLastSelectionKey || '');
  if (
    phase === RECORDING_PHASE.idle &&
    currentSelectionKey !== lastSelectionKey &&
    app.regionRecordingGifUrl
  ) {
    clearReadyRecordingResult(app);
  }
  app.regionRecordingLastSelectionKey = currentSelectionKey;
  var hasDownload =
    app.regionRecordingDownloadReady === true &&
    !!app.regionRecordingGifUrl;
  var shouldShow =
    !app.isReportActive() &&
    (hasRegionSelection || phase !== RECORDING_PHASE.idle || hasDownload);

  app.regionRecordingCluster.hidden = !shouldShow;
  app.regionRecordingCluster.style.display = shouldShow ? '' : 'none';

  if (app.recordRegionButton) {
    var isRendering = phase === RECORDING_PHASE.rendering;
    var canInteract = hasRegionSelection || phase !== RECORDING_PHASE.idle;
    var label = 'Record';
    var title = 'Record selected region';
    if (phase === RECORDING_PHASE.recording) {
      label = 'Pause ' + formatElapsedSeconds(recording);
      title = 'Pause recording';
    } else if (phase === RECORDING_PHASE.paused) {
      label = 'Stop ' + formatElapsedSeconds(recording);
      title = 'Stop recording';
    } else if (phase === RECORDING_PHASE.rendering) {
      label = 'Rendering';
      title = 'Rendering GIF';
    }
    var showRecordButton =
      !app.isReportActive() &&
      (phase !== RECORDING_PHASE.idle || hasRegionSelection);
    app.recordRegionButton.hidden = !showRecordButton;
    app.recordRegionButton.style.display = showRecordButton
      ? 'inline-flex'
      : 'none';
    app.recordRegionButton.disabled = !canInteract || isRendering;
    app.recordRegionButton.setAttribute('title', title);
    app.recordRegionButton.setAttribute('aria-label', title);
    if (app.regionRecordingButtonLabel) {
      app.regionRecordingButtonLabel.textContent = label;
    } else {
      app.recordRegionButton.textContent = label;
    }
    app.recordRegionButton.setAttribute('data-recording-phase', phase);
  }
  if (app.downloadRegionRecordingButton) {
    var showDownload = hasDownload && phase === RECORDING_PHASE.idle;
    app.downloadRegionRecordingButton.hidden = !showDownload;
    app.downloadRegionRecordingButton.disabled = !showDownload;
    app.downloadRegionRecordingButton.style.display = showDownload
      ? 'inline-flex'
      : 'none';
  }
  syncRecordingOverlay(app);
}

export function startRegionRecording(app) {
  if (app.isReportActive()) return;
  var bounds = getRecordingBounds(app);
  if (!bounds) {
    alert('Select a region first.');
    return;
  }
  var existing = app.regionRecordingState;
  if (existing && existing.phase === RECORDING_PHASE.rendering) return;
  if (existing && existing.phase === RECORDING_PHASE.paused) {
    markRecordingActive(existing);
    existing.dirty = true;
    startElapsedTimer(app);
    app.syncRegionRecordingControls();
    scheduleNextCapture(app);
    return;
  }
  if (existing && existing.phase === RECORDING_PHASE.recording) return;

  clearReadyRecordingResult(app);
  app.regionRecordingFilename = getRegionRecordingFilename();

  loadRecorderLibs().catch(function () {
    app.regionRecordingState = null;
    app.syncRegionRecordingControls();
  });

  var recording = {
    blockedUntil: 0,
    bounds: bounds,
    capturePending: false,
    captureTimerId: null,
    dirty: true,
    elapsedMs: 0,
    filename: app.regionRecordingFilename,
    frameCount: 0,
    gif: null,
    intervalId: null,
    lastFrameSignature: '',
    phase: RECORDING_PHASE.recording,
    selectionKey: getSelectionKey(app),
    skipPendingFrame: false,
    startedAt: Date.now(),
    stopRequested: null,
  };

  app.regionRecordingState = recording;
  startElapsedTimer(app);
  app.syncRegionRecordingControls();
  loadRecorderLibs()
    .then(function (libs) {
      var currentRecording = app.regionRecordingState;
      if (!currentRecording || currentRecording !== recording) return;
      currentRecording.gif = new libs.GIF({
        workers: 2,
        quality: 10,
        workerScript: gifWorkerUrl,
      });
      scheduleNextCapture(app);
    })
    .catch(function () {
      stopElapsedTimer(app);
      app.regionRecordingState = null;
      app.syncRegionRecordingControls();
    });
}

export function pauseRegionRecording(app) {
  var recording = app.regionRecordingState;
  if (!recording || recording.phase !== RECORDING_PHASE.recording) return;
  markRecordingPaused(recording);
  stopElapsedTimer(app);
  clearCaptureTimer(recording);
  app.syncRegionRecordingControls();
}

export function stopRegionRecording(app, shouldDownload) {
  var recording = app.regionRecordingState;
  if (!recording || recording.phase === RECORDING_PHASE.rendering) return;
  finalizeRecording(app, shouldDownload);
}

export function downloadRegionRecording(app) {
  downloadRecordingUrl(app);
}

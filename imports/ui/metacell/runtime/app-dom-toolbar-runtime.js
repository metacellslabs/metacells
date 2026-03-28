export function cacheSpreadsheetToolbarDomRefs(app) {
  app.aiModeButton = document.querySelector('#ai-mode');
  app.aiModePopover = document.querySelector('#ai-mode-popover');
  app.aiModeOptions = Array.prototype.slice.call(
    document.querySelectorAll('.ai-mode-option'),
  );
  app.displayModeButton = document.querySelector('#display-mode');
  app.displayModePopover = document.querySelector('#display-mode-popover');
  app.displayModeOptions = Array.prototype.slice.call(
    document.querySelectorAll('.display-mode-option'),
  );
  app.cellFormatButton = document.querySelector('#cell-format');
  app.cellFormatPopover = document.querySelector('#cell-format-popover');
  app.cellFormatOptions = Array.prototype.slice.call(
    document.querySelectorAll('.cell-format-option'),
  );
  app.cellAlignGroup = document.querySelector('#cell-align');
  app.cellAlignButtons = Array.prototype.slice.call(
    document.querySelectorAll('.cell-align-button'),
  );
  app.cellBordersButton = document.querySelector('#cell-borders');
  app.cellBordersPopover = document.querySelector('#cell-borders-popover');
  app.cellBordersOptions = Array.prototype.slice.call(
    document.querySelectorAll('.cell-borders-option'),
  );
  app.cellBgColorButton = document.querySelector('#cell-bg-color');
  app.cellBgColorSwatch = document.querySelector('#cell-bg-color-swatch');
  app.cellBgColorPopover = document.querySelector('#cell-bg-color-popover');
  app.cellBgColorRecent = document.querySelector('#cell-bg-color-recent');
  app.cellBgColorCustomInput = document.querySelector('#cell-bg-color-custom');
  app.cellFontFamilyButton = document.querySelector('#cell-font-family');
  app.cellFontFamilyPopover = document.querySelector(
    '#cell-font-family-popover',
  );
  app.cellFontFamilyOptions = Array.prototype.slice.call(
    document.querySelectorAll('.cell-font-family-option'),
  );
  app.cellWrapButton = document.querySelector('#cell-wrap');
  app.cellDecimalsDecreaseButton = document.querySelector(
    '#cell-decimals-decrease',
  );
  app.cellDecimalsIncreaseButton = document.querySelector(
    '#cell-decimals-increase',
  );
  app.cellFontSizeDecreaseButton = document.querySelector(
    '#cell-font-size-decrease',
  );
  app.cellFontSizeIncreaseButton = document.querySelector(
    '#cell-font-size-increase',
  );
  app.cellBoldButton = document.querySelector('#cell-bold');
  app.cellItalicButton = document.querySelector('#cell-italic');
  app.regionRecordingCluster = document.querySelector(
    '#region-recording-controls',
  );
  app.recordRegionButton = document.querySelector('#record-region');
  app.regionRecordingButtonLabel = document.querySelector(
    '#record-region-label',
  );
  app.downloadRegionRecordingButton = document.querySelector(
    '#download-region-recording',
  );
}

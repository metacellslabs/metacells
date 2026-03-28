import path from 'node:path';
import {
  printViolationsAndExit,
  readLines,
  relativeFile,
  resolveFiles,
  rootDir,
} from './guard-utils.mjs';

const scanRoots = ['imports'];
const allowedFiles = new Set([
  path.join(rootDir, 'imports/engine/formulas/FILE.js'),
  path.join(rootDir, 'imports/engine/formulas/PDF.js'),
  path.join(rootDir, 'imports/engine/formulas/DOCX.js'),
  path.join(rootDir, 'imports/engine/formula-engine.js'),
  path.join(rootDir, 'imports/engine/workbook-storage-adapter.js'),
  path.join(rootDir, 'imports/engine/formula-engine/fallback-methods.js'),
  path.join(rootDir, 'imports/engine/formula-engine/mention-methods.js'),
  path.join(rootDir, 'imports/engine/formula-engine/ai-methods.js'),
  path.join(rootDir, 'imports/api/sheets/server/compute.js'),
  path.join(rootDir, 'imports/ui/metacell/runtime/index.js'),
  path.join(rootDir, 'imports/ui/metacell/runtime/attachment-cell-facade.js'),
  path.join(rootDir, 'imports/ui/metacell/runtime/attachment-preview-runtime.js'),
  path.join(rootDir, 'imports/ui/metacell/runtime/attachment-upload-runtime.js'),
  path.join(rootDir, 'imports/ui/metacell/runtime/cell-render-model.js'),
  path.join(rootDir, 'imports/ui/metacell/runtime/compute-render-runtime.js'),
  path.join(rootDir, 'imports/ui/metacell/runtime/compute-runtime.js'),
  path.join(rootDir, 'imports/ui/metacell/runtime/editor-controller-runtime.js'),
  path.join(rootDir, 'imports/ui/metacell/runtime/report-linked-input-runtime.js'),
  path.join(rootDir, 'imports/ui/metacell/runtime/report-mention-runtime.js'),
  path.join(rootDir, 'imports/ui/metacell/runtime/compute-support-runtime.js'),
  path.join(rootDir, 'imports/ui/metacell/runtime/cell-actions-runtime.js'),
  path.join(rootDir, 'imports/ui/metacell/runtime/app-methods-dependency-graph.js'),
  path.join(rootDir, 'imports/ui/metacell/runtime/selection-dependency-runtime.js'),
  path.join(rootDir, 'imports/ui/metacell/runtime/selection-runtime.js'),
  path.join(rootDir, 'imports/ui/metacell/runtime/drag-debug-runtime.js'),
  path.join(rootDir, 'imports/ui/app/pages/SheetPage.jsx'),
  path.join(rootDir, 'imports/ui/app/pages/TestPage.jsx'),
  path.join(rootDir, 'imports/api/sheets/formula-test-workbook.js'),
]);

const violations = [];

for (const file of resolveFiles(scanRoots)) {
  if (allowedFiles.has(file)) continue;
  const lines = readLines(file);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (
      !/\bPDF\s*\(/.test(line) &&
      !/\bFILE\s*\(/.test(line) &&
      !line.includes('parseAttachmentSource(')
    ) {
      continue;
    }
    violations.push(`${relativeFile(file)}:${index + 1}: ${line.trim()}`);
  }
}

printViolationsAndExit(
  'Attachment formula handling found outside approved files',
  violations,
  'No attachment formula handling found outside approved files.',
);

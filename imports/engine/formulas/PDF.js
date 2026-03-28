import { defineFormula } from './definition.js';

function normalizePdfFileName(name) {
  const raw = String(name == null ? '' : name).trim();
  if (!raw) return '';
  if (/\.pdf$/i.test(raw)) return raw;
  return raw.replace(/\.[^./\\]+$/, '') + '.pdf';
}

function resolveContentValue(value, helpers) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return helpers.matrixToCsv(helpers.toMatrix(value));
}

export default defineFormula({
  name: 'PDF',
  signature: 'PDF(name, content)',
  summary:
    'Creates a PDF file attachment from content. Equivalent to FILE(name, content, "PDF").',
  examples: ['`=PDF("invoice.pdf", A1)`', '`=PDF("report.pdf", B2)`'],
  execute: ({ args, helpers }) => {
    const name = normalizePdfFileName(
      helpers.firstScalar(args[0]) == null ? '' : helpers.firstScalar(args[0]),
    );
    const content = resolveContentValue(args[1], helpers);

    if (!name) return '';

    return (
      '__ATTACHMENT__:' +
      JSON.stringify({
        name,
        type: 'application/pdf',
        content: String(content == null ? '' : content),
        encoding: 'utf8',
        generated: true,
        generatedAs: 'PDF',
      })
    );
  },
});

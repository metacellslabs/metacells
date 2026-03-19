import { defineFormula } from './definition.js';
import { buildSimplePdfBase64 } from '../pdf-utils.js';

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
    const name = String(
      helpers.firstScalar(args[0]) == null ? '' : helpers.firstScalar(args[0]),
    ).trim();
    const content = resolveContentValue(args[1], helpers);

    if (!name) return '';

    return (
      '__ATTACHMENT__:' +
      JSON.stringify({
        name,
        type: 'application/pdf',
        content: buildSimplePdfBase64(content),
        encoding: 'base64',
        generated: true,
        generatedAs: 'PDF',
      })
    );
  },
});

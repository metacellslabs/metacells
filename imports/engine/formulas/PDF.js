import { defineFormula } from './definition.js';

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
    const content = helpers.firstScalar(args[1]);

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

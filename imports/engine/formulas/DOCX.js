import { defineFormula } from './definition.js';

export default defineFormula({
  name: 'DOCX',
  signature: 'DOCX(name, content)',
  summary:
    'Creates a DOCX file attachment from Markdown content. Equivalent to FILE(name, content, "DOCX_MD").',
  examples: ['`=DOCX("report.docx", A1)`', '`=DOCX("summary.docx", B2)`'],
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
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        content: String(content == null ? '' : content),
        encoding: 'utf8',
        generated: true,
        generatedAs: 'DOCX_MD',
      })
    );
  },
});

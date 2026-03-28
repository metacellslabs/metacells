import { defineFormula } from './definition.js';

function normalizeGeneratedFileName(name, generatedAs) {
  const raw = String(name == null ? '' : name).trim();
  if (!raw) return '';
  const mode = String(generatedAs || '').trim().toUpperCase();
  if (mode === 'PDF') {
    if (/\.pdf$/i.test(raw)) return raw;
    return raw.replace(/\.[^./\\]+$/, '') + '.pdf';
  }
  if (mode === 'DOCX_MD') {
    if (/\.docx$/i.test(raw)) return raw;
    return raw.replace(/\.[^./\\]+$/, '') + '.docx';
  }
  return raw;
}

const MIME_TYPE_MAP = {
  PDF: 'application/pdf',
  DOCX_MD:
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  DOCX: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  TXT: 'text/plain',
  HTML: 'text/html',
  CSV: 'text/csv',
  MD: 'text/markdown',
  MARKDOWN: 'text/markdown',
  JSON: 'application/json',
  XML: 'application/xml',
};

function resolveMimeType(type) {
  const upper = String(type || '')
    .trim()
    .toUpperCase();
  return (
    MIME_TYPE_MAP[upper] ||
    String(type || 'text/plain')
      .trim()
      .toLowerCase() ||
    'text/plain'
  );
}

function resolveGeneratedAs(type) {
  const upper = String(type || '')
    .trim()
    .toUpperCase();
  if (upper === 'PDF') return 'PDF';
  if (upper === 'DOCX_MD' || upper === 'DOCX') return 'DOCX_MD';
  return upper || null;
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
  name: 'FILE',
  signature: 'FILE(name, content, [type])',
  summary: 'Creates a downloadable file attachment from content.',
  examples: [
    '`=FILE("report.txt", A1)`',
    '`=FILE("report.pdf", A1, "PDF")`',
    '`=FILE("report.docx", A1, "DOCX_MD")`',
  ],
  execute: ({ args, helpers }) => {
    const rawName = String(
      helpers.firstScalar(args[0]) == null ? '' : helpers.firstScalar(args[0]),
    ).trim();
    const content = resolveContentValue(args[1], helpers);
    const typeArg = helpers.firstScalar(args[2]);
    const mimeType = resolveMimeType(typeArg);
    const generatedAs = resolveGeneratedAs(typeArg);
    const name = normalizeGeneratedFileName(rawName, generatedAs);

    if (!name) return '';

    const attachment = {
      name,
      type: mimeType,
      content: String(content == null ? '' : content),
      encoding: 'utf8',
      generated: true,
    };

    if (generatedAs) {
      attachment.generatedAs = generatedAs;
    }

    return '__ATTACHMENT__:' + JSON.stringify(attachment);
  },
});

function renderMarkdownToPdfText(value) {
  var text = String(value == null ? '' : value).replace(/\r\n?/g, '\n');
  var lines = text.split('\n');
  var rendered = [];
  var inCodeFence = false;

  for (var i = 0; i < lines.length; i++) {
    var line = String(lines[i] || '');
    if (/^\s*```/.test(line)) {
      inCodeFence = !inCodeFence;
      if (rendered.length && rendered[rendered.length - 1] !== '') {
        rendered.push('');
      }
      continue;
    }

    if (inCodeFence) {
      rendered.push('    ' + line);
      continue;
    }

    if (/^\s*\|/.test(line) && /\|\s*$/.test(line)) {
      var cells = line
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map(function (cell) {
          return String(cell || '').trim();
        });
      var isSeparator = cells.every(function (cell) {
        return /^:?-{3,}:?$/.test(cell);
      });
      if (isSeparator) continue;
      line = cells.join(' | ');
    }

    line = line
      .replace(/^###\s+/, '')
      .replace(/^##\s+/, '')
      .replace(/^#\s+/, '')
      .replace(/^\s*[-*]\s+/, '* ')
      .replace(/^\s*\d+\.\s+/, function (match) {
        return match.trim() + ' ';
      })
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*\n]+)\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/_([^_\n]+)_/g, '$1');

    rendered.push(line);
  }

  return rendered.join('\n');
}

function normalizePdfText(value) {
  return renderMarkdownToPdfText(value)
    .replace(/\r\n?/g, '\n')
    .replace(/[^\x20-\x7E\n\t]/g, '?');
}

function escapePdfText(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

export function buildSimplePdfBase64(content) {
  var normalized = normalizePdfText(content);
  var lines = normalized.split('\n');
  if (!lines.length) lines = [''];

  var contentOps = ['BT', '/F1 12 Tf', '14 TL', '50 742 Td'];
  for (var i = 0; i < lines.length; i++) {
    contentOps.push('(' + escapePdfText(lines[i]) + ') Tj');
    if (i < lines.length - 1) contentOps.push('T*');
  }
  contentOps.push('ET');
  var streamText = contentOps.join('\n');
  var streamLength = Buffer.byteLength(streamText, 'utf8');

  var objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    '5 0 obj\n<< /Length ' +
      String(streamLength) +
      ' >>\nstream\n' +
      streamText +
      '\nendstream\nendobj\n',
  ];

  var pdf = '%PDF-1.4\n';
  var offsets = [0];
  for (var j = 0; j < objects.length; j++) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += objects[j];
  }

  var xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += 'xref\n0 ' + String(objects.length + 1) + '\n';
  pdf += '0000000000 65535 f \n';
  for (var k = 1; k < offsets.length; k++) {
    pdf += String(offsets[k]).padStart(10, '0') + ' 00000 n \n';
  }
  pdf +=
    'trailer\n<< /Size ' +
    String(objects.length + 1) +
    ' /Root 1 0 R >>\nstartxref\n' +
    String(xrefOffset) +
    '\n%%EOF';

  return Buffer.from(pdf, 'utf8').toString('base64');
}

export function parseChannelSendCommand(rawValue) {
  const raw = String(rawValue == null ? '' : rawValue);
  if (!raw) return null;

  const match =
    /^\s*\/([A-Za-z][A-Za-z0-9_-]*):send:(.+?)\s*$/.exec(raw) ||
    /^\s*\/([A-Za-z][A-Za-z0-9_-]*)\s+([\s\S]+?)\s*$/.exec(raw);
  if (!match) return null;

  return {
    label: String(match[1] || '').trim().toLowerCase(),
    message: String(match[2] || '').trim(),
  };
}

export function stripChannelSendAttachmentPlaceholders(text) {
  return String(text == null ? '' : text)
    .replace(/(^|[ \t])<attached image:\s*[^>]+>(?=[ \t]|$)/gim, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .trim();
}

export function stripChannelSendFileAndImagePlaceholders(text) {
  return String(text == null ? '' : text)
    .replace(/(^|[ \t])<attached image:\s*[^>]+>(?=[ \t]|$)/gim, '$1')
    .replace(/(^|[ \t])<attached file:\s*[^>]+>(?=[ \t]|$)/gim, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .trim();
}

export function buildChannelSendBodyFromPreparedPrompt(prepared) {
  const source = prepared && typeof prepared === 'object' ? prepared : {};
  const userContent = source.userContent;

  if (Array.isArray(userContent)) {
    return userContent
      .filter((item) => item && item.type === 'text')
      .map((item) => stripChannelSendAttachmentPlaceholders(item.text || ''))
      .filter(Boolean)
      .join('\n\n')
      .trim();
  }

  if (typeof userContent === 'string' && userContent.trim()) {
    return stripChannelSendAttachmentPlaceholders(userContent);
  }

  return stripChannelSendAttachmentPlaceholders(source.userPrompt || '');
}

export function buildChannelSendAttachmentsFromPreparedPrompt(prepared) {
  const source = prepared && typeof prepared === 'object' ? prepared : {};
  const collected = [];
  const seen = new Set();

  const append = (item, fallbackKind) => {
    if (!item || typeof item !== 'object') return;
    const downloadUrl = String(
      item.downloadUrl || item.previewUrl || item.url || '',
    ).trim();
    const binaryArtifactId = String(item.binaryArtifactId || '').trim();
    if (!downloadUrl && !binaryArtifactId) return;
    const name = String(item.name || fallbackKind || 'attachment').trim();
    const type = String(item.type || '').trim();
    const key = [name, type, binaryArtifactId, downloadUrl].join('::');
    if (seen.has(key)) return;
    seen.add(key);
    collected.push({
      name: name || fallbackKind || 'attachment',
      type,
      binaryArtifactId,
      downloadUrl,
    });
  };

  const imageAttachments = Array.isArray(source.imageAttachments)
    ? source.imageAttachments
    : [];
  imageAttachments.forEach((item) => append(item, 'image'));

  const textAttachments = Array.isArray(source.textAttachments)
    ? source.textAttachments
    : [];
  textAttachments.forEach((item) => append(item, 'file'));

  return collected;
}

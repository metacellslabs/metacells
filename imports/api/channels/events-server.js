import { ChannelEvents } from './events.js';
import { getArtifactBinary } from '../artifacts/index.js';

function decodeDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(
    /^data:([^;,]+)?(?:;charset=[^;,]+)?(;base64)?,(.*)$/i,
  );
  if (!match) return null;
  const mimeType = String(match[1] || 'application/octet-stream');
  const isBase64 = !!match[2];
  const payload = String(match[3] || '');
  try {
    const buffer = isBase64
      ? Buffer.from(payload, 'base64')
      : Buffer.from(decodeURIComponent(payload), 'utf8');
    return { mimeType, buffer };
  } catch (error) {
    return null;
  }
}

function contentDisposition(fileName) {
  const raw = String(fileName || 'attachment').replace(/[\r\n"]/g, '_');
  return `inline; filename="${raw}"`;
}

export function createChannelEventAttachmentMiddleware() {
  return async (req, res, next) => {
    const url = String(req.url || '');
    const match = url.match(
      /^\/channel-events\/([^/]+)\/attachments\/([^/?#]+)/,
    );
    if (!match) {
      next();
      return;
    }

    try {
      const eventId = decodeURIComponent(match[1]);
      const attachmentId = decodeURIComponent(match[2]);
      const eventDoc = await ChannelEvents.findOneAsync({ _id: eventId });
      const attachments = Array.isArray(eventDoc && eventDoc.attachments)
        ? eventDoc.attachments
        : [];
      const attachment = attachments.find((item, index) => {
        const currentId = String(
          item && (item.id || item.attachmentId)
            ? item.id || item.attachmentId
            : `legacy-${index}`,
        );
        return currentId === attachmentId;
      });
      const binary =
        attachment && attachment.binaryArtifactId
          ? await getArtifactBinary(String(attachment.binaryArtifactId || ''))
          : null;
      const legacy =
        !binary && attachment && attachment.downloadUrl
          ? decodeDataUrl(attachment.downloadUrl)
          : null;

      const served = binary || legacy;

      if (!attachment || !served || !served.buffer || !served.buffer.length) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end('Attachment not found');
        return;
      }

      res.statusCode = 200;
      res.setHeader(
        'Content-Type',
        served.mimeType ||
          String(attachment.type || 'application/octet-stream'),
      );
      res.setHeader('Content-Length', String(served.buffer.length));
      res.setHeader('Content-Disposition', contentDisposition(attachment.name));
      res.end(served.buffer);
    } catch (error) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Failed to serve attachment');
    }
  };
}

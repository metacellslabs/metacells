import { Meteor } from 'meteor/meteor';
import { WebApp } from 'meteor/webapp';
import { getArtifactBinary, getArtifactById } from './index.js';

function contentDisposition(fileName) {
  const raw = String(fileName || 'artifact').replace(/[\r\n"]/g, '_');
  return `inline; filename="${raw}"`;
}

export function registerArtifactRoute() {
  if (!Meteor.isServer) return;

  WebApp.rawConnectHandlers.use(async (req, res, next) => {
    const url = String(req.url || '');
    const match = url.match(/^\/artifacts\/([^/?#]+)/);
    if (!match) {
      next();
      return;
    }

    try {
      const artifactId = decodeURIComponent(match[1]);
      const artifact = await getArtifactById(artifactId);
      if (!artifact) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end('Artifact not found');
        return;
      }

      if (artifact.kind === 'text') {
        const body = Buffer.from(String(artifact.text || ''), 'utf8');
        res.statusCode = 200;
        res.setHeader(
          'Content-Type',
          String(artifact.mimeType || 'text/plain; charset=utf-8'),
        );
        res.setHeader('Content-Length', String(body.length));
        res.setHeader(
          'Content-Disposition',
          contentDisposition(artifact.fileName),
        );
        res.end(body);
        return;
      }

      const binary = await getArtifactBinary(artifactId);
      if (!binary || !binary.buffer || !binary.buffer.length) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end('Artifact not found');
        return;
      }

      res.statusCode = 200;
      res.setHeader(
        'Content-Type',
        String(binary.mimeType || 'application/octet-stream'),
      );
      res.setHeader('Content-Length', String(binary.buffer.length));
      res.setHeader('Content-Disposition', contentDisposition(binary.fileName));
      res.end(binary.buffer);
    } catch (error) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Failed to serve artifact');
    }
  });
}

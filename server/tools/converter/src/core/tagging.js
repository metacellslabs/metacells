import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export function normalizeTag(tag) {
  return String(tag).trim().toLowerCase();
}

export function inferDetectedObjects({ fileName, altText = "", extractedText = "" }) {
  const tokens = new Set();
  const combined = `${fileName} ${altText} ${extractedText}`.toLowerCase();

  for (const token of combined.split(/[^a-z0-9]+/u)) {
    if (token.length >= 3) {
      tokens.add(token);
    }
  }

  return [...tokens].slice(0, 12);
}

export function matchTags({ imageTags, fileName, altText = "", extractedText = "", detectedObjects = [] }) {
  const haystack = `${fileName} ${altText} ${extractedText} ${detectedObjects.join(" ")}`.toLowerCase();

  return imageTags
    .map(normalizeTag)
    .filter(Boolean)
    .filter((tag) => haystack.includes(tag));
}

export async function exportImportantImage({ buffer, suggestedFileName, isImportant }) {
  if (!isImportant) {
    return null;
  }

  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "file-converter-"));
  const outputPath = path.join(tempDirectory, suggestedFileName);
  await fs.writeFile(outputPath, buffer);
  return outputPath;
}

import fs from "node:fs/promises";
import path from "node:path";

import exifr from "exifr";
import { imageSize } from "image-size";
import { XMLParser } from "fast-xml-parser";

import { ImageInfo } from "../core/image-info.js";
import { readZipBuffer, listZipFiles, readZipEntries, readZipText } from "../core/archive.js";
import { appendImageText, dedentParagraphs } from "../core/markdown.js";
import { exportImportantImage, inferDetectedObjects, matchTags } from "../core/tagging.js";
import {
  cleanupStructuredText,
  decodeBasicEntities,
  filterSimilarStrings,
  isLikelyNaturalText
} from "../core/text-cleanup.js";

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  preserveOrder: false,
  trimValues: true
});

export async function analyzeImageFile(filePath, imageTags = []) {
  const buffer = await fs.readFile(filePath);
  return analyzeImageBuffer({
    buffer,
    originalPath: path.basename(filePath),
    suggestedFileName: path.basename(filePath),
    imageTags
  });
}

export async function analyzeImageBuffer({
  buffer,
  originalPath,
  suggestedFileName,
  position = null,
  altText = null,
  imageTags = []
}) {
  let dimensions = {};
  let metadata = {};

  try {
    dimensions = imageSize(buffer);
  } catch {
    dimensions = {};
  }

  try {
    const exif = await exifr.parse(buffer, true);
    metadata = normalizeExif(exif);
  } catch {
    metadata = {};
  }

  const detectedObjects = inferDetectedObjects({
    fileName: suggestedFileName,
    altText
  });
  const matchedTags = matchTags({
    imageTags,
    fileName: suggestedFileName,
    altText,
    detectedObjects
  });
  const exportedPath = await exportImportantImage({
    buffer,
    suggestedFileName,
    isImportant: matchedTags.length > 0
  });

  return new ImageInfo({
    originalPath,
    suggestedFileName,
    mimeType: mimeTypeForExtension(path.extname(suggestedFileName).slice(1)),
    isImportant: matchedTags.length > 0,
    matchedTags,
    position,
    altText,
    width: dimensions.width ?? null,
    height: dimensions.height ?? null,
    detectedObjects,
    exportedPath,
    format: dimensions.type ? String(dimensions.type).toUpperCase() : extensionLabel(suggestedFileName),
    metadata,
    extractedText: null
  });
}

export async function extractZipImages({ filePath, prefixes, imageTags = [] }) {
  const zip = await readZipEntries(filePath);
  const entries = listZipFiles(zip, (name) => prefixes.some((prefix) => name.startsWith(prefix)));
  const images = [];

  for (const entry of entries) {
    const buffer = await readZipBuffer(zip, entry.name);
    if (!buffer) {
      continue;
    }

    images.push(
      await analyzeImageBuffer({
        buffer,
        originalPath: path.basename(entry.name),
        suggestedFileName: path.basename(entry.name),
        position: entry.name,
        imageTags
      })
    );
  }

  return images;
}

export async function readZipTextFirst(filePath, entryNames) {
  const zip = await readZipEntries(filePath);
  for (const entryName of entryNames) {
    const text = await readZipText(zip, entryName);
    if (text) {
      return { zip, text, entryName };
    }
  }
  return { zip, text: null, entryName: null };
}

export function xmlTextContent(xml) {
  const parsed = xmlParser.parse(xml);
  const values = [];
  walk(parsed, values);
  return cleanupStructuredText(values.join("\n"), { detectHeadings: false });
}

export function stripRtf(rtf) {
  return dedentParagraphs(
    rtf
      .replace(/\\'[0-9a-f]{2}/giu, " ")
      .replace(/\\par[d]?/gu, "\n")
      .replace(/\\tab/gu, "\t")
      .replace(/\\[a-z]+-?\d* ?/giu, "")
      .replace(/[{}]/gu, "")
  );
}

export function binaryStrings(buffer) {
  const text = buffer.toString("latin1");
  const matches = text.match(/[ -~]{8,}/g) ?? [];
  const filtered = matches
    .map((value) => decodeBasicEntities(value))
    .filter(
      (value) => !value.startsWith("<?xml") && !value.includes("xmlns") && isLikelyNaturalText(value)
    );
  return cleanupStructuredText(filterSimilarStrings([...new Set(filtered)]).join("\n\n"), {
    detectHeadings: false
  });
}

export function wrapConversion({ fileName, markdown, images = [] }) {
  return {
    fileName,
    markdown: appendImageText(dedentParagraphs(markdown), images),
    images
  };
}

function walk(node, values) {
  if (node == null) {
    return;
  }

  if (typeof node === "string") {
    const trimmed = node.trim();
    if (trimmed) {
      values.push(trimmed);
    }
    return;
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      walk(item, values);
    }
    return;
  }

  if (typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if (key.startsWith("@_")) {
        continue;
      }
      walk(value, values);
    }
  }
}

function normalizeExif(exif) {
  if (!exif || typeof exif !== "object") {
    return {};
  }

  const metadata = {};
  if (exif.ColorSpace) {
    metadata.colorSpace = String(exif.ColorSpace);
  }
  if (exif.Orientation) {
    metadata.orientation = exif.Orientation;
  }
  if (exif.XResolution || exif.YResolution) {
    metadata.dpi = Number(exif.XResolution ?? exif.YResolution);
  }
  if (exif.DateTimeOriginal) {
    metadata.creationDate = exif.DateTimeOriginal instanceof Date ? exif.DateTimeOriginal.toISOString() : String(exif.DateTimeOriginal);
  }
  if (exif.ModifyDate) {
    metadata.modificationDate = exif.ModifyDate instanceof Date ? exif.ModifyDate.toISOString() : String(exif.ModifyDate);
  }
  if (exif.Make || exif.Model) {
    metadata.camera = [exif.Make, exif.Model].filter(Boolean).join(" ");
  }
  if (exif.Software) {
    metadata.software = String(exif.Software);
  }
  if (typeof exif.ExifImageWidth === "number" && typeof exif.ExifImageHeight === "number") {
    metadata.pixelSize = `${exif.ExifImageWidth}x${exif.ExifImageHeight}`;
  }
  return metadata;
}

function mimeTypeForExtension(extension) {
  const value = extension.toLowerCase();
  switch (value) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "heic":
    case "heif":
      return "image/heic";
    case "tiff":
    case "tif":
      return "image/tiff";
    case "bmp":
      return "image/bmp";
    case "webp":
      return "image/webp";
    default:
      return value ? `image/${value}` : null;
  }
}

function extensionLabel(fileName) {
  const extension = path.extname(fileName).slice(1);
  return extension ? extension.toUpperCase() : null;
}

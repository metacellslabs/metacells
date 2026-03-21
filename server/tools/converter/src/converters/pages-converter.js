import path from "node:path";

import { ConversionResult } from "../core/conversion-result.js";
import { readZipEntries, listZipFiles, readZipText, readZipBuffer } from "../core/archive.js";
import { cleanupStructuredText, filterSimilarStrings, isLikelyNaturalText, stripHtmlToText } from "../core/text-cleanup.js";
import { binaryStrings, extractZipImages, xmlTextContent } from "./shared.js";

export class PagesConverter {
  async convert({ filePath, imageTags = [] }) {
    const markdown = await extractIWorkText(filePath, "pages");
    const images = await extractZipImages({
      filePath,
      prefixes: ["Data/", "QuickLook/Thumbnail.", "QuickLook/Preview."],
      imageTags
    });

    return new ConversionResult({
      fileName: path.basename(filePath),
      markdown,
      images
    });
  }
}

export async function extractIWorkText(filePath, kind) {
  const zip = await readZipEntries(filePath);

  const previewEntries = listZipFiles(
    zip,
    (name) => name.startsWith("QuickLook/") && (name.endsWith(".txt") || name.endsWith(".html") || name.endsWith(".xml"))
  );
  for (const entry of previewEntries) {
    const text = await readZipText(zip, entry.name);
    if (text) {
      if (entry.name.endsWith(".html")) {
        return stripHtmlToText(text);
      }
      return cleanupStructuredText(entry.name.endsWith(".xml") ? xmlTextContent(text) : text, {
        detectHeadings: false
      });
    }
  }

  const xmlEntries = listZipFiles(
    zip,
    (name) => name.endsWith(".xml") || name.endsWith(".apxl") || name.endsWith(".json")
  );
  const xmlChunks = [];
  for (const entry of xmlEntries) {
    const text = await readZipText(zip, entry.name);
    if (text) {
      xmlChunks.push(
        entry.name.endsWith(".json")
          ? cleanupStructuredText(text, { detectHeadings: false })
          : xmlTextContent(text)
      );
    }
  }
  const combinedXml = cleanupStructuredText(filterSimilarStrings(xmlChunks).join("\n\n"), {
    detectHeadings: false
  });
  if (combinedXml) {
    return combinedXml;
  }

  const iwaEntries = listZipFiles(zip, (name) => name.includes(".iwa"));
  const strings = [];
  for (const entry of iwaEntries) {
    const buffer = await readZipBuffer(zip, entry.name);
    if (buffer) {
      const text = binaryStrings(buffer);
      if (text) {
        strings.push(text);
      }
    }
  }

  const combined = cleanupStructuredText(
    filterSimilarStrings(strings.filter((value) => isLikelyNaturalText(value))).join("\n\n"),
    { detectHeadings: false }
  );
  return combined || `Unable to extract structured text from .${kind} file`;
}

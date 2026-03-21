import path from "node:path";

import pdfParse from "pdf-parse";

import { ConversionResult } from "../core/conversion-result.js";
import { cleanupStructuredText } from "../core/text-cleanup.js";

export class PdfConverter {
  async convert({ filePath }) {
    const data = await pdfParse(await import("node:fs/promises").then((fs) => fs.readFile(filePath)));
    return new ConversionResult({
      fileName: path.basename(filePath),
      markdown: cleanupStructuredText(data.text),
      images: []
    });
  }
}

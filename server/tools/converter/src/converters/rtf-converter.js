import fs from "node:fs/promises";
import path from "node:path";

import { ConversionResult } from "../core/conversion-result.js";
import { stripRtf } from "./shared.js";
import { cleanupStructuredText } from "../core/text-cleanup.js";

export class RtfConverter {
  async convert({ filePath }) {
    const rtf = await fs.readFile(filePath, "utf8");
    return new ConversionResult({
      fileName: path.basename(filePath),
      markdown: cleanupStructuredText(stripRtf(rtf), { detectHeadings: false }),
      images: []
    });
  }
}

import path from "node:path";

import mammoth from "mammoth";

import { ConversionResult } from "../core/conversion-result.js";
import { extractZipImages } from "./shared.js";

export class DocxConverter {
  async convert({ filePath, imageTags = [] }) {
    const { value } = await mammoth.convertToMarkdown({ path: filePath });
    const images = await extractZipImages({ filePath, prefixes: ["word/media/"], imageTags });

    return new ConversionResult({
      fileName: path.basename(filePath),
      markdown: value.trim(),
      images
    });
  }
}

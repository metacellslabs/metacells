import path from "node:path";

import { ConversionResult } from "../core/conversion-result.js";
import { extractZipImages, readZipTextFirst, xmlTextContent } from "./shared.js";

export class OdtConverter {
  async convert({ filePath, imageTags = [] }) {
    const { text } = await readZipTextFirst(filePath, ["content.xml"]);
    const images = await extractZipImages({ filePath, prefixes: ["Pictures/"], imageTags });

    return new ConversionResult({
      fileName: path.basename(filePath),
      markdown: text ? xmlTextContent(text) : "",
      images
    });
  }
}
